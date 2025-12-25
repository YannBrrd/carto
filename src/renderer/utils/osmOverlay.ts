import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ElementCategory } from '../types';
import { getIconSvg } from '../assets/icons';
import { buildNodeMap } from './geometry';

// Options for createOSMOverlay
export interface OSMOverlayOptions {
  colorOverrides?: ColorOverridesState;
  onElementClick?: (wayId: number, category: ElementCategory) => void;
  clickableCategory?: ElementCategory;
}

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
  if (tags.amenity && POI_ICON_MAP[tags.amenity]) {
    return POI_ICON_MAP[tags.amenity];
  }
  if (tags.tourism && POI_ICON_MAP[tags.tourism]) {
    return POI_ICON_MAP[tags.tourism];
  }
  if (tags.shop && POI_ICON_MAP[tags.shop]) {
    return POI_ICON_MAP[tags.shop];
  }
  if (tags.highway === 'bus_stop') {
    return 'bus_stop';
  }
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

// Get road weight based on highway type
function getRoadWeight(highway: string): { fill: number; casing: number } {
  switch (highway) {
    case 'motorway':
    case 'trunk':
      return { fill: 6, casing: 8 };
    case 'primary':
      return { fill: 5, casing: 7 };
    case 'secondary':
      return { fill: 4, casing: 6 };
    case 'tertiary':
      return { fill: 3, casing: 5 };
    case 'residential':
    case 'living_street':
      return { fill: 2, casing: 4 };
    case 'path':
    case 'footway':
    case 'pedestrian':
      return { fill: 1.5, casing: 2.5 };
    case 'cycleway':
      return { fill: 2, casing: 3 };
    default:
      return { fill: 2, casing: 4 };
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

export function createOSMOverlay(
  map: L.Map,
  osmData: any,
  style: RenderStyle,
  options?: OSMOverlayOptions
): L.LayerGroup {
  const layerGroup = L.layerGroup();
  const { colorOverrides, onElementClick, clickableCategory } = options || {};

  // Build node map (using shared utility)
  const nodes = buildNodeMap(osmData);

  // Process ways and render them with custom styles
  for (const way of osmData.elements) {
    // Skip non-ways and ways without nodes
    if (way.type !== 'way' || !way.nodes || way.nodes.length === 0) continue;
      const coordinates = way.nodes
        .map((nodeId: number) => nodes.get(nodeId))
        .filter((node: any) => node !== undefined)
        .map((node: any) => [node.lat, node.lon] as [number, number]);

    if (coordinates.length < 2) continue;

    if (!way.tags) continue;

      // Building
      if (way.tags.building) {
        const buildingType = getBuildingStyleKey(way.tags.building);
        const buildingStyle = style.building[buildingType];

        // Close the polygon if not already closed
        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : buildingStyle.color;

        // Use strokeColor if defined and enabled, otherwise no stroke or derive from fill color
        const strokeEnabled = style.buildingStrokeEnabled !== false;
        const strokeColor = strokeEnabled
          ? (override ? deriveCasingColor(override.color) : (buildingStyle.strokeColor || deriveCasingColor(buildingStyle.color)))
          : 'transparent';

        const isClickable = clickableCategory === 'building' && !!onElementClick;

        const polygon = L.polygon(coordinates, {
          color: strokeColor,
          fillColor: fillColor,
          fillOpacity: buildingStyle.opacity,
          weight: strokeEnabled ? 1 : 0,
          opacity: strokeEnabled ? buildingStyle.opacity : 0,
          interactive: isClickable,  // Only interactive if clickable
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'building' as ElementCategory;

        // Add click handler if this category is clickable
        if (isClickable) {
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'building');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Highway (roads, paths, cycleways)
      if (way.tags.highway) {
        const highwayType = getHighwayStyleKey(way.tags.highway);
        const highwayStyle = style.highway[highwayType];
        const weight = getRoadWeight(way.tags.highway);

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : highwayStyle.color;
        const casingColor = deriveCasingColor(fillColor);

        // Road casing (outline)
        const casing = L.polyline(coordinates, {
          color: override ? '#000000' : casingColor,
          weight: override ? weight.casing + 1 : weight.casing,
          opacity: highwayStyle.opacity,
        });
        casing.addTo(layerGroup);

        // Road fill
        const polyline = L.polyline(coordinates, {
          color: fillColor,
          weight: weight.fill,
          opacity: highwayStyle.opacity,
        });

        // Store way metadata
        (polyline as any).wayId = way.id;
        (polyline as any).wayCategory = 'highway' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'highway' && onElementClick) {
          polyline.setStyle({ cursor: 'pointer' } as any);
          polyline.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'highway');
          });
        }

        polyline.addTo(layerGroup);
        continue;
      }

      // Waterway
      if (way.tags.waterway) {
        const waterwayType = getWaterwayStyleKey(way.tags.waterway);
        const waterwayStyle = style.waterway[waterwayType];

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const lineColor = override ? override.color : waterwayStyle.color;

        const polyline = L.polyline(coordinates, {
          color: lineColor,
          weight: waterwayType === 'river' ? 4 : waterwayType === 'stream' ? 2 : 3,
          opacity: waterwayStyle.opacity,
        });

        // Store way metadata
        (polyline as any).wayId = way.id;
        (polyline as any).wayCategory = 'waterway' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'waterway' && onElementClick) {
          polyline.setStyle({ cursor: 'pointer' } as any);
          polyline.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'waterway');
          });
        }

        polyline.addTo(layerGroup);
        continue;
      }

      // Natural water bodies
      if (way.tags.natural === 'water') {
        const waterStyle = style.natural.water;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : waterStyle.color;

        const polygon = L.polygon(coordinates, {
          color: override ? '#000000' : fillColor,
          fillColor: fillColor,
          fillOpacity: waterStyle.opacity,
          weight: override ? 2 : 1,
          opacity: waterStyle.opacity,
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'natural' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'natural' && onElementClick) {
          polygon.setStyle({ cursor: 'pointer' } as any);
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'natural');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Natural wood
      if (way.tags.natural === 'wood') {
        const woodStyle = style.natural.wood;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : woodStyle.color;

        const polygon = L.polygon(coordinates, {
          color: override ? '#000000' : fillColor,
          fillColor: fillColor,
          fillOpacity: woodStyle.opacity,
          weight: override ? 2 : 0.5,
          opacity: override ? 1 : 0.5,
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'natural' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'natural' && onElementClick) {
          polygon.setStyle({ cursor: 'pointer' } as any);
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'natural');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Natural grassland
      if (way.tags.natural === 'grassland' || way.tags.natural === 'grass') {
        const grassStyle = style.natural.grassland;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : grassStyle.color;

        const polygon = L.polygon(coordinates, {
          color: override ? '#000000' : fillColor,
          fillColor: fillColor,
          fillOpacity: grassStyle.opacity,
          weight: override ? 2 : 0.5,
          opacity: override ? 1 : grassStyle.opacity,
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'natural' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'natural' && onElementClick) {
          polygon.setStyle({ cursor: 'pointer' } as any);
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'natural');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Natural beach
      if (way.tags.natural === 'beach') {
        const beachStyle = style.natural.beach;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : beachStyle.color;

        const polygon = L.polygon(coordinates, {
          color: override ? '#000000' : fillColor,
          fillColor: fillColor,
          fillOpacity: beachStyle.opacity,
          weight: override ? 2 : 0.5,
          opacity: override ? 1 : beachStyle.opacity,
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'natural' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'natural' && onElementClick) {
          polygon.setStyle({ cursor: 'pointer' } as any);
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'natural');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Landuse - forest
      if (way.tags.landuse === 'forest') {
        const forestStyle = style.landuse.forest;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: forestStyle.color,
          fillColor: forestStyle.color,
          fillOpacity: forestStyle.opacity,
          weight: 0.5,
          opacity: 0.5,
        });
        polygon.addTo(layerGroup);
        continue;
      }

      // Landuse - farmland
      if (way.tags.landuse === 'farmland' || way.tags.landuse === 'farm' ||
          way.tags.landuse === 'farmyard' || way.tags.landuse === 'orchard' ||
          way.tags.landuse === 'vineyard') {
        const farmStyle = style.landuse.farmland;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: farmStyle.color,
          fillColor: farmStyle.color,
          fillOpacity: farmStyle.opacity,
          weight: 0.5,
          opacity: farmStyle.opacity,
        });
        polygon.addTo(layerGroup);
        continue;
      }

      // Landuse - residential
      if (way.tags.landuse === 'residential') {
        const residentialStyle = style.landuse.residential;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: residentialStyle.color,
          fillColor: residentialStyle.color,
          fillOpacity: residentialStyle.opacity,
          weight: 0.5,
          opacity: residentialStyle.opacity,
        });
        polygon.addTo(layerGroup);
        continue;
      }

      // Landuse - commercial/retail
      if (way.tags.landuse === 'commercial' || way.tags.landuse === 'retail') {
        const commercialStyle = style.landuse.commercial;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: commercialStyle.color,
          fillColor: commercialStyle.color,
          fillOpacity: commercialStyle.opacity,
          weight: 0.5,
          opacity: commercialStyle.opacity,
        });
        polygon.addTo(layerGroup);
        continue;
      }

      // Landuse - industrial
      if (way.tags.landuse === 'industrial') {
        const industrialStyle = style.landuse.industrial;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: industrialStyle.color,
          fillColor: industrialStyle.color,
          fillOpacity: industrialStyle.opacity,
          weight: 0.5,
          opacity: industrialStyle.opacity,
        });
        polygon.addTo(layerGroup);
        continue;
      }

      // Parks and green spaces (leisure)
      if (way.tags.landuse === 'grass' || way.tags.landuse === 'park' ||
          way.tags.landuse === 'meadow' || way.tags.leisure === 'park' ||
          way.tags.leisure === 'garden' || way.tags.leisure === 'playground') {
        const parkStyle = style.natural.grassland;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : parkStyle.color;

        const polygon = L.polygon(coordinates, {
          color: override ? '#000000' : fillColor,
          fillColor: fillColor,
          fillOpacity: parkStyle.opacity,
          weight: override ? 2 : 1,
          opacity: override ? 1 : parkStyle.opacity,
        });

        // Store way metadata
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'natural' as ElementCategory;

        // Add click handler if this category is clickable
        if (clickableCategory === 'natural' && onElementClick) {
          polygon.setStyle({ cursor: 'pointer' } as any);
          polygon.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            onElementClick(way.id, 'natural');
          });
        }

        polygon.addTo(layerGroup);
        continue;
      }

      // Railway
      if (way.tags.railway && way.tags.railway !== 'abandoned') {
        // Base line
        const railBase = L.polyline(coordinates, {
          color: '#444444',
          weight: 4,
          opacity: 0.8,
        });
        railBase.addTo(layerGroup);

        // Dashed white line for ties
        const railTies = L.polyline(coordinates, {
          color: '#ffffff',
          weight: 2,
          opacity: 0.9,
          dashArray: '6, 6',
        });
        railTies.addTo(layerGroup);
      }
  }

  // Process POI nodes
  osmData.elements
    .filter((el: any) => el.type === 'node' && el.tags)
    .forEach((node: any) => {
      const iconName = getPOIIcon(node.tags);
      if (iconName) {
        const iconSvg = getIconSvg(iconName);
        if (iconSvg) {
          // Create a divIcon with the SVG content
          const icon = L.divIcon({
            className: 'poi-icon',
            html: iconSvg,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          const marker = L.marker([node.lat, node.lon], { icon });
          marker.addTo(layerGroup);
        }
      }
    });

  // Process house numbers
  osmData.elements
    .filter((el: any) => el.type === 'node' && el.tags && el.tags['addr:housenumber'])
    .forEach((node: any) => {
      const houseNumber = node.tags['addr:housenumber'];
      const icon = L.divIcon({
        className: 'housenumber-label',
        html: `<span style="font-size: 10px; font-weight: 400; color: #000; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;">${houseNumber}</span>`,
        iconSize: [20, 14],
        iconAnchor: [10, 7],
      });
      const marker = L.marker([node.lat, node.lon], { icon });
      marker.addTo(layerGroup);
    });

  return layerGroup;
}
