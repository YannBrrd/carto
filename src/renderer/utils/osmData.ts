import L from 'leaflet';

// Overpass API servers (fallback if main is overloaded)
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Cache for OSM data
interface OSMCache {
  bounds: L.LatLngBounds;
  data: any;
  timestamp: number;
}

let osmCache: OSMCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

export async function fetchOSMData(bounds: L.LatLngBounds) {
  // Check cache first
  if (osmCache) {
    const now = Date.now();
    const cacheValid = (now - osmCache.timestamp) < CACHE_TTL;
    const boundsValid = boundsContained(bounds, osmCache.bounds);

    if (cacheValid && boundsValid) {
      console.log('Using cached OSM data');
      return osmCache.data;
    }
  }

  // Expand bounds to reduce future fetches
  const expandedBounds = expandBounds(bounds);
  const south = expandedBounds.getSouth();
  const west = expandedBounds.getWest();
  const north = expandedBounds.getNorth();
  const east = expandedBounds.getEast();

  // Overpass API query for all map data
  const query = `
    [out:json][timeout:30];
    (
      way["highway"](${south},${west},${north},${east});
      way["building"](${south},${west},${north},${east});
      way["natural"](${south},${west},${north},${east});
      way["waterway"](${south},${west},${north},${east});
      way["landuse"](${south},${west},${north},${east});
      way["leisure"](${south},${west},${north},${east});
      way["railway"](${south},${west},${north},${east});
      way["amenity"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
      node["amenity"](${south},${west},${north},${east});
      node["tourism"](${south},${west},${north},${east});
      node["shop"](${south},${west},${north},${east});
      node["highway"="bus_stop"](${south},${west},${north},${east});
      node["railway"="station"](${south},${west},${north},${east});
      node["addr:housenumber"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  console.log('Fetching OSM data for bounds:', { south, west, north, east });

  // Try each server until one works
  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const server = OVERPASS_SERVERS[i];
    const url = `${server}?data=${encodeURIComponent(query)}`;

    try {
      console.log(`Trying Overpass server ${i + 1}/${OVERPASS_SERVERS.length}:`, server);
      const response = await fetch(url);

      if (!response.ok) {
        // Server errors (429, 502, 503, 504) - try next server
        if ((response.status === 429 || response.status >= 500) && i < OVERPASS_SERVERS.length - 1) {
          console.warn(`Server ${server} returned ${response.status}, trying next...`);
          // Small delay before trying next server
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        const errorText = await response.text();
        console.error('Overpass API error:', response.status, errorText);

        if (response.status === 429) {
          throw new Error('Trop de requêtes. Attendez quelques secondes et réessayez.');
        } else if (response.status >= 500) {
          throw new Error('Serveurs Overpass surchargés. Réessayez dans quelques instants.');
        }
        throw new Error(`Erreur API (${response.status})`);
      }

      const data = await response.json();
      console.log('OSM data received:', data.elements?.length, 'elements');

      // Cache the data
      osmCache = {
        bounds: expandedBounds,
        data: data,
        timestamp: Date.now(),
      };

      return data;

    } catch (error) {
      // Network errors - try next server
      if (error instanceof TypeError && i < OVERPASS_SERVERS.length - 1) {
        console.warn(`Network error with ${server}, trying next...`);
        continue;
      }

      // Rethrow if it's our formatted error or last server
      if (error instanceof Error) {
        if (error.message.includes('Trop de requêtes') ||
            error.message.includes('surchargés') ||
            error.message.includes('Erreur API') ||
            i === OVERPASS_SERVERS.length - 1) {
          throw error;
        }
      }
    }
  }

  throw new Error('Impossible de récupérer les données OSM. Vérifiez votre connexion.');
}
