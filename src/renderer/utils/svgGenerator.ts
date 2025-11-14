import L from 'leaflet';
import { RenderStyle } from '../types';

export function generateSVG(
  osmData: any,
  bounds: L.LatLngBounds,
  style: RenderStyle,
  map: L.Map
): string {
  // Use the actual visible map bounds for accurate rendering
  const mapBounds = bounds;
  
  // Get map container dimensions
  const mapContainer = map.getContainer();
  const mapSize = map.getSize();
  
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
  const nodes = new Map();
  osmData.elements
    .filter((el: any) => el.type === 'node')
    .forEach((node: any) => {
      nodes.set(node.id, { lat: node.lat, lon: node.lon });
    });

  // Get tile layer URLs for the visible bounds
  const zoom = map.getZoom();
  const tileSize = 256;
  
  // Start building SVG
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  
  <!-- OSM Tile Background -->
  <g id="tiles">
`;

  // Calculate tile coordinates for the bounds
  const nwPoint = map.project(bounds.getNorthWest(), zoom);
  const sePoint = map.project(bounds.getSouthEast(), zoom);
  
  const tileNW = {
    x: Math.floor(nwPoint.x / tileSize),
    y: Math.floor(nwPoint.y / tileSize)
  };
  const tileSE = {
    x: Math.floor(sePoint.x / tileSize),
    y: Math.floor(sePoint.y / tileSize)
  };

  // Add tiles as images in SVG
  for (let x = tileNW.x; x <= tileSE.x; x++) {
    for (let y = tileNW.y; y <= tileSE.y; y++) {
      const tileTopLeft = map.unproject([x * tileSize, y * tileSize], zoom);
      const tileX = lonToX(tileTopLeft.lng);
      const tileY = latToY(tileTopLeft.lat);
      const tileSvgSize = (tileSize / 256) * svgWidth / (bounds.getEast() - bounds.getWest()) * 360 / Math.pow(2, zoom);
      
      // OSM tile URL pattern
      const s = ['a', 'b', 'c'][(x + y) % 3];
      const tileUrl = `https://${s}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
      
      svg += `    <image x="${tileX}" y="${tileY}" width="${tileSvgSize}" height="${tileSvgSize}" xlink:href="${tileUrl}" />\n`;
    }
  }

  svg += '  </g>\n\n';

  // Add zone border rectangle
  svg += `  <!-- Zone border -->
  <rect x="0" y="0" 
        width="${svgWidth}" 
        height="${svgHeight}" 
        fill="none" 
        stroke="${style.borderColor}" 
        stroke-width="${style.borderWidth * scale}" 
        opacity="${style.strokeOpacity}" />
`;

  svg += '</svg>';

  return svg;
}
