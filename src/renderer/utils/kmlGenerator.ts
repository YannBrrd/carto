/**
 * KML generation (pure functions, no Leaflet / DOM dependency so they stay unit-testable).
 *
 * Zone coordinates follow the app convention: [lat, lng] pairs.
 * KML expects "lon,lat,alt" tuples, with colors encoded as aabbggrr.
 */

export interface GeoBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface KmlZone {
  id: string;
  coordinates: number[][]; // [lat, lng] pairs, ring not necessarily closed
}

export interface KmlStyle {
  interiorColor: string; // #RRGGBB
  borderColor: string;   // #RRGGBB
  borderWidth: number;
  fillOpacity: number;   // 0-1
  strokeOpacity: number; // 0-1
}

export interface KmlOverlay {
  href: string; // path of the image, relative to the KML file
  box: GeoBox;
}

export interface KmlOptions {
  name: string;
  zones: KmlZone[];
  style: KmlStyle;
  overlay?: KmlOverlay;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * Convert "#RRGGBB" (or "#RGB") and an opacity (0-1) to KML's aabbggrr.
 * Invalid input falls back to opaque black.
 */
export function hexToKmlColor(hex: string, opacity: number): string {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    return 'ff000000';
  }
  const clamped = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
  const alpha = Math.round(clamped * 255).toString(16).padStart(2, '0');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `${alpha}${b}${g}${r}`.toLowerCase();
}

/**
 * Geographic extent of an exported image: the selection bounds plus the pixel
 * margin added around the content. The SVG generator maps lat/lon linearly to
 * pixels, so the margin converts to degrees with a simple ratio, which is also
 * exactly the projection a KML GroundOverlay assumes.
 */
export function computeOverlayBox(
  bounds: GeoBox,
  contentWidthPx: number,
  contentHeightPx: number,
  marginPx: number
): GeoBox {
  if (!(contentWidthPx > 0) || !(contentHeightPx > 0)) {
    throw new Error('Content size must be positive to compute the overlay box');
  }
  const lonMargin = ((bounds.east - bounds.west) * marginPx) / contentWidthPx;
  const latMargin = ((bounds.north - bounds.south) * marginPx) / contentHeightPx;
  return {
    north: bounds.north + latMargin,
    south: bounds.south - latMargin,
    east: bounds.east + lonMargin,
    west: bounds.west - lonMargin,
  };
}

/** [lat, lng] ring -> closed "lon,lat,0 lon,lat,0 ..." string. */
export function zoneToKmlCoordinates(coordinates: number[][]): string {
  const points = coordinates.map(([lat, lng]) => `${lng},${lat},0`);
  if (points.length > 0 && points[0] !== points[points.length - 1]) {
    points.push(points[0]);
  }
  return points.join(' ');
}

export function generateKml({ name, zones, style, overlay }: KmlOptions): string {
  const fill = hexToKmlColor(style.interiorColor, style.fillOpacity);
  const line = hexToKmlColor(style.borderColor, style.strokeOpacity);

  const overlayXml = overlay
    ? `
    <GroundOverlay>
      <name>Fond de carte</name>
      <Icon><href>${escapeXml(overlay.href)}</href></Icon>
      <LatLonBox>
        <north>${overlay.box.north}</north>
        <south>${overlay.box.south}</south>
        <east>${overlay.box.east}</east>
        <west>${overlay.box.west}</west>
      </LatLonBox>
    </GroundOverlay>`
    : '';

  const placemarks = zones
    .filter((zone) => zone.coordinates && zone.coordinates.length >= 3)
    .map(
      (zone, index) => `
    <Placemark>
      <name>Zone ${index + 1}</name>
      <styleUrl>#zoneStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>${zoneToKmlCoordinates(zone.coordinates)}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Style id="zoneStyle">
      <LineStyle><color>${line}</color><width>${style.borderWidth}</width></LineStyle>
      <PolyStyle><color>${fill}</color></PolyStyle>
    </Style>${overlayXml}${placemarks}
  </Document>
</kml>
`;
}
