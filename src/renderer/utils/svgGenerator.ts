import L from 'leaflet';
import { mergeZoneRings } from './zoneUtils';
import { RenderStyle, Zone, ExportOptions, ColorOverridesState, FeatureStyle } from '../types';
import { getIconSvg } from '../assets/icons';
import { FONT_WEIGHTS, VALID_FONT_FAMILIES, DEFAULT_FONT_FAMILY, type FontFamily } from '../constants/fonts';
import { getFontDataURLs } from './fontLoader';
import { normalizeColor, sanitizeStyle } from './colors';
import {
  resolveStrokeColor, resolveLabelStyle, resolveRailwayStyle, scaleRoadWeight, RAILWAY_DRAW_ORDER,
  isUnderground, applyTunnelStyle, resolveHighwayStyle, resolveWaterwayStyle, getWaterwayWidth,
  WATERWAY_TYPES, areaPaint, AreaPaint, resolveFontFamily,
} from './styleResolvers';
import { getRoadWeight, getRailwayWeight, RoadWeight, ROAD_DRAW_ORDER } from './roadWeights';
import { getDashArray, getCasingDashArray, isCasingHidden } from './lineStyles';
import {
  collectFeatures, areaLabels, getPOIIcon, AreaFeature, LineFeature, LatLon,
  LANDUSE_DRAW_ORDER, NATURAL_DRAW_ORDER, BUILDING_DRAW_ORDER,
} from './features';

type AreaKind = 'landuse' | 'natural' | 'building';

// CSS rule of an area paint, widths and dashes at the export scale
function areaCssRule(selector: string, paint: AreaPaint, scale: number): string {
  const declarations = [`fill: ${paint.fill};`, `fill-opacity: ${paint.fillOpacity};`];
  if (paint.stroke) {
    declarations.push(
      `stroke: ${paint.stroke};`,
      `stroke-width: ${paint.strokeWidth * scale};`,
      `stroke-opacity: ${paint.strokeOpacity};`,
      // Joins and dash ends of the map preview
      `stroke-linecap: ${paint.dashArray ? 'butt' : 'round'};`,
      'stroke-linejoin: round;',
    );
    if (paint.dashArray) declarations.push(`stroke-dasharray: ${paint.dashArray.map(value => value * scale).join(',')};`);
  } else {
    declarations.push('stroke: none;');
  }
  return `    ${selector} {\n${declarations.map(declaration => `      ${declaration}`).join('\n')}\n    }`;
}

// CSS rules of every style of an area kind, shared with the map overlay through areaPaint
function areaCss(style: RenderStyle, kind: AreaKind, keys: readonly string[], scale: number): string {
  return keys.flatMap(key => {
    const paint = areaPaint(style, kind, key);
    return paint ? [areaCssRule(`.${kind}-${key}`, paint, scale)] : [];
  }).join('\n');
}

// CSS rules for the rail base and the ties of every railway type
function railwayCss(style: RenderStyle): string {
  return RAILWAY_DRAW_ORDER.map(type => {
    const railwayStyle = resolveRailwayStyle(style, type);
    // Round ends and joins like roads; dashed parts get flat ends on their path
    return `    .railway-${type}-base {
      fill: none;
      stroke: ${resolveStrokeColor(railwayStyle)};
      stroke-opacity: ${railwayStyle.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .railway-${type}-ties {
      fill: none;
      stroke: ${railwayStyle.color};
      stroke-opacity: ${railwayStyle.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }`;
  }).join('\n');
}

// CSS rules for the casings or the fills of every road level, and of roads in tunnels
// when the style has a tunnel style
function highwayCss(style: RenderStyle, part: 'casing' | 'fill'): string {
  const rule = (selector: string, highwayStyle: FeatureStyle) => {
    const stroke = part === 'casing' ? resolveStrokeColor(highwayStyle) : highwayStyle.color;
    return `    ${selector} {
      fill: none;
      stroke: ${stroke};
      stroke-opacity: ${highwayStyle.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }`;
  };
  return ROAD_DRAW_ORDER.slice().reverse().flatMap(type => {
    const highwayStyle = style.highway[type];
    const rules = [rule(`.highway-${type}-${part}`, highwayStyle)];
    if (style.highwayTunnel) {
      rules.push(rule(`.highway-${type}-${part}.tunnel`, applyTunnelStyle(highwayStyle, style.highwayTunnel)));
    }
    return rules;
  }).join('\n');
}

// CSS rules for every waterway type, and for underground waterways when the style has a tunnel style
function waterwayCss(style: RenderStyle, scale: number): string {
  const rule = (selector: string, waterwayStyle: FeatureStyle, width: number) => `    ${selector} {
      fill: none;
      stroke: ${waterwayStyle.color};
      stroke-width: ${width};
      stroke-opacity: ${waterwayStyle.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }`;
  return WATERWAY_TYPES.flatMap(type => {
    const width = getWaterwayWidth(type) * scale;
    const rules = [rule(`.waterway-${type}`, style.waterway[type], width)];
    if (style.waterwayTunnel) {
      rules.push(rule(`.waterway-${type}.tunnel`, applyTunnelStyle(style.waterway[type], style.waterwayTunnel), width));
    }
    return rules;
  }).join('\n');
}

// Inline style of a road casing or fill path: width, plus the dash pattern of its line style
function roadPathStyle(width: number, dashArray: number[] | null): string {
  return dashArray
    ? `stroke-width:${width};stroke-dasharray:${dashArray.join(',')};stroke-linecap:butt`
    : `stroke-width:${width}`;
}

// Road width at the export scale
function getScaledRoadWeight(highway: string, scale: number): RoadWeight {
  const weight = getRoadWeight(highway);
  return { fill: weight.fill * scale, casing: weight.casing * scale, fontSize: weight.fontSize * scale };
}

// Clip a line segment to a bounding box, returns clipped segment or null if outside
function clipLineSegment(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  // Cohen-Sutherland line clipping algorithm
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;

  const computeCode = (x: number, y: number): number => {
    let code = INSIDE;
    if (x < minX) code |= LEFT;
    else if (x > maxX) code |= RIGHT;
    if (y < minY) code |= TOP;
    else if (y > maxY) code |= BOTTOM;
    return code;
  };

  let code1 = computeCode(x1, y1);
  let code2 = computeCode(x2, y2);

  while (true) {
    if (!(code1 | code2)) {
      // Both inside
      return { x1, y1, x2, y2 };
    }
    if (code1 & code2) {
      // Both outside same region
      return null;
    }

    const codeOut = code1 ? code1 : code2;
    let x: number, y: number;

    if (codeOut & BOTTOM) {
      if (y2 === y1) return null; // Horizontal line outside
      x = x1 + (x2 - x1) * (maxY - y1) / (y2 - y1);
      y = maxY;
    } else if (codeOut & TOP) {
      if (y2 === y1) return null; // Horizontal line outside
      x = x1 + (x2 - x1) * (minY - y1) / (y2 - y1);
      y = minY;
    } else if (codeOut & RIGHT) {
      if (x2 === x1) return null; // Vertical line outside
      y = y1 + (y2 - y1) * (maxX - x1) / (x2 - x1);
      x = maxX;
    } else {
      if (x2 === x1) return null; // Vertical line outside
      y = y1 + (y2 - y1) * (minX - x1) / (x2 - x1);
      x = minX;
    }

    if (codeOut === code1) {
      x1 = x; y1 = y;
      code1 = computeCode(x1, y1);
    } else {
      x2 = x; y2 = y;
      code2 = computeCode(x2, y2);
    }
  }
}

// Clip a polyline to a bounding box, returns array of clipped segments
function clipPolylineToBounds(
  coords: { x: number; y: number }[],
  minX: number, minY: number, maxX: number, maxY: number
): { x: number; y: number }[][] {
  const result: { x: number; y: number }[][] = [];
  let currentSegment: { x: number; y: number }[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const clipped = clipLineSegment(
      coords[i].x, coords[i].y,
      coords[i + 1].x, coords[i + 1].y,
      minX, minY, maxX, maxY
    );

    if (clipped) {
      if (currentSegment.length === 0) {
        currentSegment.push({ x: clipped.x1, y: clipped.y1 });
      } else {
        // Check if this continues the current segment
        const last = currentSegment[currentSegment.length - 1];
        if (Math.abs(last.x - clipped.x1) > 0.1 || Math.abs(last.y - clipped.y1) > 0.1) {
          // Gap - start new segment
          if (currentSegment.length >= 2) {
            result.push(currentSegment);
          }
          currentSegment = [{ x: clipped.x1, y: clipped.y1 }];
        }
      }
      currentSegment.push({ x: clipped.x2, y: clipped.y2 });
    } else if (currentSegment.length >= 2) {
      // Line segment outside - end current segment
      result.push(currentSegment);
      currentSegment = [];
    }
  }

  if (currentSegment.length >= 2) {
    result.push(currentSegment);
  }

  return result;
}

// Get path data for textPath with proper direction for readability
// Now clips to visible bounds so text is positioned within the visible area
function getTextPathData(
  coords: { x: number; y: number }[],
  clipBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): { pathData: string; length: number; midPoint: { x: number; y: number }; coords: { x: number; y: number }[] } | null {
  if (coords.length < 2) return null;

  // If clip bounds provided, clip the polyline to visible area
  let finalCoords = coords;
  if (clipBounds) {
    const clippedSegments = clipPolylineToBounds(
      coords,
      clipBounds.minX, clipBounds.minY, clipBounds.maxX, clipBounds.maxY
    );

    if (clippedSegments.length === 0) return null;

    // Use the longest clipped segment for the label
    let longestSegment = clippedSegments[0];
    let longestLength = 0;

    for (const segment of clippedSegments) {
      let segmentLength = 0;
      for (let i = 1; i < segment.length; i++) {
        const dx = segment[i].x - segment[i - 1].x;
        const dy = segment[i].y - segment[i - 1].y;
        segmentLength += Math.sqrt(dx * dx + dy * dy);
      }
      if (segmentLength > longestLength) {
        longestLength = segmentLength;
        longestSegment = segment;
      }
    }

    finalCoords = longestSegment;
  }

  if (finalCoords.length < 2) return null;

  // Calculate total length
  let totalLength = 0;
  for (let i = 1; i < finalCoords.length; i++) {
    const dx = finalCoords[i].x - finalCoords[i - 1].x;
    const dy = finalCoords[i].y - finalCoords[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  // Check overall direction: if path goes right-to-left, reverse it for readable text
  const firstX = finalCoords[0].x;
  const lastX = finalCoords[finalCoords.length - 1].x;
  const orderedCoords = lastX < firstX ? [...finalCoords].reverse() : finalCoords;

  // Build path data
  const pathParts = [`M ${orderedCoords[0].x.toFixed(2)},${orderedCoords[0].y.toFixed(2)}`];
  for (let i = 1; i < orderedCoords.length; i++) {
    pathParts.push(`L ${orderedCoords[i].x.toFixed(2)},${orderedCoords[i].y.toFixed(2)}`);
  }

  // Calculate midpoint of path (for collision detection)
  let accumulatedLength = 0;
  const halfLength = totalLength / 2;
  let midPoint = { x: orderedCoords[0].x, y: orderedCoords[0].y };

  for (let i = 1; i < orderedCoords.length; i++) {
    const dx = orderedCoords[i].x - orderedCoords[i - 1].x;
    const dy = orderedCoords[i].y - orderedCoords[i - 1].y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (accumulatedLength + segmentLength >= halfLength) {
      // Midpoint is on this segment
      const remaining = halfLength - accumulatedLength;
      const t = remaining / segmentLength;
      midPoint = {
        x: orderedCoords[i - 1].x + dx * t,
        y: orderedCoords[i - 1].y + dy * t
      };
      break;
    }
    accumulatedLength += segmentLength;
  }

  return { pathData: pathParts.join(' '), length: totalLength, midPoint, coords: orderedCoords };
}

// Check if text fits on path (no truncation - just yes/no)
function textFitsOnPath(text: string, pathLength: number, fontSize: number): boolean {
  // Approximate text width: 0.5 * fontSize per character (tighter estimate)
  const textWidth = text.length * fontSize * 0.5;
  // Text can use up to 100% of path length
  return textWidth <= pathLength;
}

// French street name abbreviations
const STREET_ABBREVIATIONS: [RegExp, string][] = [
  [/^avenue\s+/i, 'av. '],
  [/^boulevard\s+/i, 'bd. '],
  [/^impasse\s+/i, 'imp. '],
  [/^passage\s+/i, 'pass. '],
  [/^allée\s+/i, 'all. '],
  [/^place\s+/i, 'pl. '],
  [/^chemin\s+/i, 'ch. '],
  [/^route\s+/i, 'rte. '],
  [/^square\s+/i, 'sq. '],
  [/^rue\s+/i, 'r. '],
  [/^faubourg\s+/i, 'fg. '],
  [/^promenade\s+/i, 'prom. '],
  [/^résidence\s+/i, 'rés. '],
  [/^lotissement\s+/i, 'lot. '],
  [/\s+saint-/gi, ' St-'],
  [/\s+sainte-/gi, ' Ste-'],
  [/^saint-/i, 'St-'],
  [/^sainte-/i, 'Ste-'],
];

// Abbreviate a French street name
function abbreviateStreetName(name: string): string {
  let abbreviated = name;
  for (const [pattern, replacement] of STREET_ABBREVIATIONS) {
    abbreviated = abbreviated.replace(pattern, replacement);
  }
  return abbreviated;
}

// Precompiled regex for street prefix matching (used in splitStreetName)
const STREET_PREFIX_REGEX = /^(r\.|av\.|bd\.|imp\.|pass\.|all\.|pl\.|ch\.|rte\.|sq\.|fg\.|rue|avenue|boulevard|impasse|passage|allée|place|chemin|route|square)\s+/i;

// Split a street name into two lines at the best position
function splitStreetName(name: string): [string, string] | null {
  // Don't split very short names
  if (name.length < 10) return null;

  // Try to find a good split point (after prefix or at a space near the middle)
  const prefixMatch = name.match(STREET_PREFIX_REGEX);

  if (prefixMatch) {
    const prefix = prefixMatch[0].trim();
    const rest = name.slice(prefixMatch[0].length);
    if (rest.length > 0) {
      return [prefix, rest];
    }
  }

  // Otherwise split at the space closest to the middle
  const middle = Math.floor(name.length / 2);
  let bestSplit = -1;
  let bestDistance = name.length;

  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ') {
      const distance = Math.abs(i - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSplit = i;
      }
    }
  }

  if (bestSplit > 0 && bestSplit < name.length - 1) {
    return [name.slice(0, bestSplit), name.slice(bestSplit + 1)];
  }

  return null;
}

// Determine the best display format for a street name
interface LabelFormat {
  type: 'single' | 'multiline';
  lines: string[];
  abbreviated: boolean;
}

function getBestLabelFormat(name: string, pathLength: number, fontSize: number): LabelFormat | null {
  // Try 1: Full name on single line
  if (textFitsOnPath(name, pathLength, fontSize)) {
    return { type: 'single', lines: [name], abbreviated: false };
  }

  // Try 2: Abbreviated name on single line
  const abbreviated = abbreviateStreetName(name);
  if (abbreviated !== name && textFitsOnPath(abbreviated, pathLength, fontSize)) {
    return { type: 'single', lines: [abbreviated], abbreviated: true };
  }

  // Try 3: Abbreviated name on two lines
  const splitAbbrev = splitStreetName(abbreviated);
  if (splitAbbrev) {
    const maxLineWidth = Math.max(splitAbbrev[0].length, splitAbbrev[1].length);
    if (textFitsOnPath(' '.repeat(maxLineWidth), pathLength, fontSize)) {
      return { type: 'multiline', lines: splitAbbrev, abbreviated: true };
    }
  }

  // Try 4: Full name on two lines (last resort)
  const splitFull = splitStreetName(name);
  if (splitFull) {
    const maxLineWidth = Math.max(splitFull[0].length, splitFull[1].length);
    if (textFitsOnPath(' '.repeat(maxLineWidth), pathLength, fontSize)) {
      return { type: 'multiline', lines: splitFull, abbreviated: false };
    }
  }

  // Doesn't fit at all
  return null;
}

// Convert zone polygon coordinates to SVG points string
function zoneToPolygonPoints(
  coordinates: number[][],
  latToY: (lat: number) => number,
  lonToX: (lon: number) => number
): string {
  return coordinates
    .map(([lat, lng]) => `${lonToX(lng).toFixed(2)},${latToY(lat).toFixed(2)}`)
    .join(' ');
}

// Cache for @font-face CSS blocks to avoid regenerating base64 strings on each export
const fontFaceCache = new Map<FontFamily, string>();

/**
 * Get cached @font-face CSS block for a font family
 * Memoizes the result to avoid regenerating ~400KB of base64 on each export
 */
function getFontFaceCSS(fontFamily: FontFamily): string {
  // Defensive validation - font should be validated at input,
  // but protect against corrupted state or deserialization issues
  let validatedFont = fontFamily;
  if (!VALID_FONT_FAMILIES.includes(fontFamily)) {
    console.warn(`Invalid font family "${fontFamily}", falling back to ${DEFAULT_FONT_FAMILY}`);
    validatedFont = DEFAULT_FONT_FAMILY;
  }

  const cached = fontFaceCache.get(validatedFont);
  if (cached) return cached;

  // Generate @font-face blocks with embedded base64 fonts
  const fontDataUrls = getFontDataURLs(validatedFont);
  const css = `
    @font-face {
      font-family: '${validatedFont}';
      font-style: normal;
      font-weight: ${FONT_WEIGHTS.regular};
      src: url('${fontDataUrls.regular}') format('woff2');
    }
    @font-face {
      font-family: '${validatedFont}';
      font-style: normal;
      font-weight: ${FONT_WEIGHTS.medium};
      src: url('${fontDataUrls.medium}') format('woff2');
    }
    @font-face {
      font-family: '${validatedFont}';
      font-style: normal;
      font-weight: ${FONT_WEIGHTS.bold};
      src: url('${fontDataUrls.bold}') format('woff2');
    }`;

  fontFaceCache.set(validatedFont, css);
  return css;
}

export function generateSVG(
  osmData: any,
  zones: Zone[],
  contextBounds: L.LatLngBounds | null,
  style: RenderStyle,
  map: L.Map,
  exportOptions: ExportOptions = {
    forceAllLabels: false,
    borderColor: '#000000',
    exteriorOverlay: true,
    exteriorOverlayOpacity: 0.3,
    showPOI: true,
    showCompass: true
  },
  colorOverrides?: ColorOverridesState
): string {
  // Only real colors are written into the SVG: styles and rulesets may be imported
  style = sanitizeStyle(style);

  // Apply defaults for missing options
  const options = {
    forceAllLabels: exportOptions.forceAllLabels ?? false,
    borderColor: normalizeColor(exportOptions.borderColor) ?? style.borderColor,
    exteriorOverlay: exportOptions.exteriorOverlay ?? true,
    exteriorOverlayOpacity: exportOptions.exteriorOverlayOpacity ?? 0.3,
    showPOI: exportOptions.showPOI ?? true,
    showCompass: exportOptions.showCompass ?? true,
  };

  // Get bounds from contextBounds or first zone
  const bounds: L.LatLngBounds = contextBounds || zones[0]?.bounds;
  if (!bounds) {
    throw new Error('No bounds available for SVG generation');
  }


  // Calculate SVG dimensions based on the selected zone in pixels
  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());
  const width = Math.abs(se.x - nw.x);
  const height = Math.abs(se.y - nw.y);

  // Use higher resolution for better quality
  const scale = 2;
  // Add margin around the content (in scaled pixels)
  const margin = 50 * scale;
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const svgWidth = contentWidth + margin * 2;
  const svgHeight = contentHeight + margin * 2;

  // Create coordinate transformation functions (with margin offset)
  const latToY = (lat: number) => {
    const ratio = (bounds.getNorth() - lat) /
                  (bounds.getNorth() - bounds.getSouth());
    return margin + ratio * contentHeight;
  };

  const lonToX = (lon: number) => {
    const ratio = (lon - bounds.getWest()) /
                  (bounds.getEast() - bounds.getWest());
    return margin + ratio * contentWidth;
  };

  const project = ([lat, lon]: LatLon) => ({ x: lonToX(lon), y: latToY(lat) });
  const inSvg = ({ x, y }: { x: number; y: number }) => x >= 0 && x <= svgWidth && y >= 0 && y <= svgHeight;

  // Features drawn by the map, classified and grouped like the map overlay
  const features = collectFeatures(osmData);
  const overrideOf = (id: number): string | undefined => colorOverrides?.overrides[id]?.color;

  // Collect POI nodes
  const poiNodes: { x: number; y: number; iconName: string }[] = [];
  for (const node of osmData.elements) {
    if (node.type !== 'node' || !node.tags) continue;
    const iconName = getPOIIcon(node.tags);
    const point = project([node.lat, node.lon]);
    // Only include POIs within bounds
    if (iconName && inSvg(point)) poiNodes.push({ ...point, iconName });
  }

  // Collect house numbers
  const houseNumbers: { x: number; y: number; number: string }[] = [];
  for (const node of osmData.elements) {
    const houseNumber = node.type === 'node' ? node.tags?.['addr:housenumber'] : undefined;
    if (!houseNumber) continue;
    const point = project([node.lat, node.lon]);
    // Only include house numbers within bounds
    if (inSvg(point)) houseNumbers.push({ ...point, number: houseNumber });
  }

  // Names of the drawn parks, woods, water bodies and beaches
  const namedAreas = areaLabels(features)
    .map(label => ({ ...project([label.lat, label.lon]), name: label.name, type: label.type }))
    .filter(inSvg);

  const fontFamily = resolveFontFamily(style);
  const labels = resolveLabelStyle(style);

  // Start building SVG with Inkscape-compatible namespaces
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="${svgWidth}"
  height="${svgHeight}"
  viewBox="0 0 ${svgWidth} ${svgHeight}"
  inkscape:version="1.0"
  sodipodi:docname="carte.svg">
  <sodipodi:namedview
    inkscape:current-layer="layer-roads"
    inkscape:window-maximized="1"
    inkscape:pageopacity="0"
    inkscape:pageshadow="2"
    inkscape:document-units="px" />

  <!-- Tier 1 OSM Feature Styles -->
  <style type="text/css">
    /* Embedded fonts for standalone SVG rendering */
    ${getFontFaceCSS(fontFamily)}

    /* Background */
    .background { fill: ${style.backgroundColor || '#f5f5f5'}; }

    /* === LANDUSE === */
${areaCss(style, 'landuse', LANDUSE_DRAW_ORDER, scale)}

    /* === NATURAL === */
${areaCss(style, 'natural', NATURAL_DRAW_ORDER, scale)}

    /* === WATERWAY === */
${waterwayCss(style, scale)}

    /* === BUILDING SHADOWS === */
    .building-shadow {
      fill: #000000;
      fill-opacity: 0.15;
      stroke: none;
    }

    /* === BUILDINGS === */
${areaCss(style, 'building', BUILDING_DRAW_ORDER, scale)}

    /* === RAILWAYS === (widths and dashes on each path) */
${railwayCss(style)}

    /* === HIGHWAY CASINGS === */
${highwayCss(style, 'casing')}
    /* === HIGHWAY FILLS === */
${highwayCss(style, 'fill')}

    /* Road labels */
    .road-label {
      font-family: '${fontFamily}', 'Arial', sans-serif;
      fill: ${labels.roadColor};
      stroke: ${labels.haloColor};
      stroke-width: ${0.5 * scale};
      paint-order: stroke fill;
      font-weight: ${style.fontSize?.fontBold ? '700' : '500'};
    }

    /* Area labels (parks, forests, etc.) */
    .area-label {
      font-family: '${fontFamily}', 'Arial', sans-serif;
      fill: ${labels.areaColor};
      stroke: ${labels.haloColor};
      stroke-width: ${0.4 * scale};
      paint-order: stroke fill;
      font-weight: ${style.fontSize?.fontBold ? '700' : '500'};
      font-style: italic;
      text-anchor: middle;
    }
    .area-label-water {
      fill: ${labels.waterColor};
    }
    .area-label-forest {
      fill: ${labels.forestColor};
    }

    /* House numbers */
    .housenumber {
      font-family: '${fontFamily}', 'Arial', sans-serif;
      fill: ${labels.houseNumberColor};
      stroke: ${labels.haloColor};
      stroke-width: ${0.3 * scale};
      paint-order: stroke fill;
      font-weight: ${style.fontSize?.fontBold ? '700' : '400'};
      text-anchor: middle;
      dominant-baseline: middle;
    }

    /* Zone border */
    .zone-border {
      fill: none;
      stroke: ${options.borderColor};
      stroke-width: ${style.borderWidth * scale};
      stroke-opacity: ${style.strokeOpacity};
    }

    /* Exterior overlay */
    .exterior-overlay {
      fill: #000000;
      fill-opacity: ${options.exteriorOverlay ? options.exteriorOverlayOpacity : 0};
    }
  </style>

  <!-- Defs for mask and grayscale filter -->
  <defs>
    <!-- Mask for exterior: white = visible, black (zones) = hidden -->
    <mask id="exterior-mask">
      <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white" />
      ${zones.map(z => `<polygon points="${zoneToPolygonPoints(z.coordinates, latToY, lonToX)}" fill="black" />`).join('\n      ')}
    </mask>
    <!-- ClipPath for interior: union of all zones -->
    <clipPath id="zone-clip">
      ${zones.map(z => `<polygon points="${zoneToPolygonPoints(z.coordinates, latToY, lonToX)}" />`).join('\n      ')}
    </clipPath>
    <filter id="grayscale">
      <!-- Desaturate and darken for visible difference -->
      <feColorMatrix type="saturate" values="0" result="gray" />
      <feComponentTransfer in="gray">
        <feFuncR type="linear" slope="0.6" intercept="0.2" />
        <feFuncG type="linear" slope="0.6" intercept="0.2" />
        <feFuncB type="linear" slope="0.6" intercept="0.2" />
      </feComponentTransfer>
    </filter>
  </defs>
`;

  // Build all content layers using arrays for efficient string concatenation (Fix 2)
  const contentLayerParts: string[] = [];

  const lineToPath = (coords: LatLon[]): string => coords.map((point, i) => {
    const { x, y } = project(point);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  // Every ring of every polygon, holes included (filled even-odd, like the map overlay)
  const polygonsToPath = (polygons: LatLon[][][]): string =>
    polygons.flatMap(rings => rings.map(ring => `${lineToPath(ring)} Z`)).join(' ');

  // Areas of a style; overridden ones are recolored inline (shadows never are)
  const renderAreas = (kind: AreaKind, key: string, areas: AreaFeature[], className = `${kind}-${key}`): string[] =>
    areas.map(area => {
      const override = className === 'building-shadow' ? undefined : overrideOf(area.id);
      const paint = override ? areaPaint(style, kind, key, override) : null;
      const inline = paint ? ` style="fill:${paint.fill}${paint.stroke ? `;stroke:${paint.stroke}` : ''}"` : '';
      return `    <path class="${className}" fill-rule="evenodd" d="${polygonsToPath(area.polygons)}"${inline} />`;
    });

  // Waterways of a type; underground ones get the tunnel class and style, hidden ones are skipped
  const renderWaterways = (ways: LineFeature[], type: keyof RenderStyle['waterway']): string[] => {
    const parts: string[] = [];
    for (const way of ways) {
      const waterwayStyle = resolveWaterwayStyle(style, type, way.tags);
      if (waterwayStyle.lineStyle === 'none') continue;
      const className = `waterway-${type}${isUnderground(way.tags) ? ' tunnel' : ''}`;
      const inline: string[] = [];
      // Check for color override
      const override = overrideOf(way.id);
      if (override) inline.push(`stroke:${override}`);
      const dashArray = getDashArray(waterwayStyle.lineStyle, getWaterwayWidth(type) * scale);
      if (dashArray) inline.push(`stroke-dasharray:${dashArray.join(',')}`, 'stroke-linecap:butt');
      const pathData = lineToPath(way.coords);
      parts.push(inline.length
        ? `    <path class="${className}" d="${pathData}" style="${inline.join(';')}" />`
        : `    <path class="${className}" d="${pathData}" />`);
    }
    return parts;
  };

  // Landuse layer
  contentLayerParts.push(`    <g id="layer-landuse">`);
  for (const key of LANDUSE_DRAW_ORDER) contentLayerParts.push(...renderAreas('landuse', key, features.landuse[key]));
  contentLayerParts.push('    </g>');

  // Natural features layer
  contentLayerParts.push(`    <g id="layer-natural">`);
  for (const key of NATURAL_DRAW_ORDER) contentLayerParts.push(...renderAreas('natural', key, features.natural[key]));
  contentLayerParts.push('    </g>');

  // Waterways layer
  contentLayerParts.push(`    <g id="layer-waterways">`);
  for (const key of WATERWAY_TYPES) contentLayerParts.push(...renderWaterways(features.waterway[key], key));
  contentLayerParts.push('    </g>');

  // Building shadows layer (offset for 3D effect), unless the style turns shadows off
  if (style.buildingShadows !== false) {
    const shadowOffset = 3 * scale;
    contentLayerParts.push(`    <g id="layer-building-shadows" transform="translate(${shadowOffset}, ${shadowOffset})">`);
    for (const key of BUILDING_DRAW_ORDER) {
      contentLayerParts.push(...renderAreas('building', key, features.building[key], 'building-shadow'));
    }
    contentLayerParts.push('    </g>');
  }

  // Buildings layer
  contentLayerParts.push(`    <g id="layer-buildings">`);
  for (const key of BUILDING_DRAW_ORDER) contentLayerParts.push(...renderAreas('building', key, features.building[key]));
  contentLayerParts.push('    </g>');

  // Railways layer: every rail base, then the ties, styled like roads (base = casing)
  const railwayBaseParts: string[] = [];
  const railwayTiesParts: string[] = [];
  for (const type of RAILWAY_DRAW_ORDER) {
    const railwayStyle = resolveRailwayStyle(style, type);
    if (railwayStyle.lineStyle === 'none') continue;
    const railwayWeight = scaleRoadWeight(
      { fill: getRailwayWeight().fill * scale, casing: getRailwayWeight().casing * scale },
      railwayStyle
    );
    const baseStyle = roadPathStyle(railwayWeight.casing, getCasingDashArray(railwayStyle, railwayWeight.fill));
    const tiesStyle = roadPathStyle(railwayWeight.fill, getDashArray(railwayStyle.lineStyle, railwayWeight.fill));
    for (const railway of features.railway[type]) {
      const pathData = lineToPath(railway.coords);
      if (!isCasingHidden(railwayStyle)) {
        railwayBaseParts.push(`      <path class="railway-${type}-base" d="${pathData}" style="${baseStyle}" />`);
      }
      railwayTiesParts.push(`      <path class="railway-${type}-ties" d="${pathData}" style="${tiesStyle}" />`);
    }
  }
  contentLayerParts.push(`    <g id="layer-railways">`);
  contentLayerParts.push(...railwayBaseParts, ...railwayTiesParts);
  contentLayerParts.push('    </g>');

  // Road casings (outlines) first, then fills, smaller roads under bigger ones; roads in
  // tunnels are drawn first, under the roads above ground, with the tunnel style.
  // Casings follow the dashes of their road unless they have their own line style.
  // Overridden roads take the override color, their casing a darker shade of it
  const roadParts = (underground: boolean, part: 'casing' | 'fill'): string[] => {
    const parts: string[] = [];
    for (const type of ROAD_DRAW_ORDER) {
      for (const road of features.highway[type]) {
        if (isUnderground(road.tags) !== underground) continue;
        const highwayStyle = resolveHighwayStyle(style, type, road.tags);
        if (part === 'casing' ? isCasingHidden(highwayStyle) : highwayStyle.lineStyle === 'none') continue;
        const weight = scaleRoadWeight(getScaledRoadWeight(road.tags.highway!, scale), highwayStyle);
        const dashArray = part === 'casing'
          ? getCasingDashArray(highwayStyle, weight.fill)
          : getDashArray(highwayStyle.lineStyle, weight.fill);
        const override = overrideOf(road.id);
        const overrideStroke = override ? `;stroke:${part === 'casing' ? resolveStrokeColor(highwayStyle, override) : override}` : '';
        const className = `highway-${type}-${part}${underground ? ' tunnel' : ''}`;
        parts.push(`        <path class="${className}" d="${lineToPath(road.coords)}" style="${roadPathStyle(weight[part], dashArray)}${overrideStroke}" />`);
      }
    }
    return parts;
  };

  contentLayerParts.push(`    <g id="layer-roads">`);
  contentLayerParts.push('      <g id="road-tunnels">');
  contentLayerParts.push(...roadParts(true, 'casing'), ...roadParts(true, 'fill'));
  contentLayerParts.push('      </g>');
  contentLayerParts.push('      <g id="road-casings">');
  contentLayerParts.push(...roadParts(false, 'casing'));
  contentLayerParts.push('      </g>');
  contentLayerParts.push('      <g id="road-fills">');
  contentLayerParts.push(...roadParts(false, 'fill'));
  contentLayerParts.push('      </g>');
  contentLayerParts.push('    </g>');

  // Roads labelled: streets and bigger roads, and pedestrian streets, unless their style hides them
  const labelledRoads = (['motorway', 'primary', 'secondary', 'tertiary', 'residential'] as const)
    .flatMap(key => features.highway[key])
    .concat(features.highway.footway.filter(road => road.tags.highway === 'pedestrian'))
    .filter(road => resolveHighwayStyle(style, road.key, road.tags).lineStyle !== 'none');

  // Group ways by name and find the best segment (longest) for each
  const roadsByName = new Map<string, { road: LineFeature; pathInfo: { pathData: string; length: number; midPoint: { x: number; y: number }; coords: { x: number; y: number }[] } }>();

  // Define clip bounds for road labels (visible SVG area)
  const labelClipBounds = { minX: 0, minY: 0, maxX: svgWidth, maxY: svgHeight };

  for (const road of labelledRoads) {
    const name = road.tags.name;
    if (!name) continue;

    // Clip path to visible bounds so text is positioned within the visible area
    const pathInfo = getTextPathData(road.coords.map(project), labelClipBounds);
    if (!pathInfo) continue;

    // Keep the segment with the longest path
    const existing = roadsByName.get(name);
    if (!existing || pathInfo.length > existing.pathInfo.length) {
      roadsByName.set(name, { road, pathInfo });
    }
  }

  // Collect labels to render and build path defs
  interface LabelToRender {
    pathId: string;
    format: LabelFormat;
    fontSize: number;
  }
  const labelsToRender: LabelToRender[] = [];
  let roadLabelPathDefs = '';
  let pathIdCounter = 0;

  // Collect road label paths for collision detection with house numbers
  // We'll store the actual path coordinates to check distance-based collisions
  interface RoadLabelPath {
    points: { x: number; y: number }[];
    halfHeight: number; // Half the text height for collision distance
  }
  const roadLabelPaths: RoadLabelPath[] = [];

  // Apply font size multiplier from style settings
  const roadFontSizeMultiplier = style.fontSize?.roads ?? 1;

  for (const [name, { road, pathInfo }] of roadsByName) {
    const fontSize = getScaledRoadWeight(road.tags.highway!, scale).fontSize * roadFontSizeMultiplier;

    // Try to find the best format for this label
    const format = getBestLabelFormat(name, pathInfo.length, fontSize);

    // Skip if no format works (unless forceAllLabels is enabled)
    if (!format && !options.forceAllLabels) continue;

    const pathId = `road-label-path-${pathIdCounter++}`;
    roadLabelPathDefs += `    <path id="${pathId}" d="${pathInfo.pathData}" />\n`;

    // Use the format if available, otherwise fall back to single line with abbreviated name
    const finalFormat = format || {
      type: 'single' as const,
      lines: [abbreviateStreetName(name)],
      abbreviated: true
    };

    labelsToRender.push({ pathId, format: finalFormat, fontSize });

    // Store the path coordinates for collision detection
    // The exclusion distance is based on the font size
    const exclusionDistance = fontSize * (finalFormat.type === 'multiline' ? 1.5 : 1.0);
    roadLabelPaths.push({
      points: pathInfo.coords,
      halfHeight: exclusionDistance
    });
  }

  // POI icons layer (rendered first, below labels) - only if showPOI is enabled
  if (options.showPOI) {
    const poiParts: string[] = [];
    const iconSize = 16 * scale; // Size of POI icons
    const iconScale = iconSize / 24;
    // Cache for parsed icon inner content to avoid re-parsing the same icon type
    const iconInnerCache = new Map<string, string>();

    for (const poi of poiNodes) {
      // Check cache first
      let innerContent = iconInnerCache.get(poi.iconName);
      if (innerContent === undefined) {
        const iconSvg = getIconSvg(poi.iconName);
        if (iconSvg) {
          innerContent = iconSvg
            .replace(/<svg[^>]*>/, '')
            .replace(/<\/svg>/, '')
            .trim();
          iconInnerCache.set(poi.iconName, innerContent);
        } else {
          iconInnerCache.set(poi.iconName, '');
          innerContent = '';
        }
      }

      if (innerContent) {
        const iconX = poi.x - iconSize / 2;
        const iconY = poi.y - iconSize / 2;
        poiParts.push(`      <g transform="translate(${iconX.toFixed(2)}, ${iconY.toFixed(2)})">`);
        poiParts.push(`        <g transform="scale(${iconScale.toFixed(3)})">`);
        poiParts.push(`          ${innerContent}`);
        poiParts.push(`        </g>`);
        poiParts.push(`      </g>`);
      }
    }
    contentLayerParts.push(`    <g id="layer-pois">`);
    contentLayerParts.push(...poiParts);
    contentLayerParts.push('    </g>');
  }

  // Build label layers separately using arrays (to render above the border)
  const labelLayerParts: string[] = [];

  // Area labels layer (parks, forests, water bodies, etc.)
  const areaLabelParts: string[] = [];
  const areaFontSizeMultiplier = style.fontSize?.areas ?? 1;
  const areaFontSize = 7 * scale * areaFontSizeMultiplier;
  for (const area of namedAreas) {
    const escapedName = area.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let extraClass = '';
    if (area.type === 'water') extraClass = ' area-label-water';
    else if (area.type === 'forest') extraClass = ' area-label-forest';
    areaLabelParts.push(`      <text class="area-label${extraClass}" x="${area.x.toFixed(2)}" y="${area.y.toFixed(2)}" font-size="${areaFontSize}">${escapedName}</text>`);
  }
  labelLayerParts.push(`    <g id="layer-area-names">`);
  labelLayerParts.push(...areaLabelParts);
  labelLayerParts.push('    </g>');

  // House numbers layer (filtered to avoid collision with road labels)
  const houseNumberFontSize = 5 * scale;

  // Helper function to calculate minimum distance from a point to a polyline
  const distanceToPath = (px: number, py: number, path: { x: number; y: number }[]): number => {
    let minDist = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const x1 = path[i].x, y1 = path[i].y;
      const x2 = path[i + 1].x, y2 = path[i + 1].y;

      // Calculate distance from point to line segment
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;

      let dist: number;
      if (lengthSq === 0) {
        // Segment is a point
        dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      } else {
        // Project point onto line segment
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
      }

      if (dist < minDist) minDist = dist;
    }
    return minDist;
  };

  const houseNumberParts: string[] = [];
  for (const hn of houseNumbers) {
    // Check if house number is too close to any road label path
    const isTooCloseToLabel = roadLabelPaths.some(roadLabel =>
      distanceToPath(hn.x, hn.y, roadLabel.points) < roadLabel.halfHeight
    );
    if (isTooCloseToLabel) continue; // Skip house numbers that overlap with road labels

    const escapedNumber = hn.number.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    houseNumberParts.push(`      <text class="housenumber" x="${hn.x.toFixed(2)}" y="${hn.y.toFixed(2)}" font-size="${houseNumberFontSize}">${escapedNumber}</text>`);
  }
  labelLayerParts.push(`    <g id="layer-housenumbers">`);
  labelLayerParts.push(...houseNumberParts);
  labelLayerParts.push('    </g>');

  // Road names layer (text only, paths are in main defs) - rendered last so it appears on top
  const roadNameParts: string[] = [];
  for (const { pathId, format, fontSize } of labelsToRender) {
    if (format.type === 'single') {
      // Single line label
      const escapedName = format.lines[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      roadNameParts.push(`      <text class="road-label" font-size="${fontSize}"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedName}</textPath></text>`);
    } else {
      // Multi-line label: use tspan elements with dy offset
      const lineHeight = fontSize * 1.2;
      const escapedLine1 = format.lines[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const escapedLine2 = format.lines[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // First line (offset up by half line height)
      roadNameParts.push(`      <text class="road-label" font-size="${fontSize}" dy="${(-lineHeight / 2).toFixed(1)}"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedLine1}</textPath></text>`);

      // Second line (offset down by half line height)
      roadNameParts.push(`      <text class="road-label" font-size="${fontSize}" dy="${(lineHeight / 2).toFixed(1)}"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedLine2}</textPath></text>`);
    }
  }
  labelLayerParts.push(`    <g id="layer-road-names">`);
  labelLayerParts.push(...roadNameParts);
  labelLayerParts.push('    </g>');

  // Add road label path definitions to main defs
  svg = svg.replace('</defs>', `${roadLabelPathDefs}  </defs>`);

  // Join content layers into a string (Fix 2: efficient string building)
  const contentLayers = contentLayerParts.join('\n');
  const labelLayers = labelLayerParts.join('\n');

  // Union of the zones, shared by the exterior overlay and the border: overlapping zones
  // have one outline, as on the map preview
  const zoneRings = mergeZoneRings(zones);
  const zoneRingPoints = zoneRings.map(ring => ring.map(([lat, lng]) => `${lonToX(lng).toFixed(2)},${latToY(lat).toFixed(2)}`));

  // Build final SVG using array for efficient assembly
  const svgParts: string[] = [];

  // Now assemble final SVG with colored base and grayscale exterior overlay
  svgParts.push('  <!-- Contenu principal -->');
  svgParts.push(`  <g id="layer-fond" inkscape:groupmode="layer" inkscape:label="Fond">`);
  svgParts.push(`    <rect class="background" x="0" y="0" width="${svgWidth}" height="${svgHeight}" />`);
  svgParts.push('  </g>');
  svgParts.push('');

  // Exterior (grayscale) - first so it's behind
  const exteriorAttributes = style.exteriorGrayscale
    ? 'inkscape:label="Extérieur (gris)" filter="url(#grayscale)"'
    : 'inkscape:label="Extérieur"';
  svgParts.push(`  <g id="layer-exterior" inkscape:groupmode="layer" ${exteriorAttributes} mask="url(#exterior-mask)">`);
  svgParts.push(contentLayers);
  svgParts.push('  </g>');
  svgParts.push('');

  // Interior (colored) - on top, clipped to all zones (clipPath defined in defs)
  svgParts.push(`  <g id="layer-interior" inkscape:groupmode="layer" inkscape:label="Intérieur (couleur)">`);
  svgParts.push(`    <g clip-path="url(#zone-clip)">`);
  svgParts.push(contentLayers);
  // Interior tint of the zones, as on the map preview
  svgParts.push(`    <rect class="zone-interior" x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="${style.interiorColor}" fill-opacity="${style.fillOpacity}" />`);
  svgParts.push('    </g>');
  svgParts.push('  </g>');
  svgParts.push('');

  // Exterior overlay (semi-transparent gray outside all zones)
  if (options.exteriorOverlay && zoneRingPoints.length > 0) {
    const holes = zoneRingPoints.map(points => ` M ${points[0]} ${points.slice(1).map(p => `L ${p}`).join(' ')} Z`).join('');
    svgParts.push(`  <g id="layer-exterior-overlay" inkscape:groupmode="layer" inkscape:label="Voile extérieur">`);
    svgParts.push(`    <path class="exterior-overlay" fill-rule="evenodd" d="M 0,0 L ${svgWidth},0 L ${svgWidth},${svgHeight} L 0,${svgHeight} Z${holes}" />`);
    svgParts.push('  </g>');
    svgParts.push('');
  }

  // Zone borders layer
  svgParts.push('  <!-- Zone borders -->');
  svgParts.push('  <g id="layer-border" inkscape:groupmode="layer" inkscape:label="Bordures">');
  for (const points of zoneRingPoints) {
    svgParts.push(`    <polygon class="zone-border" points="${points.join(' ')}" />`);
  }
  svgParts.push('  </g>');
  svgParts.push('');

  // Labels layer - rendered above the border
  svgParts.push(`  <g id="layer-labels" inkscape:groupmode="layer" inkscape:label="Labels">`);
  svgParts.push(labelLayers);
  svgParts.push('  </g>');

  // Compass layer - north indicator in top-right corner
  if (options.showCompass) {
    const compassSize = 50 * scale;
    const compassX = svgWidth - compassSize - 20 * scale;
    const compassY = 20 * scale;
    const centerX = compassX + compassSize / 2;
    const centerY = compassY + compassSize / 2;
    const arrowLength = compassSize * 0.4;
    const arrowWidth = arrowLength * 0.35;

    svgParts.push(`  <g id="layer-compass" inkscape:groupmode="layer" inkscape:label="Boussole">`);
    // North arrow (red, pointing up)
    svgParts.push(`    <polygon points="${centerX},${centerY - arrowLength} ${centerX - arrowWidth},${centerY} ${centerX},${centerY - arrowLength * 0.15} ${centerX + arrowWidth},${centerY}" fill="#c0392b" stroke="#922b21" stroke-width="${0.5 * scale}" />`);
    // South arrow (gray, pointing down)
    svgParts.push(`    <polygon points="${centerX},${centerY + arrowLength} ${centerX - arrowWidth},${centerY} ${centerX},${centerY + arrowLength * 0.15} ${centerX + arrowWidth},${centerY}" fill="#bdc3c7" stroke="#7f8c8d" stroke-width="${0.5 * scale}" />`);
    // "N" letter with white outline for readability
    svgParts.push(`    <text x="${centerX}" y="${centerY - arrowLength - 3 * scale}" text-anchor="middle" font-family="'${fontFamily}', Arial, sans-serif" font-size="${10 * scale}" font-weight="bold" fill="#333" stroke="white" stroke-width="${2 * scale}" paint-order="stroke fill">N</text>`);
    svgParts.push('  </g>');
  }

  svgParts.push('</svg>');

  // Join header svg with rest of parts
  return svg + svgParts.join('\n');
}
