import L from 'leaflet';
import { RenderStyle } from '../types';

export function generateSVG(
  osmData: any,
  bounds: L.LatLngBounds,
  style: RenderStyle,
  map: L.Map
): string {
  const mapBounds = map.getBounds();
  const padding = 0.001; // Small padding around the map
  const extendedBounds = mapBounds.pad(0.2);

  // Calculate SVG dimensions
  const width = 2000;
  const height = 2000;

  // Create coordinate transformation functions
  const latToY = (lat: number) => {
    const ratio = (extendedBounds.getNorth() - lat) / 
                  (extendedBounds.getNorth() - extendedBounds.getSouth());
    return ratio * height;
  };

  const lonToX = (lon: number) => {
    const ratio = (lon - extendedBounds.getWest()) / 
                  (extendedBounds.getEast() - extendedBounds.getWest());
    return ratio * width;
  };

  // Check if a point is inside the selected zone
  const isInsideZone = (lat: number, lon: number) => {
    return bounds.contains([lat, lon]);
  };

  // Build node map
  const nodes = new Map();
  osmData.elements
    .filter((el: any) => el.type === 'node')
    .forEach((node: any) => {
      nodes.set(node.id, { lat: node.lat, lon: node.lon });
    });

  // Start building SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="zoneClip">
      <rect x="${lonToX(bounds.getWest())}" y="${latToY(bounds.getNorth())}" 
            width="${lonToX(bounds.getEast()) - lonToX(bounds.getWest())}" 
            height="${latToY(bounds.getSouth()) - latToY(bounds.getNorth())}" />
    </clipPath>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="#f0f0f0"/>
  
`;

  // Group elements by interior/exterior
  const interiorElements: string[] = [];
  const exteriorElements: string[] = [];

  // Process ways
  osmData.elements
    .filter((el: any) => el.type === 'way' && el.nodes && el.nodes.length > 0)
    .forEach((way: any) => {
      const coordinates = way.nodes
        .map((nodeId: number) => nodes.get(nodeId))
        .filter((node: any) => node !== undefined);

      if (coordinates.length < 2) return;

      // Determine if way is inside or outside zone
      const firstCoord = coordinates[0];
      const isInside = isInsideZone(firstCoord.lat, firstCoord.lon);

      // Generate path
      const pathData = coordinates
        .map((coord: any, i: number) => {
          const x = lonToX(coord.lon);
          const y = latToY(coord.lat);
          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        })
        .join(' ');

      // Determine styling based on feature type
      let strokeColor = style.borderColor;
      let fillColor = 'none';
      let strokeWidth = 1;

      if (way.tags) {
        if (way.tags.building) {
          fillColor = isInside ? style.interiorColor : '#cccccc';
          strokeWidth = 0.5;
        } else if (way.tags.highway) {
          strokeColor = isInside ? '#555555' : '#999999';
          strokeWidth = way.tags.highway === 'motorway' ? 3 : 
                       way.tags.highway === 'primary' ? 2 : 1;
        } else if (way.tags.waterway || way.tags.natural === 'water') {
          fillColor = isInside ? '#4A90E2' : '#b0b0b0';
          strokeColor = isInside ? '#3A7BC8' : '#909090';
        }
      }

      // Convert to grayscale if exterior and option is enabled
      if (!isInside && style.exteriorGrayscale && fillColor !== 'none') {
        fillColor = '#cccccc';
      }

      const pathElement = `  <path d="${pathData}" 
        fill="${fillColor}" 
        stroke="${strokeColor}" 
        stroke-width="${strokeWidth}" 
        opacity="${isInside ? style.fillOpacity : 0.5}" />
`;

      if (isInside) {
        interiorElements.push(pathElement);
      } else {
        exteriorElements.push(pathElement);
      }
    });

  // Add exterior elements (grayscale)
  svg += '  <!-- Exterior (grayscale) -->\n';
  svg += '  <g id="exterior">\n';
  svg += exteriorElements.join('');
  svg += '  </g>\n\n';

  // Add interior elements (color)
  svg += '  <!-- Interior (color) -->\n';
  svg += '  <g id="interior">\n';
  svg += interiorElements.join('');
  svg += '  </g>\n\n';

  // Add zone border
  svg += `  <!-- Zone border -->
  <rect x="${lonToX(bounds.getWest())}" y="${latToY(bounds.getNorth())}" 
        width="${lonToX(bounds.getEast()) - lonToX(bounds.getWest())}" 
        height="${latToY(bounds.getSouth()) - latToY(bounds.getNorth())}" 
        fill="none" 
        stroke="${style.borderColor}" 
        stroke-width="${style.borderWidth}" 
        opacity="${style.strokeOpacity}" />
`;

  svg += '</svg>';

  return svg;
}
