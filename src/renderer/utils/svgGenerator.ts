import L from 'leaflet';
import { RenderStyle, Zone, ExportOptions, ColorOverridesState } from '../types';
import { getIconSvg, resolveIconName } from '../assets/icons';
import { buildNodeMap } from './geometry';

// POI type to icon mapping
const POI_ICON_MAP: Record<string, string> = {
  // Amenities
  'parking': 'parking',
  'restaurant': 'restaurant',
  'cafe': 'cafe',
  'fast_food': 'fast_food',
  'pub': 'pub',
  'bar': 'pub',
  'bank': 'bank',
  'atm': 'atm',
  'pharmacy': 'pharmacy',
  'hospital': 'hospital',
  'clinic': 'hospital',
  'police': 'police',
  'fire_station': 'fire_station',
  'post_office': 'post_office',
  'post_box': 'post_office',
  'library': 'library',
  'school': 'school',
  'university': 'school',
  'college': 'school',
  'toilets': 'toilets',
  'recycling': 'recycling',
  'drinking_water': 'drinking_water',
  'place_of_worship': 'place_of_worship',
  // Transport
  'bus_stop': 'bus_stop',
  // Tourism
  'hotel': 'hotel',
  'museum': 'museum',
  'viewpoint': 'viewpoint',
  'information': 'info',
  // Shops
  'supermarket': 'supermarket',
  'bakery': 'bakery',
  'convenience': 'convenience',
};

// Get POI icon name from node tags
function getPOIIcon(tags: Record<string, string>): string | null {
  // Check amenity
  if (tags.amenity && POI_ICON_MAP[tags.amenity]) {
    return POI_ICON_MAP[tags.amenity];
  }
  // Check tourism
  if (tags.tourism && POI_ICON_MAP[tags.tourism]) {
    return POI_ICON_MAP[tags.tourism];
  }
  // Check shop
  if (tags.shop && POI_ICON_MAP[tags.shop]) {
    return POI_ICON_MAP[tags.shop];
  }
  // Check highway (bus_stop)
  if (tags.highway === 'bus_stop') {
    return 'bus_stop';
  }
  // Check railway (station)
  if (tags.railway === 'station') {
    return 'railway_station';
  }
  return null;
}

// Cache for derived casing colors
const casingColorCache = new Map<string, string>();

// Darken a hex color by a fixed amount for road casing (memoized)
function deriveCasingColor(fillColor: string): string {
  const cached = casingColorCache.get(fillColor);
  if (cached) return cached;

  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
  const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

  casingColorCache.set(fillColor, result);
  return result;
}

// Helper function to convert way nodes to SVG path data
function wayToPath(
  way: any,
  nodes: Map<number, { lat: number; lon: number }>,
  latToY: (lat: number) => number,
  lonToX: (lon: number) => number,
  closePath: boolean = false
): string | null {
  const coordinates: { x: number; y: number }[] = [];

  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (!node) continue;
    coordinates.push({
      x: lonToX(node.lon),
      y: latToY(node.lat)
    });
  }

  if (coordinates.length < 2) return null;

  const pathParts = [`M ${coordinates[0].x.toFixed(2)},${coordinates[0].y.toFixed(2)}`];
  for (let i = 1; i < coordinates.length; i++) {
    pathParts.push(`L ${coordinates[i].x.toFixed(2)},${coordinates[i].y.toFixed(2)}`);
  }

  if (closePath) {
    pathParts.push('Z');
  }

  return pathParts.join(' ');
}

// Get road weight based on highway type
function getRoadWeight(highway: string, scale: number): { fill: number; casing: number; fontSize: number } {
  switch (highway) {
    case 'motorway':
    case 'trunk':
      return { fill: 6 * scale, casing: 8 * scale, fontSize: 10 * scale };
    case 'primary':
      return { fill: 5 * scale, casing: 7 * scale, fontSize: 9 * scale };
    case 'secondary':
      return { fill: 4 * scale, casing: 6 * scale, fontSize: 8 * scale };
    case 'tertiary':
      return { fill: 3 * scale, casing: 5 * scale, fontSize: 7 * scale };
    case 'residential':
    case 'living_street':
      return { fill: 2 * scale, casing: 4 * scale, fontSize: 6 * scale };
    case 'path':
    case 'footway':
    case 'pedestrian':
      return { fill: 1.5 * scale, casing: 2.5 * scale, fontSize: 5 * scale };
    case 'cycleway':
      return { fill: 2 * scale, casing: 3 * scale, fontSize: 5 * scale };
    default:
      return { fill: 2 * scale, casing: 4 * scale, fontSize: 6 * scale };
  }
}

// Map highway tag values to style keys
function getHighwayStyleKey(highway: string): keyof RenderStyle['highway'] {
  switch (highway) {
    case 'motorway':
    case 'trunk':
    case 'motorway_link':
    case 'trunk_link':
      return 'motorway';
    case 'primary':
    case 'primary_link':
      return 'primary';
    case 'secondary':
    case 'secondary_link':
      return 'secondary';
    case 'tertiary':
    case 'tertiary_link':
      return 'tertiary';
    case 'residential':
    case 'living_street':
    case 'unclassified':
    case 'service':
      return 'residential';
    case 'path':
    case 'footway':
    case 'pedestrian':
    case 'track':
      return 'path';
    case 'cycleway':
      return 'cycleway';
    default:
      return 'residential';
  }
}

// Map building tag values to style keys
// Note: 'yes' is the most common OSM building tag (generic/unspecified),
// we treat it as residential since that's the most common actual type
function getBuildingStyleKey(building: string): keyof RenderStyle['building'] {
  switch (building) {
    case 'yes':  // Generic building tag - treat as residential (most common)
    case 'residential':
    case 'apartments':
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'terrace':
    case 'dormitory':
    case 'bungalow':
    case 'cabin':
    case 'farm':
    case 'hut':
    case 'static_caravan':
      return 'residential';
    case 'commercial':
    case 'retail':
    case 'office':
    case 'supermarket':
    case 'kiosk':
    case 'shop':
      return 'commercial';
    case 'industrial':
    case 'warehouse':
    case 'factory':
    case 'manufacture':
    case 'storage_tank':
    case 'silo':
      return 'industrial';
    case 'church':
    case 'chapel':
    case 'cathedral':
    case 'mosque':
    case 'synagogue':
    case 'temple':
    case 'shrine':
    case 'religious':
      return 'religious';
    default:
      return 'default';
  }
}

// Map waterway tag values to style keys
function getWaterwayStyleKey(waterway: string): keyof RenderStyle['waterway'] {
  switch (waterway) {
    case 'river':
      return 'river';
    case 'stream':
    case 'brook':
      return 'stream';
    case 'canal':
    case 'ditch':
    case 'drain':
      return 'canal';
    default:
      return 'default';
  }
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
  way: any,
  nodes: Map<number, { lat: number; lon: number }>,
  latToY: (lat: number) => number,
  lonToX: (lon: number) => number,
  clipBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): { pathData: string; length: number } | null {
  const coords: { x: number; y: number }[] = [];
  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (node) {
      coords.push({ x: lonToX(node.lon), y: latToY(node.lat) });
    }
  }
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

  return { pathData: pathParts.join(' '), length: totalLength };
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

// Calculate centroid of a polygon from way nodes
function calculateCentroid(
  way: any,
  nodes: Map<number, { lat: number; lon: number }>,
  latToY: (lat: number) => number,
  lonToX: (lon: number) => number
): { x: number; y: number } | null {
  const coords: { x: number; y: number }[] = [];

  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (node) {
      coords.push({
        x: lonToX(node.lon),
        y: latToY(node.lat)
      });
    }
  }

  if (coords.length < 3) return null;

  // Simple centroid calculation (average of all points)
  let sumX = 0, sumY = 0;
  for (const coord of coords) {
    sumX += coord.x;
    sumY += coord.y;
  }

  return {
    x: sumX / coords.length,
    y: sumY / coords.length
  };
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

export function generateSVG(
  osmData: any,
  zone: Zone,
  style: RenderStyle,
  map: L.Map,
  exportOptions: ExportOptions = {
    forceAllLabels: false,
    borderColor: '#000000',
    exteriorOverlay: true,
    exteriorOverlayOpacity: 0.3,
    showPOI: true
  },
  colorOverrides?: ColorOverridesState
): string {
  // Apply defaults for missing options
  const options = {
    forceAllLabels: exportOptions.forceAllLabels ?? false,
    borderColor: exportOptions.borderColor ?? '#000000',
    exteriorOverlay: exportOptions.exteriorOverlay ?? true,
    exteriorOverlayOpacity: exportOptions.exteriorOverlayOpacity ?? 0.3,
    showPOI: exportOptions.showPOI ?? true,
  };
  // Get bounds from zone
  const bounds: L.LatLngBounds = zone.bounds;

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

  // Build node map (using shared utility)
  const nodes = buildNodeMap(osmData);

  // Categorize ways by feature type
  const landuseResidential: any[] = [];
  const landuseCommercial: any[] = [];
  const landuseIndustrial: any[] = [];
  const landuseFarmland: any[] = [];
  const landuseForest: any[] = [];
  const naturalWater: any[] = [];
  const naturalWood: any[] = [];
  const naturalGrassland: any[] = [];
  const naturalBeach: any[] = [];
  const waterwayRiver: any[] = [];
  const waterwayStream: any[] = [];
  const waterwayCanal: any[] = [];
  const buildingResidential: any[] = [];
  const buildingCommercial: any[] = [];
  const buildingIndustrial: any[] = [];
  const buildingReligious: any[] = [];
  const buildingDefault: any[] = [];
  const railways: any[] = [];
  const highwayMotorway: any[] = [];
  const highwayPrimary: any[] = [];
  const highwaySecondary: any[] = [];
  const highwayTertiary: any[] = [];
  const highwayResidential: any[] = [];
  const highwayPath: any[] = [];
  const highwayCycleway: any[] = [];

  osmData.elements
    .filter((el: any) => el.type === 'way' && el.nodes && el.nodes.length > 0)
    .forEach((way: any) => {
      if (!way.tags) return;

      // Buildings
      if (way.tags.building) {
        const type = getBuildingStyleKey(way.tags.building);
        switch (type) {
          case 'residential': buildingResidential.push(way); break;
          case 'commercial': buildingCommercial.push(way); break;
          case 'industrial': buildingIndustrial.push(way); break;
          case 'religious': buildingReligious.push(way); break;
          default: buildingDefault.push(way);
        }
        return;
      }

      // Railways
      if (way.tags.railway && way.tags.railway !== 'abandoned') {
        railways.push(way);
        return;
      }

      // Highways
      if (way.tags.highway) {
        const type = getHighwayStyleKey(way.tags.highway);
        switch (type) {
          case 'motorway': highwayMotorway.push(way); break;
          case 'primary': highwayPrimary.push(way); break;
          case 'secondary': highwaySecondary.push(way); break;
          case 'tertiary': highwayTertiary.push(way); break;
          case 'residential': highwayResidential.push(way); break;
          case 'path': highwayPath.push(way); break;
          case 'cycleway': highwayCycleway.push(way); break;
        }
        return;
      }

      // Waterways
      if (way.tags.waterway) {
        const type = getWaterwayStyleKey(way.tags.waterway);
        switch (type) {
          case 'river': waterwayRiver.push(way); break;
          case 'stream': waterwayStream.push(way); break;
          case 'canal': waterwayCanal.push(way); break;
          default: waterwayCanal.push(way);
        }
        return;
      }

      // Natural features
      if (way.tags.natural === 'water') {
        naturalWater.push(way);
        return;
      }
      if (way.tags.natural === 'wood') {
        naturalWood.push(way);
        return;
      }
      if (way.tags.natural === 'grassland' || way.tags.natural === 'grass') {
        naturalGrassland.push(way);
        return;
      }
      if (way.tags.natural === 'beach') {
        naturalBeach.push(way);
        return;
      }

      // Landuse
      if (way.tags.landuse === 'forest') {
        landuseForest.push(way);
        return;
      }
      if (way.tags.landuse === 'farmland' || way.tags.landuse === 'farm' ||
          way.tags.landuse === 'farmyard' || way.tags.landuse === 'orchard' ||
          way.tags.landuse === 'vineyard') {
        landuseFarmland.push(way);
        return;
      }
      if (way.tags.landuse === 'residential') {
        landuseResidential.push(way);
        return;
      }
      if (way.tags.landuse === 'commercial' || way.tags.landuse === 'retail') {
        landuseCommercial.push(way);
        return;
      }
      if (way.tags.landuse === 'industrial') {
        landuseIndustrial.push(way);
        return;
      }

      // Parks and green spaces -> grassland
      if (way.tags.landuse === 'grass' || way.tags.landuse === 'park' ||
          way.tags.landuse === 'meadow' || way.tags.leisure === 'park' ||
          way.tags.leisure === 'garden' || way.tags.leisure === 'playground') {
        naturalGrassland.push(way);
      }
    });

  // Collect POI nodes
  const poiNodes: { x: number; y: number; iconName: string; name?: string }[] = [];
  osmData.elements
    .filter((el: any) => el.type === 'node' && el.tags)
    .forEach((node: any) => {
      const iconName = getPOIIcon(node.tags);
      if (iconName) {
        const x = lonToX(node.lon);
        const y = latToY(node.lat);
        // Only include POIs within bounds
        if (x >= 0 && x <= svgWidth && y >= 0 && y <= svgHeight) {
          poiNodes.push({
            x,
            y,
            iconName,
            name: node.tags.name
          });
        }
      }
    });

  // Collect house numbers
  const houseNumbers: { x: number; y: number; number: string }[] = [];
  osmData.elements
    .filter((el: any) => el.type === 'node' && el.tags && el.tags['addr:housenumber'])
    .forEach((node: any) => {
      const x = lonToX(node.lon);
      const y = latToY(node.lat);
      // Only include house numbers within bounds
      if (x >= 0 && x <= svgWidth && y >= 0 && y <= svgHeight) {
        houseNumbers.push({
          x,
          y,
          number: node.tags['addr:housenumber']
        });
      }
    });

  // Collect named areas (parks, forests, water bodies, etc.)
  const namedAreas: { x: number; y: number; name: string; type: string }[] = [];
  osmData.elements
    .filter((el: any) => el.type === 'way' && el.nodes && el.tags?.name)
    .forEach((way: any) => {
      const tags = way.tags;
      let areaType: string | null = null;

      // Check for named areas
      if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'playground') {
        areaType = 'park';
      } else if (tags.landuse === 'forest' || tags.natural === 'wood') {
        areaType = 'forest';
      } else if (tags.natural === 'water' || tags.waterway === 'riverbank') {
        areaType = 'water';
      } else if (tags.natural === 'grassland' || tags.landuse === 'grass' || tags.landuse === 'meadow') {
        areaType = 'grassland';
      } else if (tags.natural === 'beach') {
        areaType = 'beach';
      } else if (tags.landuse === 'cemetery') {
        areaType = 'cemetery';
      }

      if (areaType) {
        const centroid = calculateCentroid(way, nodes, latToY, lonToX);
        if (centroid && centroid.x >= 0 && centroid.x <= svgWidth && centroid.y >= 0 && centroid.y <= svgHeight) {
          namedAreas.push({
            x: centroid.x,
            y: centroid.y,
            name: tags.name,
            type: areaType
          });
        }
      }
    });

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
    /* Background */
    .background { fill: ${style.backgroundColor || '#f5f5f5'}; }

    /* === LANDUSE === */
    .landuse-residential {
      fill: ${style.landuse.residential.color};
      fill-opacity: ${style.landuse.residential.opacity};
      stroke: none;
    }
    .landuse-commercial {
      fill: ${style.landuse.commercial.color};
      fill-opacity: ${style.landuse.commercial.opacity};
      stroke: none;
    }
    .landuse-industrial {
      fill: ${style.landuse.industrial.color};
      fill-opacity: ${style.landuse.industrial.opacity};
      stroke: none;
    }
    .landuse-farmland {
      fill: ${style.landuse.farmland.color};
      fill-opacity: ${style.landuse.farmland.opacity};
      stroke: none;
    }
    .landuse-forest {
      fill: ${style.landuse.forest.color};
      fill-opacity: ${style.landuse.forest.opacity};
      stroke: ${deriveCasingColor(style.landuse.forest.color)};
      stroke-width: 0.5;
      stroke-opacity: 0.5;
    }

    /* === NATURAL === */
    .natural-water {
      fill: ${style.natural.water.color};
      fill-opacity: ${style.natural.water.opacity};
      stroke: ${deriveCasingColor(style.natural.water.color)};
      stroke-width: 0.5;
      stroke-opacity: 0.5;
    }
    .natural-wood {
      fill: ${style.natural.wood.color};
      fill-opacity: ${style.natural.wood.opacity};
      stroke: ${deriveCasingColor(style.natural.wood.color)};
      stroke-width: 0.5;
      stroke-opacity: 0.5;
    }
    .natural-grassland {
      fill: ${style.natural.grassland.color};
      fill-opacity: ${style.natural.grassland.opacity};
      stroke: none;
    }
    .natural-beach {
      fill: ${style.natural.beach.color};
      fill-opacity: ${style.natural.beach.opacity};
      stroke: none;
    }

    /* === WATERWAY === */
    .waterway-river {
      fill: none;
      stroke: ${style.waterway.river.color};
      stroke-width: ${4 * scale};
      stroke-opacity: ${style.waterway.river.opacity};
      stroke-linecap: round;
    }
    .waterway-stream {
      fill: none;
      stroke: ${style.waterway.stream.color};
      stroke-width: ${2 * scale};
      stroke-opacity: ${style.waterway.stream.opacity};
      stroke-linecap: round;
    }
    .waterway-canal {
      fill: none;
      stroke: ${style.waterway.canal.color};
      stroke-width: ${3 * scale};
      stroke-opacity: ${style.waterway.canal.opacity};
      stroke-linecap: round;
    }

    /* === BUILDING SHADOWS === */
    .building-shadow {
      fill: #000000;
      fill-opacity: 0.15;
      stroke: none;
    }

    /* === BUILDINGS === */
    .building-residential {
      fill: ${style.building.residential.color};
      fill-opacity: ${style.building.residential.opacity};
      stroke: ${style.buildingStrokeEnabled !== false ? (style.building.residential.strokeColor || deriveCasingColor(style.building.residential.color)) : 'none'};
      stroke-width: ${style.buildingStrokeEnabled !== false ? '0.5' : '0'};
      stroke-opacity: ${style.buildingStrokeEnabled !== false ? '1' : '0'};
    }
    .building-commercial {
      fill: ${style.building.commercial.color};
      fill-opacity: ${style.building.commercial.opacity};
      stroke: ${style.buildingStrokeEnabled !== false ? (style.building.commercial.strokeColor || deriveCasingColor(style.building.commercial.color)) : 'none'};
      stroke-width: ${style.buildingStrokeEnabled !== false ? '0.5' : '0'};
      stroke-opacity: ${style.buildingStrokeEnabled !== false ? '1' : '0'};
    }
    .building-industrial {
      fill: ${style.building.industrial.color};
      fill-opacity: ${style.building.industrial.opacity};
      stroke: ${style.buildingStrokeEnabled !== false ? (style.building.industrial.strokeColor || deriveCasingColor(style.building.industrial.color)) : 'none'};
      stroke-width: ${style.buildingStrokeEnabled !== false ? '0.5' : '0'};
      stroke-opacity: ${style.buildingStrokeEnabled !== false ? '1' : '0'};
    }
    .building-religious {
      fill: ${style.building.religious.color};
      fill-opacity: ${style.building.religious.opacity};
      stroke: ${style.buildingStrokeEnabled !== false ? (style.building.religious.strokeColor || deriveCasingColor(style.building.religious.color)) : 'none'};
      stroke-width: ${style.buildingStrokeEnabled !== false ? '0.5' : '0'};
      stroke-opacity: ${style.buildingStrokeEnabled !== false ? '1' : '0'};
    }
    .building-default {
      fill: ${style.building.default.color};
      fill-opacity: ${style.building.default.opacity};
      stroke: ${style.buildingStrokeEnabled !== false ? (style.building.default.strokeColor || deriveCasingColor(style.building.default.color)) : 'none'};
      stroke-width: ${style.buildingStrokeEnabled !== false ? '0.5' : '0'};
      stroke-opacity: ${style.buildingStrokeEnabled !== false ? '1' : '0'};
    }

    /* === RAILWAYS === */
    .railway-base {
      fill: none;
      stroke: #8c8c8c;
      stroke-width: ${4 * scale};
      stroke-opacity: 1;
      stroke-linecap: butt;
    }
    .railway-ties {
      fill: none;
      stroke: #ffffff;
      stroke-width: ${2.5 * scale};
      stroke-opacity: 1;
      stroke-dasharray: ${4 * scale}, ${4 * scale};
      stroke-linecap: butt;
    }

    /* === HIGHWAY CASINGS === */
    .highway-motorway-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.motorway.color)};
      stroke-opacity: ${style.highway.motorway.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-primary-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.primary.color)};
      stroke-opacity: ${style.highway.primary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-secondary-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.secondary.color)};
      stroke-opacity: ${style.highway.secondary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-tertiary-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.tertiary.color)};
      stroke-opacity: ${style.highway.tertiary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-residential-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.residential.color)};
      stroke-opacity: ${style.highway.residential.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-path-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.path.color)};
      stroke-opacity: ${style.highway.path.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-cycleway-casing {
      fill: none;
      stroke: ${deriveCasingColor(style.highway.cycleway.color)};
      stroke-opacity: ${style.highway.cycleway.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* === HIGHWAY FILLS === */
    .highway-motorway-fill {
      fill: none;
      stroke: ${style.highway.motorway.color};
      stroke-opacity: ${style.highway.motorway.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-primary-fill {
      fill: none;
      stroke: ${style.highway.primary.color};
      stroke-opacity: ${style.highway.primary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-secondary-fill {
      fill: none;
      stroke: ${style.highway.secondary.color};
      stroke-opacity: ${style.highway.secondary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-tertiary-fill {
      fill: none;
      stroke: ${style.highway.tertiary.color};
      stroke-opacity: ${style.highway.tertiary.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-residential-fill {
      fill: none;
      stroke: ${style.highway.residential.color};
      stroke-opacity: ${style.highway.residential.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-path-fill {
      fill: none;
      stroke: ${style.highway.path.color};
      stroke-opacity: ${style.highway.path.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .highway-cycleway-fill {
      fill: none;
      stroke: ${style.highway.cycleway.color};
      stroke-opacity: ${style.highway.cycleway.opacity};
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Road labels */
    .road-label {
      font-family: '${style.fontSize?.fontFamily || 'Roboto'}', 'Arial', sans-serif;
      fill: #333333;
      stroke: #ffffff;
      stroke-width: ${0.5 * scale};
      paint-order: stroke fill;
      font-weight: ${style.fontSize?.fontBold ? '700' : '500'};
    }

    /* Area labels (parks, forests, etc.) */
    .area-label {
      font-family: '${style.fontSize?.fontFamily || 'Roboto'}', 'Arial', sans-serif;
      fill: #2d5a27;
      stroke: #ffffff;
      stroke-width: ${0.4 * scale};
      paint-order: stroke fill;
      font-weight: ${style.fontSize?.fontBold ? '700' : '500'};
      font-style: italic;
      text-anchor: middle;
    }
    .area-label-water {
      fill: #1a5276;
    }
    .area-label-forest {
      fill: #1e5631;
    }

    /* House numbers */
    .housenumber {
      font-family: '${style.fontSize?.fontFamily || 'Roboto'}', 'Arial', sans-serif;
      fill: #000000;
      stroke: #ffffff;
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
      stroke-width: ${Math.max(style.borderWidth * scale, 3)};
      stroke-opacity: 1;
    }

    /* Exterior overlay */
    .exterior-overlay {
      fill: #000000;
      fill-opacity: ${options.exteriorOverlay ? options.exteriorOverlayOpacity : 0};
    }
  </style>

  <!-- Defs for mask and grayscale filter -->
  <defs>
    <!-- Mask for exterior: white = visible, black = hidden -->
    <mask id="exterior-mask">
      <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white" />
      <polygon points="${zoneToPolygonPoints(zone.coordinates, latToY, lonToX)}" fill="black" />
    </mask>
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

  // Build all content layers into a separate string (used for both interior and exterior)
  let contentLayers = '';

  // Helper to render polygon features
  const renderPolygons = (ways: any[], className: string) => {
    let content = '';
    // Don't apply color overrides to shadows - they should stay as shadows
    const isShadow = className === 'building-shadow';
    // Check if this is a building class (to also update stroke)
    const isBuilding = className.startsWith('building-') && !isShadow;

    for (const way of ways) {
      const pathData = wayToPath(way, nodes, latToY, lonToX, true);
      if (pathData) {
        // Check for color override (but not for shadows)
        const override = !isShadow ? colorOverrides?.overrides[way.id] : undefined;
        if (override) {
          // Apply override with inline style (fill and stroke for buildings)
          if (isBuilding) {
            const strokeColor = deriveCasingColor(override.color);
            content += `    <path class="${className}" d="${pathData}" style="fill:${override.color};stroke:${strokeColor}" />\n`;
          } else {
            content += `    <path class="${className}" d="${pathData}" style="fill:${override.color}" />\n`;
          }
        } else {
          content += `    <path class="${className}" d="${pathData}" />\n`;
        }
      }
    }
    return content;
  };

  // Helper to render line features
  const renderLines = (ways: any[], className: string) => {
    let content = '';
    for (const way of ways) {
      const pathData = wayToPath(way, nodes, latToY, lonToX, false);
      if (pathData) {
        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        if (override) {
          // Apply override with inline style
          content += `    <path class="${className}" d="${pathData}" style="stroke:${override.color}" />\n`;
        } else {
          content += `    <path class="${className}" d="${pathData}" />\n`;
        }
      }
    }
    return content;
  };

  // Landuse layer
  contentLayers += `    <g id="layer-landuse">\n`;
  contentLayers += renderPolygons(landuseResidential, 'landuse-residential');
  contentLayers += renderPolygons(landuseCommercial, 'landuse-commercial');
  contentLayers += renderPolygons(landuseIndustrial, 'landuse-industrial');
  contentLayers += renderPolygons(landuseFarmland, 'landuse-farmland');
  contentLayers += renderPolygons(landuseForest, 'landuse-forest');
  contentLayers += '    </g>\n';

  // Natural features layer
  contentLayers += `    <g id="layer-natural">\n`;
  contentLayers += renderPolygons(naturalWood, 'natural-wood');
  contentLayers += renderPolygons(naturalGrassland, 'natural-grassland');
  contentLayers += renderPolygons(naturalBeach, 'natural-beach');
  contentLayers += renderPolygons(naturalWater, 'natural-water');
  contentLayers += '    </g>\n';

  // Waterways layer
  contentLayers += `    <g id="layer-waterways">\n`;
  contentLayers += renderLines(waterwayRiver, 'waterway-river');
  contentLayers += renderLines(waterwayStream, 'waterway-stream');
  contentLayers += renderLines(waterwayCanal, 'waterway-canal');
  contentLayers += '    </g>\n';

  // Building shadows layer (offset for 3D effect)
  const shadowOffset = 3 * scale;
  contentLayers += `    <g id="layer-building-shadows" transform="translate(${shadowOffset}, ${shadowOffset})">\n`;
  contentLayers += renderPolygons(buildingResidential, 'building-shadow');
  contentLayers += renderPolygons(buildingCommercial, 'building-shadow');
  contentLayers += renderPolygons(buildingIndustrial, 'building-shadow');
  contentLayers += renderPolygons(buildingReligious, 'building-shadow');
  contentLayers += renderPolygons(buildingDefault, 'building-shadow');
  contentLayers += '    </g>\n';

  // Buildings layer
  contentLayers += `    <g id="layer-buildings">\n`;
  contentLayers += renderPolygons(buildingResidential, 'building-residential');
  contentLayers += renderPolygons(buildingCommercial, 'building-commercial');
  contentLayers += renderPolygons(buildingIndustrial, 'building-industrial');
  contentLayers += renderPolygons(buildingReligious, 'building-religious');
  contentLayers += renderPolygons(buildingDefault, 'building-default');
  contentLayers += '    </g>\n';

  // Railways layer
  contentLayers += `    <g id="layer-railways">\n`;
  for (const way of railways) {
    const pathData = wayToPath(way, nodes, latToY, lonToX, false);
    if (pathData) {
      contentLayers += `      <path class="railway-base" d="${pathData}" />\n`;
      contentLayers += `      <path class="railway-ties" d="${pathData}" />\n`;
    }
  }
  contentLayers += '    </g>\n';

  // Roads layer - render in order: casings first, then fills
  contentLayers += `    <g id="layer-roads">\n`;

  // All road arrays with their types
  const allRoads = [
    { ways: highwayPath, type: 'path', tag: 'path' },
    { ways: highwayCycleway, type: 'cycleway', tag: 'cycleway' },
    { ways: highwayResidential, type: 'residential', tag: 'residential' },
    { ways: highwayTertiary, type: 'tertiary', tag: 'tertiary' },
    { ways: highwaySecondary, type: 'secondary', tag: 'secondary' },
    { ways: highwayPrimary, type: 'primary', tag: 'primary' },
    { ways: highwayMotorway, type: 'motorway', tag: 'motorway' },
  ];

  // Road casings (outlines) first - render in reverse order (smaller roads under bigger)
  contentLayers += '      <g id="road-casings">\n';
  for (const { ways, type, tag } of allRoads) {
    for (const way of ways) {
      const pathData = wayToPath(way, nodes, latToY, lonToX, false);
      if (pathData) {
        const weight = getRoadWeight(tag, scale);
        contentLayers += `        <path class="highway-${type}-casing" d="${pathData}" style="stroke-width:${weight.casing}" />\n`;
      }
    }
  }
  contentLayers += '      </g>\n';

  // Road fills on top
  contentLayers += '      <g id="road-fills">\n';
  for (const { ways, type, tag } of allRoads) {
    for (const way of ways) {
      const pathData = wayToPath(way, nodes, latToY, lonToX, false);
      if (pathData) {
        const weight = getRoadWeight(tag, scale);
        contentLayers += `        <path class="highway-${type}-fill" d="${pathData}" style="stroke-width:${weight.fill}" />\n`;
      }
    }
  }
  contentLayers += '      </g>\n';
  contentLayers += '    </g>\n';

  // Prepare road label data (paths will go in main defs, text in content)
  const allWaysForLabels = [...highwayMotorway, ...highwayPrimary, ...highwaySecondary,
                            ...highwayTertiary, ...highwayResidential];

  // Group ways by name and find the best segment (longest) for each
  const roadsByName = new Map<string, { way: any; pathInfo: { pathData: string; length: number } }>();

  // Define clip bounds for road labels (visible SVG area)
  const labelClipBounds = { minX: 0, minY: 0, maxX: svgWidth, maxY: svgHeight };

  for (const way of allWaysForLabels) {
    const name = way.tags?.name;
    if (!name) continue;

    // Clip path to visible bounds so text is positioned within the visible area
    const pathInfo = getTextPathData(way, nodes, latToY, lonToX, labelClipBounds);
    if (!pathInfo) continue;

    // Keep the segment with the longest path
    const existing = roadsByName.get(name);
    if (!existing || pathInfo.length > existing.pathInfo.length) {
      roadsByName.set(name, { way, pathInfo });
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

  // Apply font size multiplier from style settings
  const roadFontSizeMultiplier = style.fontSize?.roads ?? 1;

  for (const [name, { way, pathInfo }] of roadsByName) {
    const weight = getRoadWeight(way.tags.highway, scale);
    const fontSize = weight.fontSize * roadFontSizeMultiplier;

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
  }

  // POI icons layer (rendered first, below labels) - only if showPOI is enabled
  if (options.showPOI) {
    contentLayers += `    <g id="layer-pois">\n`;
    const iconSize = 16 * scale; // Size of POI icons
    for (const poi of poiNodes) {
      const iconSvg = getIconSvg(poi.iconName);
      if (iconSvg) {
        // Embed the icon SVG, translated to position
        // Parse and re-embed with transform
        const iconX = poi.x - iconSize / 2;
        const iconY = poi.y - iconSize / 2;
        contentLayers += `      <g transform="translate(${iconX.toFixed(2)}, ${iconY.toFixed(2)})">\n`;
        // Scale the icon to the desired size (icons are 24x24 viewBox)
        const iconScale = iconSize / 24;
        contentLayers += `        <g transform="scale(${iconScale.toFixed(3)})">\n`;
        // Remove the outer SVG tags and just use the content
        const innerContent = iconSvg
          .replace(/<svg[^>]*>/, '')
          .replace(/<\/svg>/, '')
          .trim();
        contentLayers += `          ${innerContent}\n`;
        contentLayers += `        </g>\n`;
        contentLayers += `      </g>\n`;
      }
    }
    contentLayers += '    </g>\n';
  }

  // Build label layers separately (to render above the border)
  let labelLayers = '';

  // Area labels layer (parks, forests, water bodies, etc.)
  labelLayers += `    <g id="layer-area-names">\n`;
  const areaFontSizeMultiplier = style.fontSize?.areas ?? 1;
  const areaFontSize = 7 * scale * areaFontSizeMultiplier;
  for (const area of namedAreas) {
    const escapedName = area.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let extraClass = '';
    if (area.type === 'water') extraClass = ' area-label-water';
    else if (area.type === 'forest') extraClass = ' area-label-forest';
    labelLayers += `      <text class="area-label${extraClass}" x="${area.x.toFixed(2)}" y="${area.y.toFixed(2)}" font-size="${areaFontSize}">${escapedName}</text>\n`;
  }
  labelLayers += '    </g>\n';

  // House numbers layer
  labelLayers += `    <g id="layer-housenumbers">\n`;
  const houseNumberFontSize = 5 * scale;
  for (const hn of houseNumbers) {
    const escapedNumber = hn.number.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    labelLayers += `      <text class="housenumber" x="${hn.x.toFixed(2)}" y="${hn.y.toFixed(2)}" font-size="${houseNumberFontSize}">${escapedNumber}</text>\n`;
  }
  labelLayers += '    </g>\n';

  // Road names layer (text only, paths are in main defs) - rendered last so it appears on top
  labelLayers += `    <g id="layer-road-names">\n`;
  for (const { pathId, format, fontSize } of labelsToRender) {
    if (format.type === 'single') {
      // Single line label
      const escapedName = format.lines[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      labelLayers += `      <text class="road-label" font-size="${fontSize}">`;
      labelLayers += `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedName}</textPath></text>\n`;
    } else {
      // Multi-line label: use tspan elements with dy offset
      const lineHeight = fontSize * 1.2;
      const escapedLine1 = format.lines[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const escapedLine2 = format.lines[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // First line (offset up by half line height)
      labelLayers += `      <text class="road-label" font-size="${fontSize}" dy="${(-lineHeight / 2).toFixed(1)}">`;
      labelLayers += `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedLine1}</textPath></text>\n`;

      // Second line (offset down by half line height)
      labelLayers += `      <text class="road-label" font-size="${fontSize}" dy="${(lineHeight / 2).toFixed(1)}">`;
      labelLayers += `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedLine2}</textPath></text>\n`;
    }
  }
  labelLayers += '    </g>\n';

  // Add road label path definitions to main defs
  svg = svg.replace('</defs>', `${roadLabelPathDefs}  </defs>`);

  // Now assemble final SVG with colored base and grayscale exterior overlay

  // Base layer with full colored content (as proper Inkscape layers)
  svg += `  <!-- Contenu principal -->\n`;
  svg += `  <g id="layer-fond" inkscape:groupmode="layer" inkscape:label="Fond">\n`;
  svg += `    <rect class="background" x="0" y="0" width="${svgWidth}" height="${svgHeight}" />\n`;
  svg += `  </g>\n\n`;

  // Exterior (grayscale) - first so it's behind
  svg += `  <g id="layer-exterior" inkscape:groupmode="layer" inkscape:label="Extérieur (gris)" filter="url(#grayscale)" mask="url(#exterior-mask)">\n`;
  svg += contentLayers;
  svg += '  </g>\n\n';

  // Interior (colored) - on top, clipped to polygon
  svg += `  <g id="layer-interior" inkscape:groupmode="layer" inkscape:label="Intérieur (couleur)">\n`;
  svg += `    <clipPath id="zone-clip"><polygon points="${zoneToPolygonPoints(zone.coordinates, latToY, lonToX)}" /></clipPath>\n`;
  svg += `    <g clip-path="url(#zone-clip)">\n`;
  svg += contentLayers;
  svg += '    </g>\n';
  svg += '  </g>\n\n';

  // Exterior overlay (semi-transparent gray outside the zone)
  const polygonPoints = zoneToPolygonPoints(zone.coordinates, latToY, lonToX);
  if (options.exteriorOverlay) {
    // Create a path with a hole: outer rectangle + inner zone polygon (using fill-rule evenodd)
    // Convert polygon points "x1,y1 x2,y2 ..." to path "M x1,y1 L x2,y2 ..."
    const innerPathPoints = polygonPoints.split(' ');
    const innerPath = innerPathPoints.length > 0
      ? `M ${innerPathPoints[0]} ${innerPathPoints.slice(1).map(p => `L ${p}`).join(' ')} Z`
      : '';
    svg += `  <g id="layer-exterior-overlay" inkscape:groupmode="layer" inkscape:label="Voile extérieur">\n`;
    svg += `    <path class="exterior-overlay" fill-rule="evenodd" d="M 0,0 L ${svgWidth},0 L ${svgWidth},${svgHeight} L 0,${svgHeight} Z ${innerPath}" />\n`;
    svg += '  </g>\n\n';
  }

  // Zone border layer - now a polygon
  svg += `  <!-- Zone border -->\n  <g id="layer-border" inkscape:groupmode="layer" inkscape:label="Bordure">
    <polygon class="zone-border" points="${polygonPoints}" />
  </g>

`;

  // Labels layer - rendered above the border
  svg += `  <g id="layer-labels" inkscape:groupmode="layer" inkscape:label="Labels">\n`;
  svg += labelLayers;
  svg += '  </g>\n';

  svg += '</svg>';

  return svg;
}
