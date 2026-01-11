import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ElementCategory } from '../types';
import { getIconSvg } from '../assets/icons';
import { buildNodeMap, deriveCasingColor } from './geometry';

// Options for createOSMOverlay
export interface OSMOverlayOptions {
  colorOverrides?: ColorOverridesState;
  onElementClick?: (wayId: number, category: ElementCategory) => void;
  clickableCategory?: ElementCategory;
  showLabels?: boolean;  // Show house numbers (use in offline mode only to avoid duplicates with Carto tiles)
  showPOI?: boolean;     // Show POI icons (default: true)
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
  // Use featureGroup for event delegation
  const layerGroup = L.featureGroup();
  const { colorOverrides, onElementClick, showLabels = false, showPOI = true } = options || {};

  // Use Canvas renderer for better performance with many elements
  const renderer = L.canvas({ padding: 0.5 });

  // Single delegated click handler for all elements (filtering done by caller)
  if (onElementClick) {
    layerGroup.on('click', (e: L.LeafletMouseEvent) => {
      const layer = e.propagatedFrom || e.layer;
      if (layer) {
        const wayId = (layer as any).wayId;
        const wayCategory = (layer as any).wayCategory;
        if (wayId && wayCategory) {
          L.DomEvent.stopPropagation(e);
          onElementClick(wayId, wayCategory);
        }
      }
    });
  }

  // Build node map (using shared utility)
  const nodes = buildNodeMap(osmData);

  // Helper to get coordinates from way nodes
  const getWayCoordinates = (way: any): [number, number][] | null => {
    const coordinates = way.nodes
      .map((nodeId: number) => nodes.get(nodeId))
      .filter((node: any) => node !== undefined)
      .map((node: any) => [node.lat, node.lon] as [number, number]);
    return coordinates.length >= 2 ? coordinates : null;
  };

  // Filter ways with valid tags and coordinates
  const ways = osmData.elements.filter(
    (el: any) => el.type === 'way' && el.nodes && el.nodes.length > 0 && el.tags
  );

  // ============================================================
  // PASS 1: Landuse areas (background layer - drawn first/bottom)
  // ============================================================
  for (const way of ways) {
    const coordinates = getWayCoordinates(way);
    if (!coordinates) continue;

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
        renderer,
        interactive: false,
      });
      (polygon as any).wayCategory = 'landuse' as ElementCategory;
      (polygon as any).styleType = 'forest';
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
        renderer,
        interactive: false,
      });
      (polygon as any).wayCategory = 'landuse' as ElementCategory;
      (polygon as any).styleType = 'farmland';
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
        renderer,
        interactive: false,
      });
      (polygon as any).wayCategory = 'landuse' as ElementCategory;
      (polygon as any).styleType = 'residential';
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
        renderer,
        interactive: false,
      });
      (polygon as any).wayCategory = 'landuse' as ElementCategory;
      (polygon as any).styleType = 'commercial';
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
        renderer,
        interactive: false,
      });
      (polygon as any).wayCategory = 'landuse' as ElementCategory;
      (polygon as any).styleType = 'industrial';
      polygon.addTo(layerGroup);
      continue;
    }
  }

  // ============================================================
  // PASS 2: Natural areas and parks
  // ============================================================
  for (const way of ways) {
    const coordinates = getWayCoordinates(way);
    if (!coordinates) continue;

    // Skip landuse elements (already processed in pass 1)
    if (way.tags.landuse === 'forest' || way.tags.landuse === 'farmland' ||
        way.tags.landuse === 'farm' || way.tags.landuse === 'farmyard' ||
        way.tags.landuse === 'orchard' || way.tags.landuse === 'vineyard' ||
        way.tags.landuse === 'residential' || way.tags.landuse === 'commercial' ||
        way.tags.landuse === 'retail' || way.tags.landuse === 'industrial') {
      continue;
    }

    // Natural water bodies
    if (way.tags.natural === 'water') {
      const waterStyle = style.natural.water;

      if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
          coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
        coordinates.push(coordinates[0]);
      }

      const override = colorOverrides?.overrides[way.id];
      const fillColor = override ? override.color : waterStyle.color;

      const polygon = L.polygon(coordinates, {
        color: override ? '#000000' : fillColor,
        fillColor: fillColor,
        fillOpacity: waterStyle.opacity,
        weight: override ? 2 : 1,
        opacity: waterStyle.opacity,
        renderer,
        interactive: !!onElementClick,
      });

      (polygon as any).wayId = way.id;
      (polygon as any).wayCategory = 'natural' as ElementCategory;
      (polygon as any).styleType = 'water';
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

      const override = colorOverrides?.overrides[way.id];
      const fillColor = override ? override.color : woodStyle.color;

      const polygon = L.polygon(coordinates, {
        color: override ? '#000000' : fillColor,
        fillColor: fillColor,
        fillOpacity: woodStyle.opacity,
        weight: override ? 2 : 0.5,
        opacity: override ? 1 : 0.5,
        renderer,
        interactive: !!onElementClick,
      });

      (polygon as any).wayId = way.id;
      (polygon as any).wayCategory = 'natural' as ElementCategory;
      (polygon as any).styleType = 'wood';
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

      const override = colorOverrides?.overrides[way.id];
      const fillColor = override ? override.color : grassStyle.color;

      const polygon = L.polygon(coordinates, {
        color: override ? '#000000' : fillColor,
        fillColor: fillColor,
        fillOpacity: grassStyle.opacity,
        weight: override ? 2 : 0.5,
        opacity: override ? 1 : grassStyle.opacity,
        renderer,
        interactive: !!onElementClick,
      });

      (polygon as any).wayId = way.id;
      (polygon as any).wayCategory = 'natural' as ElementCategory;
      (polygon as any).styleType = 'grassland';
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

      const override = colorOverrides?.overrides[way.id];
      const fillColor = override ? override.color : beachStyle.color;

      const polygon = L.polygon(coordinates, {
        color: override ? '#000000' : fillColor,
        fillColor: fillColor,
        fillOpacity: beachStyle.opacity,
        weight: override ? 2 : 0.5,
        opacity: override ? 1 : beachStyle.opacity,
        renderer,
        interactive: !!onElementClick,
      });

      (polygon as any).wayId = way.id;
      (polygon as any).wayCategory = 'natural' as ElementCategory;
      (polygon as any).styleType = 'beach';
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

      const override = colorOverrides?.overrides[way.id];
      const fillColor = override ? override.color : parkStyle.color;

      const polygon = L.polygon(coordinates, {
        color: override ? '#000000' : fillColor,
        fillColor: fillColor,
        fillOpacity: parkStyle.opacity,
        weight: override ? 2 : 1,
        opacity: override ? 1 : parkStyle.opacity,
        renderer,
        interactive: !!onElementClick,
      });

      (polygon as any).wayId = way.id;
      (polygon as any).wayCategory = 'natural' as ElementCategory;
      (polygon as any).styleType = 'grassland';
      polygon.addTo(layerGroup);
      continue;
    }
  }

  // ============================================================
  // PASS 3: Waterways, Highways, Buildings, Railway (foreground)
  // ============================================================
  for (const way of ways) {
    const coordinates = getWayCoordinates(way);
    if (!coordinates) continue;

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

        const polygon = L.polygon(coordinates, {
          color: strokeColor,
          fillColor: fillColor,
          fillOpacity: buildingStyle.opacity,
          weight: strokeEnabled ? 1 : 0,
          opacity: strokeEnabled ? buildingStyle.opacity : 0,
          interactive: !!onElementClick,  // Interactive if click handler provided
          renderer,
        });

        // Store way metadata for in-place style updates
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'building' as ElementCategory;
        (polygon as any).styleType = buildingType;

        polygon.addTo(layerGroup);
        continue;
      }

      // Amenity/shop/tourism buildings without explicit building tag
      // Many POI buildings in OSM only have amenity/shop/tourism tags without building=yes
      if (!way.tags.building && (way.tags.amenity || way.tags.shop || way.tags.tourism)) {
        // Treat as commercial building
        const buildingStyle = style.building.commercial;

        // Close the polygon if not already closed
        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        // Check for color override
        const override = colorOverrides?.overrides[way.id];
        const fillColor = override ? override.color : buildingStyle.color;

        // Use strokeColor if defined and enabled, otherwise derive from fill color
        const strokeEnabled = style.buildingStrokeEnabled !== false;
        const strokeColor = strokeEnabled
          ? (override ? deriveCasingColor(override.color) : (buildingStyle.strokeColor || deriveCasingColor(buildingStyle.color)))
          : 'transparent';

        const polygon = L.polygon(coordinates, {
          color: strokeColor,
          fillColor: fillColor,
          fillOpacity: buildingStyle.opacity,
          weight: strokeEnabled ? 1 : 0,
          opacity: strokeEnabled ? buildingStyle.opacity : 0,
          interactive: !!onElementClick,
          renderer,
        });

        // Store way metadata for in-place style updates
        (polygon as any).wayId = way.id;
        (polygon as any).wayCategory = 'building' as ElementCategory;
        (polygon as any).styleType = 'commercial';

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
          renderer,
          interactive: false,
        });
        (casing as any).isCasing = true;
        (casing as any).styleType = highwayType;
        casing.addTo(layerGroup);

        // Road fill
        const polyline = L.polyline(coordinates, {
          color: fillColor,
          weight: weight.fill,
          opacity: highwayStyle.opacity,
          renderer,
          interactive: !!onElementClick,
        });

        // Store way metadata for in-place style updates
        (polyline as any).wayId = way.id;
        (polyline as any).wayCategory = 'highway' as ElementCategory;
        (polyline as any).styleType = highwayType;

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
          renderer,
          interactive: !!onElementClick,
        });

        // Store way metadata for in-place style updates
        (polyline as any).wayId = way.id;
        (polyline as any).wayCategory = 'waterway' as ElementCategory;
        (polyline as any).styleType = waterwayType;

        polyline.addTo(layerGroup);
        continue;
      }

      // Railway
      if (way.tags.railway && way.tags.railway !== 'abandoned') {
        // Base line
        const railBase = L.polyline(coordinates, {
          color: '#444444',
          weight: 4,
          opacity: 0.8,
          renderer,
          interactive: false,
        });
        railBase.addTo(layerGroup);

        // Dashed white line for ties
        const railTies = L.polyline(coordinates, {
          color: '#ffffff',
          weight: 2,
          opacity: 0.9,
          interactive: false,
          dashArray: '6, 6',
          renderer,
        });
        railTies.addTo(layerGroup);
      }
  }

  // Process POI nodes (only if showPOI is enabled)
  if (showPOI) {
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
  }

  // Process house numbers (only in offline mode to avoid duplicates with Carto tile labels)
  if (showLabels) {
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
  }

  return layerGroup;
}
