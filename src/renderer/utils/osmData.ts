import L from 'leaflet';
import { OSMBounds } from '../types';
import { boundsWithinData } from './osmXmlParser';
import { AREA_TAGS } from './features';

// Overpass API servers, tried in turn when one fails
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Cache for OSM data (online mode)
interface OSMCache {
  bounds: L.LatLngBounds;
  data: any;
  timestamp: number;
}

let osmCache: OSMCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ELEMENTS = 50000; // Don't cache very large responses to prevent memory issues

// Offline mode data storage
let offlineData: { elements: any[] } | null = null;
let offlineDataBounds: OSMBounds | null = null;

/**
 * Set offline data (parsed from XML file)
 */
export function setOfflineData(data: { elements: any[] }, bounds: OSMBounds | null): void {
  offlineData = data;
  offlineDataBounds = bounds;
  // Clear online cache when switching to offline
  osmCache = null;
}

/**
 * Clear offline data
 */
export function clearOfflineData(): void {
  offlineData = null;
  offlineDataBounds = null;
}

/**
 * Clear all module-level caches (call on component unmount to prevent memory leaks)
 */
export function clearAllCaches(): void {
  osmCache = null;
  offlineData = null;
  offlineDataBounds = null;
}

/**
 * Get offline data bounds
 */
export function getOfflineDataBounds(): OSMBounds | null {
  return offlineDataBounds;
}

/**
 * Check if offline data is loaded
 */
export function hasOfflineData(): boolean {
  return offlineData !== null;
}

// Check if requested bounds are contained within cached bounds
function boundsContained(requested: L.LatLngBounds, cached: L.LatLngBounds): boolean {
  return cached.contains(requested);
}

// Expand bounds by a margin to reduce re-fetches on small movements
function expandBounds(bounds: L.LatLngBounds, margin: number = 0.2): L.LatLngBounds {
  const latDiff = (bounds.getNorth() - bounds.getSouth()) * margin;
  const lngDiff = (bounds.getEast() - bounds.getWest()) * margin;
  return L.latLngBounds(
    [bounds.getSouth() - latDiff, bounds.getWest() - lngDiff],
    [bounds.getNorth() + latDiff, bounds.getEast() + lngDiff]
  );
}

export function clearOSMCache(): void {
  osmCache = null;
}

// Clear cache if new bounds don't overlap with cached bounds (user moved far away)
export function clearCacheIfDisjoint(bounds: L.LatLngBounds): boolean {
  if (!osmCache) return false;

  // Check if bounds overlap
  const cached = osmCache.bounds;
  const noOverlap = bounds.getNorth() < cached.getSouth() ||
                    bounds.getSouth() > cached.getNorth() ||
                    bounds.getEast() < cached.getWest() ||
                    bounds.getWest() > cached.getEast();

  if (noOverlap) {
    osmCache = null;
    return true;
  }
  return false;
}

// Get cache memory estimate (for debugging)
export function getCacheSize(): number {
  if (!osmCache) return 0;
  return osmCache.data.elements?.length || 0;
}

/**
 * Overpass query for the data the map draws in a bounding box: ways, the multipolygons
 * of buildings and areas (with their member ways), POI nodes and house numbers
 */
export function buildOverpassQuery(bounds: { south: number; west: number; north: number; east: number }): string {
  const bbox = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const ways = ['highway', 'building', 'natural', 'waterway', 'landuse', 'leisure', 'railway']
    .map(key => `way["${key}"]${bbox};`);
  const multipolygons = [
    `relation["type"="multipolygon"]["building"]${bbox};`,
    ...Object.entries(AREA_TAGS).map(([key, values]) =>
      `relation["type"="multipolygon"]["${key}"~"^(${values.join('|')})$"]${bbox};`),
  ];
  const nodes = ['["amenity"]', '["tourism"]', '["shop"]', '["highway"="bus_stop"]', '["railway"="station"]', '["addr:housenumber"]']
    .map(filter => `node${filter}${bbox};`);
  return `
    [out:json][timeout:30];
    (
      ${[...ways, ...multipolygons, ...nodes].join('\n      ')}
    );
    out body;
    >;
    out skel qt;
  `;
}

export async function fetchOSMData(bounds: L.LatLngBounds, useOffline: boolean = false) {
  // If offline mode is enabled and we have data, use it
  if (useOffline && offlineData) {
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    // Check if requested bounds are within offline data (still return data even if exceeded)
    if (offlineDataBounds) {
      boundsWithinData(
        { south, west, north, east },
        offlineDataBounds
      );
    }

    return offlineData;
  }

  // Check online cache
  if (osmCache) {
    const now = Date.now();
    const cacheValid = (now - osmCache.timestamp) < CACHE_TTL;
    const boundsValid = boundsContained(bounds, osmCache.bounds);

    if (cacheValid && boundsValid) {
      return osmCache.data;
    }
  }

  // Expand bounds to reduce future fetches
  const expandedBounds = expandBounds(bounds);
  const south = expandedBounds.getSouth();
  const west = expandedBounds.getWest();
  const north = expandedBounds.getNorth();
  const east = expandedBounds.getEast();

  const query = buildOverpassQuery({ south, west, north, east });

  const data = await fetchFromOverpass(query);

  // Cache the data (but skip caching for very large responses to prevent memory issues)
  const elementCount = data.elements?.length || 0;
  if (elementCount <= MAX_CACHE_ELEMENTS) {
    osmCache = {
      bounds: expandedBounds,
      data: data,
      timestamp: Date.now(),
    };
  } else {
    // Clear any existing cache to free memory when dealing with large areas
    osmCache = null;
  }

  return data;
}

export interface OverpassFetchOptions {
  servers?: readonly string[];
  fetchFn?: (url: string) => Promise<Response>;
  retryDelayMs?: number;
}

// Error shown once every server failed, from the most informative failure
function overpassError(lastStatus: number | null): Error {
  if (lastStatus === null) {
    return new Error('Impossible de récupérer les données OSM. Vérifiez votre connexion.');
  }
  if (lastStatus === 429) {
    return new Error('Trop de requêtes. Attendez quelques secondes et réessayez.');
  }
  if (lastStatus >= 500) {
    return new Error('Serveurs Overpass surchargés. Réessayez dans quelques instants.');
  }
  return new Error(`Erreur API (${lastStatus})`);
}

/**
 * Run an Overpass query, trying each server in turn: a server may be overloaded,
 * rate limit, refuse the request (406, 403) or be unreachable.
 */
export async function fetchFromOverpass(query: string, options: OverpassFetchOptions = {}): Promise<any> {
  const servers = options.servers ?? OVERPASS_SERVERS;
  const fetchFn = options.fetchFn ?? ((url: string) => fetch(url));
  const retryDelayMs = options.retryDelayMs ?? 500;

  // An HTTP answer explains more than an unreachable server, so it is the one reported
  let lastStatus: number | null = null;

  for (let i = 0; i < servers.length; i++) {
    if (i > 0 && retryDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }

    let response: Response;
    try {
      response = await fetchFn(`${servers[i]}?data=${encodeURIComponent(query)}`);
    } catch (error) {
      if (error instanceof TypeError) continue;  // Network error: next server
      throw error;
    }

    if (response.ok) {
      try {
        return await response.json();
      } catch {
        continue;  // Not JSON (e.g. an HTML error page): next server
      }
    }
    await response.text();  // Consume response body
    lastStatus = response.status;
  }

  throw overpassError(lastStatus);
}
