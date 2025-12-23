import L from 'leaflet';
import { RenderStyle, Zone } from '../types';

// Darken a hex color by a fixed amount for road casing
function deriveCasingColor(fillColor: string): string {
  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

  let pathData = `M ${coordinates[0].x.toFixed(2)},${coordinates[0].y.toFixed(2)}`;
  for (let i = 1; i < coordinates.length; i++) {
    pathData += ` L ${coordinates[i].x.toFixed(2)},${coordinates[i].y.toFixed(2)}`;
  }

  if (closePath) {
    pathData += ' Z';
  }

  return pathData;
}

// Get road weight based on highway type
function getRoadWeight(highway: string, scale: number): { fill: number; casing: number; fontSize: number } {
  switch (highway) {
    case 'motorway':
    case 'trunk':
      return { fill: 6 * scale, casing: 8 * scale, fontSize: 6 * scale };
    case 'primary':
      return { fill: 5 * scale, casing: 7 * scale, fontSize: 5.5 * scale };
    case 'secondary':
      return { fill: 4 * scale, casing: 6 * scale, fontSize: 5 * scale };
    case 'tertiary':
      return { fill: 3 * scale, casing: 5 * scale, fontSize: 4.5 * scale };
    case 'residential':
    case 'living_street':
      return { fill: 2 * scale, casing: 4 * scale, fontSize: 4 * scale };
    case 'path':
    case 'footway':
    case 'pedestrian':
      return { fill: 1.5 * scale, casing: 2.5 * scale, fontSize: 3.5 * scale };
    case 'cycleway':
      return { fill: 2 * scale, casing: 3 * scale, fontSize: 3.5 * scale };
    default:
      return { fill: 2 * scale, casing: 4 * scale, fontSize: 4 * scale };
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
function getBuildingStyleKey(building: string): keyof RenderStyle['building'] {
  switch (building) {
    case 'residential':
    case 'apartments':
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'terrace':
      return 'residential';
    case 'commercial':
    case 'retail':
    case 'office':
    case 'supermarket':
      return 'commercial';
    case 'industrial':
    case 'warehouse':
    case 'factory':
      return 'industrial';
    case 'church':
    case 'chapel':
    case 'cathedral':
    case 'mosque':
    case 'synagogue':
    case 'temple':
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

// Get path data for textPath with proper direction for readability
function getTextPathData(
  way: any,
  nodes: Map<number, { lat: number; lon: number }>,
  latToY: (lat: number) => number,
  lonToX: (lon: number) => number
): { pathData: string; length: number } | null {
  const coords: { x: number; y: number }[] = [];
  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (node) {
      coords.push({ x: lonToX(node.lon), y: latToY(node.lat) });
    }
  }
  if (coords.length < 2) return null;

  // Calculate total length
  let totalLength = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i - 1].x;
    const dy = coords[i].y - coords[i - 1].y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  // Check overall direction: if path goes right-to-left, reverse it for readable text
  const firstX = coords[0].x;
  const lastX = coords[coords.length - 1].x;
  const orderedCoords = lastX < firstX ? [...coords].reverse() : coords;

  // Build path data
  let pathData = `M ${orderedCoords[0].x.toFixed(2)},${orderedCoords[0].y.toFixed(2)}`;
  for (let i = 1; i < orderedCoords.length; i++) {
    pathData += ` L ${orderedCoords[i].x.toFixed(2)},${orderedCoords[i].y.toFixed(2)}`;
  }

  return { pathData, length: totalLength };
}

// Check if text fits on path (no truncation - just yes/no)
function textFitsOnPath(text: string, pathLength: number, fontSize: number): boolean {
  // Approximate text width: 0.5 * fontSize per character (tighter estimate)
  const textWidth = text.length * fontSize * 0.5;
  // Text can use up to 100% of path length
  return textWidth <= pathLength;
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
  map: L.Map
): string {
  // Get bounds from zone
  const bounds: L.LatLngBounds = zone.bounds;

  // Calculate SVG dimensions based on the selected zone in pixels
  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());
  const width = Math.abs(se.x - nw.x);
  const height = Math.abs(se.y - nw.y);

  // Use higher resolution for better quality
  const scale = 2;
  const svgWidth = width * scale;
  const svgHeight = height * scale;

  // Create coordinate transformation functions
  const latToY = (lat: number) => {
    const ratio = (bounds.getNorth() - lat) /
                  (bounds.getNorth() - bounds.getSouth());
    return ratio * svgHeight;
  };

  const lonToX = (lon: number) => {
    const ratio = (lon - bounds.getWest()) /
                  (bounds.getEast() - bounds.getWest());
    return ratio * svgWidth;
  };

  // Build node map
  const nodes = new Map<number, { lat: number; lon: number }>();
  osmData.elements
    .filter((el: any) => el.type === 'node')
    .forEach((node: any) => {
      nodes.set(node.id, { lat: node.lat, lon: node.lon });
    });

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
    .background { fill: #f5f5f5; }

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

    /* === BUILDINGS === */
    .building-residential {
      fill: ${style.building.residential.color};
      fill-opacity: ${style.building.residential.opacity};
      stroke: ${deriveCasingColor(style.building.residential.color)};
      stroke-width: 0.5;
      stroke-opacity: 1;
    }
    .building-commercial {
      fill: ${style.building.commercial.color};
      fill-opacity: ${style.building.commercial.opacity};
      stroke: ${deriveCasingColor(style.building.commercial.color)};
      stroke-width: 0.5;
      stroke-opacity: 1;
    }
    .building-industrial {
      fill: ${style.building.industrial.color};
      fill-opacity: ${style.building.industrial.opacity};
      stroke: ${deriveCasingColor(style.building.industrial.color)};
      stroke-width: 0.5;
      stroke-opacity: 1;
    }
    .building-religious {
      fill: ${style.building.religious.color};
      fill-opacity: ${style.building.religious.opacity};
      stroke: ${deriveCasingColor(style.building.religious.color)};
      stroke-width: 0.5;
      stroke-opacity: 1;
    }
    .building-default {
      fill: ${style.building.default.color};
      fill-opacity: ${style.building.default.opacity};
      stroke: ${deriveCasingColor(style.building.default.color)};
      stroke-width: 0.5;
      stroke-opacity: 1;
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
      font-family: 'Roboto', 'Arial', sans-serif;
      fill: #333333;
      stroke: #ffffff;
      stroke-width: ${0.5 * scale};
      paint-order: stroke fill;
      font-weight: 500;
    }

    /* Zone border */
    .zone-border {
      fill: none;
      stroke: ${style.borderColor};
      stroke-width: ${Math.max(style.borderWidth * scale, 3)};
      stroke-opacity: ${style.strokeOpacity};
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
    for (const way of ways) {
      const pathData = wayToPath(way, nodes, latToY, lonToX, true);
      if (pathData) {
        content += `    <path class="${className}" d="${pathData}" />\n`;
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
        content += `    <path class="${className}" d="${pathData}" />\n`;
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

  for (const way of allWaysForLabels) {
    const name = way.tags?.name;
    if (!name) continue;

    const pathInfo = getTextPathData(way, nodes, latToY, lonToX);
    if (!pathInfo) continue;

    // Keep the segment with the longest path
    const existing = roadsByName.get(name);
    if (!existing || pathInfo.length > existing.pathInfo.length) {
      roadsByName.set(name, { way, pathInfo });
    }
  }

  // Collect labels to render and build path defs
  const labelsToRender: { pathId: string; name: string; fontSize: number }[] = [];
  let roadLabelPathDefs = '';
  let pathIdCounter = 0;

  for (const [name, { way, pathInfo }] of roadsByName) {
    const weight = getRoadWeight(way.tags.highway, scale);
    const fontSize = weight.fontSize;

    // Only show label if text fits on path (no truncation)
    if (!textFitsOnPath(name, pathInfo.length, fontSize)) continue;

    const pathId = `road-label-path-${pathIdCounter++}`;
    roadLabelPathDefs += `    <path id="${pathId}" d="${pathInfo.pathData}" />\n`;
    labelsToRender.push({ pathId, name, fontSize });
  }

  // Road names layer (text only, paths are in main defs)
  contentLayers += `    <g id="layer-road-names">\n`;
  for (const { pathId, name, fontSize } of labelsToRender) {
    const escapedName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    contentLayers += `      <text class="road-label" font-size="${fontSize}">`;
    contentLayers += `<textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapedName}</textPath></text>\n`;
  }
  contentLayers += '    </g>\n';

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

  // Zone border layer - now a polygon
  const polygonPoints = zoneToPolygonPoints(zone.coordinates, latToY, lonToX);
  svg += `  <!-- Zone border -->\n  <g id="layer-border" inkscape:groupmode="layer" inkscape:label="Bordure">
    <polygon class="zone-border" points="${polygonPoints}" />
  </g>
`;

  svg += '</svg>';

  return svg;
}
