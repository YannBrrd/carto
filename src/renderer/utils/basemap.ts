/**
 * CARTO raster basemaps under and above the overlay. Since September 2026 CARTO only
 * serves them with an API key (free, see CARTO_API_KEY_URL); without one it draws an
 * "API key required" watermark on the tiles. The key is the one the user saves in the
 * tools panel, else the CARTO_API_KEY environment variable at build time (a GitHub
 * secret in CI): it is not in the repository, but it is readable in the built app, as
 * it travels in every tile URL.
 */

declare const __CARTO_API_KEY__: string | undefined;

export type CartoBasemapStyle = 'voyager_nolabels' | 'voyager_only_labels';

export const CARTO_API_KEY_URL = 'https://carto.com/basemaps/apikey';

// Replaced by webpack; undefined where nothing defines it (tests)
const BUILD_KEY = typeof __CARTO_API_KEY__ === 'string' ? __CARTO_API_KEY__.trim() : '';

/** Whether this build carries a key, so that the user does not need one */
export function hasBuiltInCartoKey(): boolean {
  return BUILD_KEY !== '';
}

/** Key of the tiles: the user's own key wins over the build's */
export function effectiveCartoKey(userKey: string): string {
  return userKey.trim() || BUILD_KEY;
}

/** Leaflet tile URL template of a CARTO raster basemap, with the API key when there is one */
export function cartoTileUrl(style: CartoBasemapStyle, apiKey: string = BUILD_KEY): string {
  const url = `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png`;
  const key = apiKey.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}
