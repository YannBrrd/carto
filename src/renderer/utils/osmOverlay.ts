import L from 'leaflet';
import { RenderStyle } from '../types';

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

      let pathOptions: L.PathOptions = {
        color: '#000000',
        weight: 1,
        fillColor: 'none',
        fillOpacity: 0,
        opacity: 1,
      };

      if (way.tags) {
        if (way.tags.building) {
          // Building style
          pathOptions = {
            color: style.buildingColor,
            fillColor: style.buildingColor,
            fillOpacity: style.buildingOpacity,
            weight: 1,
            opacity: style.buildingOpacity,
          };

          // Close the polygon if not already closed
          if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
              coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
            coordinates.push(coordinates[0]);
          }

          const polygon = L.polygon(coordinates, pathOptions);
          polygon.addTo(layerGroup);

        } else if (way.tags.highway) {
          // Road style
          let weight = 2;
          if (way.tags.highway === 'motorway' || way.tags.highway === 'trunk') {
            weight = 6;
          } else if (way.tags.highway === 'primary') {
            weight = 5;
          } else if (way.tags.highway === 'secondary') {
            weight = 4;
          } else if (way.tags.highway === 'tertiary') {
            weight = 3;
          }

          pathOptions = {
            color: style.roadColor,
            weight: weight,
            opacity: style.roadOpacity,
          };

          const polyline = L.polyline(coordinates, pathOptions);
          polyline.addTo(layerGroup);

        } else if (way.tags.waterway || way.tags.natural === 'water') {
          // Water style
          pathOptions = {
            color: style.waterColor,
            fillColor: style.waterColor,
            fillOpacity: style.waterOpacity,
            weight: 1,
            opacity: style.waterOpacity,
          };

          // Try polygon first for closed water features
          if (coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
              coordinates[0][1] === coordinates[coordinates.length - 1][1]) {
            const polygon = L.polygon(coordinates, pathOptions);
            polygon.addTo(layerGroup);
          } else {
            const polyline = L.polyline(coordinates, pathOptions);
            polyline.addTo(layerGroup);
          }

        } else if (way.tags.landuse === 'grass' || way.tags.landuse === 'park' || 
                   way.tags.leisure === 'park' || way.tags.leisure === 'garden') {
          // Park/green space style
          pathOptions = {
            color: style.parkColor,
            fillColor: style.parkColor,
            fillOpacity: style.parkOpacity,
            weight: 1,
            opacity: style.parkOpacity,
          };

          if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
              coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
            coordinates.push(coordinates[0]);
          }

          const polygon = L.polygon(coordinates, pathOptions);
          polygon.addTo(layerGroup);
        }
      }
    });

  return layerGroup;
}
