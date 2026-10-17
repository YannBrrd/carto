/**
 * CARTO raster basemaps under and above the overlay. Without an API key, CARTO draws an
 * "API key required" watermark on the tiles. The key comes from the CARTO_API_KEY
 * environment variable at build time (a GitHub secret in CI): it is not in the repository,
 * but it is readable in the built app, as it travels in every tile URL.
 */

declare const __CARTO_API_KEY__: string | undefined;

export type CartoBasemapStyle = 'voyager_nolabels' | 'voyager_only_labels';

// Replaced by webpack; undefined where nothing defines it (tests)
const BUILD_KEY = typeof __CARTO_API_KEY__ === 'string' ? __CARTO_API_KEY__ : '';

/** Leaflet tile URL template of a CARTO raster basemap, with the API key when there is one */
export function cartoTileUrl(style: CartoBasemapStyle, apiKey: string = BUILD_KEY): string {
  const url = `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png`;
  const key = apiKey.trim();
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}
