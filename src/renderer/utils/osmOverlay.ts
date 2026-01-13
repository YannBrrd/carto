import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ElementCategory } from '../types';
import { getIconSvg } from '../assets/icons';
import { buildNodeMap, deriveCasingColor, resolveMultipolygons, findContainedInnerRings } from './geometry';

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
    case 'construction':
      return 'construction';
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
  // SINGLE PASS: Categorize all ways by layer type
  // This replaces the previous 3-pass approach for better performance
  // ============================================================
  interface CategorizedWay {
    way: any;
    coordinates: [number, number][];
  }

  // Layer 1: Landuse (background)
  const landuseForest: CategorizedWay[] = [];
  const landuseFarmland: CategorizedWay[] = [];
  const landuseResidential: CategorizedWay[] = [];
  const landuseCommercial: CategorizedWay[] = [];
  const landuseIndustrial: CategorizedWay[] = [];

  // Layer 2: Natural areas and parks
  const naturalWater: CategorizedWay[] = [];
  const naturalWood: CategorizedWay[] = [];
  const naturalGrassland: CategorizedWay[] = [];
  const naturalBeach: CategorizedWay[] = [];
  const parks: CategorizedWay[] = [];

  // Layer 3: Foreground (buildings, roads, waterways, railway)
  const buildings: CategorizedWay[] = [];
  const amenityBuildings: CategorizedWay[] = [];
  const highways: CategorizedWay[] = [];
  const waterways: CategorizedWay[] = [];
  const railways: CategorizedWay[] = [];

  // Single pass categorization
  for (const way of ways) {
    const coordinates = getWayCoordinates(way);
    if (!coordinates) continue;

    const item: CategorizedWay = { way, coordinates };
    const tags = way.tags;

    // Landuse layer (mutually exclusive checks first)
    if (tags.landuse === 'forest') {
      landuseForest.push(item);
    } else if (tags.landuse === 'farmland' || tags.landuse === 'farm' ||
               tags.landuse === 'farmyard' || tags.landuse === 'orchard' ||
               tags.landuse === 'vineyard') {
      landuseFarmland.push(item);
    } else if (tags.landuse === 'residential') {
      landuseResidential.push(item);
    } else if (tags.landuse === 'commercial' || tags.landuse === 'retail') {
      landuseCommercial.push(item);
    } else if (tags.landuse === 'industrial') {
      landuseIndustrial.push(item);
    }
    // Natural layer
    else if (tags.natural === 'water') {
      naturalWater.push(item);
    } else if (tags.natural === 'wood') {
      naturalWood.push(item);
    } else if (tags.natural === 'grassland' || tags.natural === 'grass') {
      naturalGrassland.push(item);
    } else if (tags.natural === 'beach') {
      naturalBeach.push(item);
    }
    // Parks (landuse/leisure variants)
    else if (tags.landuse === 'grass' || tags.landuse === 'park' ||
             tags.landuse === 'meadow' || tags.leisure === 'park' ||
             tags.leisure === 'garden' || tags.leisure === 'playground' ||
             tags.leisure === 'pitch') {
      parks.push(item);
    }
    // Foreground layer - buildings take priority
    else if (tags.building) {
      buildings.push(item);
    }
    // Amenity/shop/tourism without building tag
    else if (tags.amenity || tags.shop || tags.tourism) {
      amenityBuildings.push(item);
    }
    // Highway
    else if (tags.highway) {
      highways.push(item);
    }
    // Waterway
    else if (tags.waterway) {
      waterways.push(item);
    }
    // Railway
    else if (tags.railway && tags.railway !== 'abandoned') {
      railways.push(item);
    }
  }

  // Resolve multipolygon relations for buildings
  const multipolygons = resolveMultipolygons(osmData, nodes);

  // Helper to close polygon coordinates if needed
  const closePolygon = (coords: [number, number][]): void => {
    if (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0]);
    }
  };

  // ============================================================
  // RENDER LAYER 1: Landuse areas (background - drawn first/bottom)
  // ============================================================

  // Landuse - forest
  for (const { coordinates } of landuseForest) {
    const forestStyle = style.landuse.forest;
    closePolygon(coordinates);

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
  }

  // Landuse - farmland
  for (const { coordinates } of landuseFarmland) {
    const farmStyle = style.landuse.farmland;
    closePolygon(coordinates);

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
  }

  // Landuse - residential
  for (const { coordinates } of landuseResidential) {
    const residentialStyle = style.landuse.residential;
    closePolygon(coordinates);

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
  }

  // Landuse - commercial/retail
  for (const { coordinates } of landuseCommercial) {
    const commercialStyle = style.landuse.commercial;
    closePolygon(coordinates);

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
  }

  // Landuse - industrial
  for (const { coordinates } of landuseIndustrial) {
    const industrialStyle = style.landuse.industrial;
    closePolygon(coordinates);

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
  }

  // ============================================================
  // RENDER LAYER 2: Natural areas and parks
  // ============================================================

  // Natural water bodies
  for (const { way, coordinates } of naturalWater) {
    const waterStyle = style.natural.water;
    closePolygon(coordinates);

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
  }

  // Natural wood
  for (const { way, coordinates } of naturalWood) {
    const woodStyle = style.natural.wood;
    closePolygon(coordinates);

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
  }

  // Natural grassland
  for (const { way, coordinates } of naturalGrassland) {
    const grassStyle = style.natural.grassland;
    closePolygon(coordinates);

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
  }

  // Natural beach
  for (const { way, coordinates } of naturalBeach) {
    const beachStyle = style.natural.beach;
    closePolygon(coordinates);

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
  }

  // Parks and green spaces (leisure)
  for (const { way, coordinates } of parks) {
    const parkStyle = style.natural.grassland;
    closePolygon(coordinates);

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
  }

  // ============================================================
  // RENDER LAYER 3: Waterways, Highways, Buildings, Railway (foreground)
  // ============================================================

  // Buildings
  for (const { way, coordinates } of buildings) {
    const buildingType = getBuildingStyleKey(way.tags.building);
    const buildingStyle = style.building[buildingType];
    closePolygon(coordinates);

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
      interactive: !!onElementClick,
      renderer,
    });

    // Store way metadata for in-place style updates
    (polygon as any).wayId = way.id;
    (polygon as any).wayCategory = 'building' as ElementCategory;
    (polygon as any).styleType = buildingType;

    polygon.addTo(layerGroup);
  }

  // Amenity/shop/tourism buildings without explicit building tag
  for (const { way, coordinates } of amenityBuildings) {
    const buildingStyle = style.building.commercial;
    closePolygon(coordinates);

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
  }

  // Multipolygon buildings (relations with outer/inner rings)
  for (const mp of multipolygons) {
    if (!mp.tags.building) continue;

    const buildingType = getBuildingStyleKey(mp.tags.building);
    const buildingStyle = style.building[buildingType];

    // Check for color override
    const override = colorOverrides?.overrides[mp.id];
    const fillColor = override ? override.color : buildingStyle.color;

    // Use strokeColor if defined and enabled
    const strokeEnabled = style.buildingStrokeEnabled !== false;
    const strokeColor = strokeEnabled
      ? (override ? deriveCasingColor(override.color) : (buildingStyle.strokeColor || deriveCasingColor(buildingStyle.color)))
      : 'transparent';

    // Create Leaflet polygon with holes support
    // For each outer ring, find which inner rings (holes) belong to it
    for (const outerRing of mp.outer) {
      // Find inner rings contained within this outer ring (using centroid test)
      const containedInners = findContainedInnerRings(outerRing, mp.inner);

      // outerRing and containedInners are already [lat, lon][] which Leaflet accepts
      const polygon = L.polygon([outerRing, ...containedInners], {
        color: strokeColor,
        fillColor: fillColor,
        fillOpacity: buildingStyle.opacity,
        weight: strokeEnabled ? 1 : 0,
        opacity: strokeEnabled ? buildingStyle.opacity : 0,
        interactive: !!onElementClick,
        renderer,
      });

      (polygon as any).wayId = mp.id;
      (polygon as any).wayCategory = 'building' as ElementCategory;
      (polygon as any).styleType = buildingType;

      polygon.addTo(layerGroup);
    }
  }

  // Highways (roads, paths, cycleways)
  for (const { way, coordinates } of highways) {
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
  }

  // Waterways
  for (const { way, coordinates } of waterways) {
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
  }

  // Railways
  for (const { coordinates } of railways) {
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

  // Process POI nodes (always create, visibility controlled by showPOI)
  // Markers are tagged with isPOI=true for efficient show/hide without rebuild
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

          const marker = L.marker([node.lat, node.lon], {
            icon,
            opacity: showPOI ? 1 : 0,  // Control initial visibility
          });
          (marker as any).isPOI = true;  // Tag for efficient show/hide
          marker.addTo(layerGroup);
        }
      }
    });

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
