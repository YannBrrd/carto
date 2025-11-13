import L from 'leaflet';

export async function fetchOSMData(bounds: L.LatLngBounds) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();

  // Overpass API query for all map data
  const query = `
    [out:json][timeout:25];
    (
      way["highway"](${south},${west},${north},${east});
      way["building"](${south},${west},${north},${east});
      way["natural"](${south},${west},${north},${east});
      way["waterway"](${south},${west},${north},${east});
      way["landuse"](${south},${west},${north},${east});
      relation["building"](${south},${west},${north},${east});
    );
    out body;
    >;
    out skel qt;
  `;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching OSM data:', error);
    throw new Error('Impossible de récupérer les données OSM. Veuillez réessayer.');
  }
}
