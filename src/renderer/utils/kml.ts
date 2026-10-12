/**
 * KML export of the zones: one placemark per zone, outlined with the export border color.
 * Zones are stored as [lat, lng] points; KML writes lng,lat and closes every ring.
 */

import { Zone } from '../types';
import { normalizeColor } from './colors';

export interface KmlOptions {
  borderColor: string;
  name?: string;
}

const STYLE_ID = 'zone';

const escapeXml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

/** Opaque KML color (aabbggrr) of a CSS color; black when the value is not a color */
export function kmlColor(color: string): string {
  const hex = (normalizeColor(color) ?? '#000000').slice(1);
  return `ff${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
}

// Closed [lng, lat] ring, counterclockwise, or undefined when the zone is not a polygon
function outerRing(zone: Zone): number[][] | undefined {
  const points = zone.coordinates
    .filter(point => point.length >= 2)
    .map(([lat, lng]) => [lng, lat]);
  if (points.some(point => !point.every(Number.isFinite))) return undefined;

  const [first, last] = [points[0], points[points.length - 1]];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
  if (points.length < 3) return undefined;

  let doubleArea = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    doubleArea += x1 * y2 - x2 * y1;
  }
  if (doubleArea < 0) points.reverse();
  return [...points, points[0]];
}

/** KML 2.2 document of the zones that are polygons, named "Zone n" after their position */
export function zonesToKml(zones: Zone[], options: KmlOptions): string {
  const placemarks = zones.flatMap((zone, index) => {
    const ring = outerRing(zone);
    if (!ring) return [];
    const coordinates = ring.map(([lng, lat]) => `${lng},${lat}`).join(' ');
    return [`    <Placemark>
      <name>Zone ${index + 1}</name>
      <styleUrl>#${STYLE_ID}</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`];
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(options.name ?? 'Carto')}</name>
    <Style id="${STYLE_ID}">
      <LineStyle>
        <color>${kmlColor(options.borderColor)}</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <fill>0</fill>
      </PolyStyle>
    </Style>
${placemarks.join('\n')}
  </Document>
</kml>
`;
}
