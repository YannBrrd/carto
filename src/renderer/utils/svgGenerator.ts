import L from 'leaflet';
import { RenderStyle } from '../types';

export function generateSVG(
  osmData: any,
  zone: any, // Can be L.LatLngBounds (rectangle) or {bounds, polygon, type} (polygon)
  style: RenderStyle,
  map: L.Map
): string {
  const mapBounds = map.getBounds();
  const padding = 0.001; // Small padding around the map
  const extendedBounds = mapBounds.pad(0.2);

  // Extract bounds and polygon data
  const bounds = zone.bounds || zone;
  const isPolygonZone = zone.type === 'polygon' && zone.polygon;
  const polygonPoints = isPolygonZone ? zone.polygon : null;

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
    if (isPolygonZone && polygonPoints) {
      // Use ray casting algorithm for polygon point-in-polygon test
      return pointInPolygon([lat, lon], polygonPoints);
    }
    return bounds.contains([lat, lon]);
  };

  // Point-in-polygon test using ray casting algorithm
  const pointInPolygon = (point: [number, number], polygon: L.LatLng[]): boolean => {
    const [lat, lon] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      
      const intersect = ((yi > lon) !== (yj > lon))
        && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  };

  // Build node map
  const nodes = new Map();
  osmData.elements
    .filter((el: any) => el.type === 'node')
    .forEach((node: any) => {
      nodes.set(node.id, { lat: node.lat, lon: node.lon });
    });

  // Start building SVG
  let clipPathDef = '';
  if (isPolygonZone && polygonPoints) {
    const polygonPath = polygonPoints
      .map((point: L.LatLng, i: number) => {
        const x = lonToX(point.lng);
        const y = latToY(point.lat);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ') + ' Z';
    clipPathDef = `<path d="${polygonPath}" />`;
  } else {
    clipPathDef = `<rect x="${lonToX(bounds.getWest())}" y="${latToY(bounds.getNorth())}" 
            width="${lonToX(bounds.getEast()) - lonToX(bounds.getWest())}" 
            height="${latToY(bounds.getSouth()) - latToY(bounds.getNorth())}" />`;
  }

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="zoneClip">
      ${clipPathDef}
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
  if (isPolygonZone && polygonPoints) {
    // Draw polygon border
    const polygonPath = polygonPoints
      .map((point: L.LatLng, i: number) => {
        const x = lonToX(point.lng);
        const y = latToY(point.lat);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ') + ' Z'; // Close the path

    svg += `  <!-- Zone border (polygon) -->
  <path d="${polygonPath}" 
        fill="none" 
        stroke="${style.borderColor}" 
        stroke-width="${style.borderWidth}" 
        opacity="${style.strokeOpacity}" />
`;
  } else {
    // Draw rectangle border
    svg += `  <!-- Zone border (rectangle) -->
  <rect x="${lonToX(bounds.getWest())}" y="${latToY(bounds.getNorth())}" 
        width="${lonToX(bounds.getEast()) - lonToX(bounds.getWest())}" 
        height="${latToY(bounds.getSouth()) - latToY(bounds.getNorth())}" 
        fill="none" 
        stroke="${style.borderColor}" 
        stroke-width="${style.borderWidth}" 
        opacity="${style.strokeOpacity}" />
`;
  }

  svg += '</svg>';

  return svg;
}
