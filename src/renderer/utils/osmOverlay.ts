import L from 'leaflet';
import { RenderStyle } from '../types';

// Darken a hex color by a fixed amount for road casing
function deriveCasingColor(fillColor: string): string {
  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

export function createOSMOverlay(
  map: L.Map,
  osmData: any,
  style: RenderStyle
): L.LayerGroup {
  const layerGroup = L.layerGroup();

  // Build node map
  const nodes = new Map();
  osmData.elements
    .filter((el: any) => el.type === 'node')
    .forEach((node: any) => {
      nodes.set(node.id, { lat: node.lat, lon: node.lon });
    });

  // Process ways and render them with custom styles
  osmData.elements
    .filter((el: any) => el.type === 'way' && el.nodes && el.nodes.length > 0)
    .forEach((way: any) => {
      const coordinates = way.nodes
        .map((nodeId: number) => nodes.get(nodeId))
        .filter((node: any) => node !== undefined)
        .map((node: any) => [node.lat, node.lon] as [number, number]);

      if (coordinates.length < 2) return;

      if (!way.tags) return;

      // Building
      if (way.tags.building) {
        const buildingType = getBuildingStyleKey(way.tags.building);
        const buildingStyle = style.building[buildingType];

        // Close the polygon if not already closed
        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: buildingStyle.color,
          fillColor: buildingStyle.color,
          fillOpacity: buildingStyle.opacity,
          weight: 1,
          opacity: buildingStyle.opacity,
        });
        polygon.addTo(layerGroup);
        return;
      }

      // Highway (roads, paths, cycleways)
      if (way.tags.highway) {
        const highwayType = getHighwayStyleKey(way.tags.highway);
        const highwayStyle = style.highway[highwayType];
        const weight = getRoadWeight(way.tags.highway);
        const casingColor = deriveCasingColor(highwayStyle.color);

        // Road casing (outline)
        const casing = L.polyline(coordinates, {
          color: casingColor,
          weight: weight.casing,
          opacity: highwayStyle.opacity,
        });
        casing.addTo(layerGroup);

        // Road fill
        const polyline = L.polyline(coordinates, {
          color: highwayStyle.color,
          weight: weight.fill,
          opacity: highwayStyle.opacity,
        });
        polyline.addTo(layerGroup);
        return;
      }

      // Waterway
      if (way.tags.waterway) {
        const waterwayType = getWaterwayStyleKey(way.tags.waterway);
        const waterwayStyle = style.waterway[waterwayType];

        const polyline = L.polyline(coordinates, {
          color: waterwayStyle.color,
          weight: waterwayType === 'river' ? 4 : waterwayType === 'stream' ? 2 : 3,
          opacity: waterwayStyle.opacity,
        });
        polyline.addTo(layerGroup);
        return;
      }

      // Natural water bodies
      if (way.tags.natural === 'water') {
        const waterStyle = style.natural.water;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: waterStyle.color,
          fillColor: waterStyle.color,
          fillOpacity: waterStyle.opacity,
          weight: 1,
          opacity: waterStyle.opacity,
        });
        polygon.addTo(layerGroup);
        return;
      }

      // Natural wood
      if (way.tags.natural === 'wood') {
        const woodStyle = style.natural.wood;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: woodStyle.color,
          fillColor: woodStyle.color,
          fillOpacity: woodStyle.opacity,
          weight: 0.5,
          opacity: 0.5,
        });
        polygon.addTo(layerGroup);
        return;
      }

      // Natural grassland
      if (way.tags.natural === 'grassland' || way.tags.natural === 'grass') {
        const grassStyle = style.natural.grassland;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: grassStyle.color,
          fillColor: grassStyle.color,
          fillOpacity: grassStyle.opacity,
          weight: 0.5,
          opacity: grassStyle.opacity,
        });
        polygon.addTo(layerGroup);
        return;
      }

      // Natural beach
      if (way.tags.natural === 'beach') {
        const beachStyle = style.natural.beach;

        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
          coordinates.push(coordinates[0]);
        }

        const polygon = L.polygon(coordinates, {
          color: beachStyle.color,
          fillColor: beachStyle.color,
          fillOpacity: beachStyle.opacity,
          weight: 0.5,
          opacity: beachStyle.opacity,
        });
        polygon.addTo(layerGroup);
        return;
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
        return;
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
        return;
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
        return;
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
        return;
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
        return;
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

        const polygon = L.polygon(coordinates, {
          color: parkStyle.color,
          fillColor: parkStyle.color,
          fillOpacity: parkStyle.opacity,
          weight: 1,
          opacity: parkStyle.opacity,
        });
        polygon.addTo(layerGroup);
        return;
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
    });

  return layerGroup;
}
