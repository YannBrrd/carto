/**
 * Identify the app to the OpenStreetMap services it queries. Overpass answers
 * 406 to browser-like user agents (Electron's default) and Nominatim's usage
 * policy asks for an identifying one; the renderer cannot set this header.
 */

// webRequest URL filters of the services that require an identifying user agent
export const IDENTIFIED_API_URLS = [
  'https://overpass-api.de/*',
  'https://overpass.kumi.systems/*',
  'https://maps.mail.ru/osm/*',
  'https://nominatim.openstreetmap.org/*',
];

export function appUserAgent(version: string): string {
  return `Carto/${version} (+https://github.com/YannBrrd/carto)`;
}

export function withUserAgent(headers: Record<string, string>, userAgent: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'user-agent') result[name] = value;
  }
  result['User-Agent'] = userAgent;
  return result;
}
