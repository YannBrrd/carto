import { describe, it, expect } from 'vitest';
import { buildOverpassQuery } from './osmData';

describe('buildOverpassQuery', () => {
  const query = buildOverpassQuery({ south: 48.85, west: 2.35, north: 48.86, east: 2.36 });
  const bbox = '(48.85,2.35,48.86,2.36)';

  it('fetches the ways the map draws', () => {
    for (const key of ['highway', 'building', 'natural', 'waterway', 'landuse', 'leisure', 'railway']) {
      expect(query).toContain(`way["${key}"]${bbox};`);
    }
  });

  it('fetches the multipolygons of buildings and of the areas the map draws, with their member ways', () => {
    expect(query).toContain(`relation["type"="multipolygon"]["building"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["natural"~"^(water|wood|grassland|grass|beach)$"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["leisure"~"^(park|garden|playground|pitch)$"]${bbox};`);
    expect(query).toContain(`relation["type"="multipolygon"]["waterway"~"^(riverbank|dock)$"]${bbox};`);
    expect(query).toMatch(/relation\["type"="multipolygon"\]\["landuse"~"\^\(forest\|[a-z_|]+\)\$"\]/);
    expect(query).toMatch(/out body;\s*>;\s*out skel qt;/);
  });

  it('fetches POI nodes and house numbers', () => {
    expect(query).toContain(`node["amenity"]${bbox};`);
    expect(query).toContain(`node["addr:housenumber"]${bbox};`);
  });
});
