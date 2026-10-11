import { describe, it, expect } from 'vitest';
import {
  classifyWay, editCategoryOf, areaLabelTypeOf, getBuildingStyleKey, getPOIIcon, collectFeatures, areaLabels,
  editableFeatures, LANDUSE_DRAW_ORDER, NATURAL_DRAW_ORDER, BUILDING_DRAW_ORDER, AREA_TAGS,
} from './features';

describe('classifyWay', () => {
  it.each<[Record<string, string>, ReturnType<typeof classifyWay>]>([
    // Buildings first, whatever else the way carries
    [{ building: 'yes' }, { kind: 'building', key: 'residential' }],
    [{ building: 'church' }, { kind: 'building', key: 'religious' }],
    [{ building: 'yes', landuse: 'industrial' }, { kind: 'building', key: 'residential' }],
    [{ building: 'yes', leisure: 'park' }, { kind: 'building', key: 'residential' }],
    [{ building: 'no', leisure: 'park' }, { kind: 'natural', key: 'grassland' }],
    // Roads: drawn levels only, not road areas
    [{ highway: 'primary' }, { kind: 'highway', key: 'primary' }],
    [{ highway: 'bridleway' }, { kind: 'highway', key: 'path' }],
    [{ highway: 'proposed' }, null],
    [{ highway: 'construction' }, null],
    [{ highway: 'platform', railway: 'platform' }, null],
    [{ highway: 'pedestrian', area: 'yes', leisure: 'park' }, { kind: 'natural', key: 'grassland' }],
    [{ highway: 'pedestrian', area: 'yes' }, null],
    [{ highway: 'residential', railway: 'tram' }, { kind: 'highway', key: 'residential' }],
    // Railways: lines in use only
    [{ railway: 'rail' }, { kind: 'railway' }],
    [{ railway: 'narrow_gauge' }, { kind: 'railway' }],
    [{ railway: 'platform' }, null],
    [{ railway: 'disused' }, null],
    [{ railway: 'abandoned' }, null],
    [{ railway: 'construction' }, null],
    [{ railway: 'proposed' }, null],
    // Waterway lines, and water areas
    [{ waterway: 'stream' }, { kind: 'waterway', key: 'stream' }],
    [{ waterway: 'ditch' }, { kind: 'waterway', key: 'canal' }],
    [{ waterway: 'tidal_channel' }, { kind: 'waterway', key: 'default' }],
    [{ waterway: 'dam' }, null],
    [{ waterway: 'pressurised' }, null],
    [{ waterway: 'riverbank' }, { kind: 'natural', key: 'water' }],
    [{ waterway: 'dock' }, { kind: 'natural', key: 'water' }],
    [{ natural: 'water', waterway: 'riverbank' }, { kind: 'natural', key: 'water' }],
    [{ landuse: 'reservoir' }, { kind: 'natural', key: 'water' }],
    [{ landuse: 'basin' }, { kind: 'natural', key: 'water' }],
    // Natural areas before landuse
    [{ natural: 'wood' }, { kind: 'natural', key: 'wood' }],
    [{ natural: 'wood', landuse: 'forest' }, { kind: 'natural', key: 'wood' }],
    [{ natural: 'grass' }, { kind: 'natural', key: 'grassland' }],
    [{ natural: 'beach' }, { kind: 'natural', key: 'beach' }],
    // Landuse
    [{ landuse: 'forest' }, { kind: 'landuse', key: 'forest' }],
    [{ landuse: 'orchard' }, { kind: 'landuse', key: 'farmland' }],
    [{ landuse: 'retail' }, { kind: 'landuse', key: 'commercial' }],
    [{ landuse: 'industrial' }, { kind: 'landuse', key: 'industrial' }],
    [{ landuse: 'residential' }, { kind: 'landuse', key: 'residential' }],
    // Parks and green spaces
    [{ leisure: 'park' }, { kind: 'natural', key: 'grassland' }],
    [{ leisure: 'pitch' }, { kind: 'natural', key: 'grassland' }],
    [{ landuse: 'meadow' }, { kind: 'natural', key: 'grassland' }],
    // Grounds of amenities, shops and tourist sites are not buildings
    [{ amenity: 'parking' }, null],
    [{ amenity: 'school' }, null],
    [{ amenity: 'grave_yard', landuse: 'cemetery' }, null],
    [{ shop: 'mall' }, null],
    [{ tourism: 'attraction', natural: 'scrub' }, null],
    [{}, null],
  ])('classifies %o as %o', (tags, expected) => {
    expect(classifyWay(tags)).toEqual(expected);
  });
});

describe('draw orders', () => {
  it('stacks landuse, natural areas and buildings from bottom to top', () => {
    expect(LANDUSE_DRAW_ORDER).toEqual(['residential', 'commercial', 'industrial', 'farmland', 'forest']);
    expect(NATURAL_DRAW_ORDER).toEqual(['wood', 'grassland', 'beach', 'water']);
    expect(BUILDING_DRAW_ORDER).toEqual(['residential', 'commercial', 'industrial', 'religious', 'construction', 'default']);
  });
});

describe('editCategoryOf', () => {
  it.each<[Record<string, string>, ReturnType<typeof editCategoryOf>]>([
    [{ building: 'yes' }, 'building'],
    [{ highway: 'residential' }, 'highway'],
    [{ waterway: 'river' }, 'waterway'],
    [{ natural: 'water' }, 'natural'],
    [{ leisure: 'playground' }, 'natural'],
    [{ landuse: 'forest' }, 'natural'],
    [{ landuse: 'residential' }, null],
    [{ railway: 'rail' }, null],
    [{ amenity: 'parking' }, null],
  ])('lets %o be recolored in the %s category', (tags, category) => {
    expect(editCategoryOf(tags)).toBe(category);
  });
});

describe('areaLabelTypeOf', () => {
  it.each<[Record<string, string>, ReturnType<typeof areaLabelTypeOf>]>([
    [{ leisure: 'park' }, 'park'],
    [{ landuse: 'park' }, 'park'],
    [{ natural: 'grass' }, 'park'],
    [{ natural: 'water' }, 'water'],
    [{ waterway: 'riverbank' }, 'water'],
    [{ natural: 'wood' }, 'forest'],
    [{ landuse: 'forest' }, 'forest'],
    [{ natural: 'beach' }, 'beach'],
    [{ landuse: 'cemetery' }, null],
    [{ landuse: 'residential' }, null],
    [{ building: 'yes' }, null],
  ])('labels named %o areas as %s', (tags, type) => {
    expect(areaLabelTypeOf(tags)).toBe(type);
  });
});

describe('getBuildingStyleKey', () => {
  it.each([
    ['yes', 'residential'], ['house', 'residential'], ['retail', 'commercial'], ['warehouse', 'industrial'],
    ['chapel', 'religious'], ['construction', 'construction'], ['school', 'default'],
  ])('styles building=%s with the %s style', (building, key) => {
    expect(getBuildingStyleKey(building)).toBe(key);
  });
});

describe('getPOIIcon', () => {
  it.each<[Record<string, string>, string | null]>([
    [{ amenity: 'bar' }, 'pub'],
    [{ tourism: 'information' }, 'info'],
    [{ shop: 'bakery' }, 'bakery'],
    [{ highway: 'bus_stop' }, 'bus_stop'],
    [{ railway: 'station' }, 'railway_station'],
    [{ amenity: 'bench' }, null],
    [{ amenity: 'constructor' }, null],
  ])('uses the icon of %o: %s', (tags, icon) => {
    expect(getPOIIcon(tags)).toBe(icon);
  });
});

describe('collectFeatures', () => {
  // A grid of nodes: node 1x is at (lat(x), 2), node 2x at (lat(x), 2.001)
  const lat = (x: number) => 48 + x / 1000;
  const grid = [0, 1, 2, 3, 4, 5].flatMap(x => [
    { type: 'node', id: 10 + x, lat: lat(x), lon: 2 },
    { type: 'node', id: 20 + x, lat: lat(x), lon: 2.001 },
  ]);
  const square = (a: number, b: number) => [10 + a, 20 + a, 20 + b, 10 + b, 10 + a];

  function data(...elements: any[]) {
    return { elements: [...grid, ...elements] };
  }

  it('sorts drawn ways into their feature, keeping their id, tags and coordinates', () => {
    const features = collectFeatures(data(
      { type: 'way', id: 1, nodes: [10, 20], tags: { highway: 'primary', tunnel: 'yes' } },
      { type: 'way', id: 2, nodes: [10, 20], tags: { railway: 'subway', tunnel: 'yes' } },
      { type: 'way', id: 3, nodes: [11, 21], tags: { waterway: 'ditch' } },
      { type: 'way', id: 4, nodes: square(0, 1), tags: { building: 'church' } },
      { type: 'way', id: 5, nodes: square(1, 2), tags: { landuse: 'retail' } },
      { type: 'way', id: 6, nodes: square(2, 3), tags: { leisure: 'park' } },
      { type: 'way', id: 7, nodes: square(3, 4), tags: { amenity: 'parking' } },
    ));
    expect(features.highway.primary).toEqual([
      { id: 1, tags: { highway: 'primary', tunnel: 'yes' }, key: 'primary', coords: [[48, 2], [48, 2.001]] },
    ]);
    expect(features.railway.tunnel.map(f => f.id)).toEqual([2]);
    expect(features.waterway.canal.map(f => f.id)).toEqual([3]);
    expect(features.building.religious.map(f => f.id)).toEqual([4]);
    expect(features.landuse.commercial.map(f => f.id)).toEqual([5]);
    expect(features.natural.grassland).toEqual([{
      id: 6, tags: { leisure: 'park' }, key: 'grassland',
      polygons: [[[[lat(2), 2], [lat(2), 2.001], [lat(3), 2.001], [lat(3), 2], [lat(2), 2]]]],
    }]);
    const all = Object.values(features).flatMap(group => Object.values(group).flat());
    expect(all.map((f: any) => f.id).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('closes unclosed area ways and skips areas with less than three points', () => {
    const features = collectFeatures(data(
      { type: 'way', id: 1, nodes: [10, 20, 21], tags: { natural: 'water' } },
      { type: 'way', id: 2, nodes: [10, 20], tags: { natural: 'water' } },
      { type: 'way', id: 3, nodes: [10, 99], tags: { highway: 'residential' } },
    ));
    expect(features.natural.water.map(f => f.polygons[0][0])).toEqual([[[48, 2], [48, 2.001], [lat(1), 2.001], [48, 2]]]);
    expect(features.highway.residential).toEqual([]);
  });

  it('draws multipolygon areas with their holes, keyed by minus the relation id', () => {
    const features = collectFeatures(data(
      { type: 'way', id: 1, nodes: [10, 20, 25] },
      { type: 'way', id: 2, nodes: [25, 15, 10] },
      { type: 'way', id: 3, nodes: square(2, 3) },
      {
        type: 'relation', id: 1, tags: { type: 'multipolygon', natural: 'water', name: 'Lac' },
        members: [{ type: 'way', ref: 1, role: 'outer' }, { type: 'way', ref: 2, role: 'outer' },
          { type: 'way', ref: 3, role: 'inner' }],
      },
      {
        type: 'relation', id: 2, tags: { type: 'multipolygon', building: 'yes' },
        members: [{ type: 'way', ref: 3, role: 'outer' }],
      },
      { type: 'relation', id: 3, tags: { type: 'route', route: 'bus' }, members: [{ type: 'way', ref: 3, role: '' }] },
      {
        type: 'relation', id: 4, tags: { type: 'multipolygon', amenity: 'parking' },
        members: [{ type: 'way', ref: 3, role: 'outer' }],
      },
    ));
    expect(features.natural.water).toHaveLength(1);
    const [lake] = features.natural.water;
    expect(lake.id).toBe(-1);
    expect(lake.polygons).toHaveLength(1);
    expect(lake.polygons[0]).toHaveLength(2);
    expect(features.building.residential.map(f => f.id)).toEqual([-2]);
  });

  it('collects the features of a data set once', () => {
    const osmData = data({ type: 'way', id: 1, nodes: [10, 20], tags: { highway: 'primary' } });
    expect(collectFeatures(osmData)).toBe(collectFeatures(osmData));
  });
});

describe('areaLabels', () => {
  const osmData = {
    elements: [
      { type: 'node', id: 1, lat: 48, lon: 2 },
      { type: 'node', id: 2, lat: 48, lon: 2.004 },
      { type: 'node', id: 3, lat: 48.002, lon: 2.004 },
      { type: 'node', id: 4, lat: 48.002, lon: 2 },
      { type: 'way', id: 1, nodes: [1, 2, 3, 4, 1], tags: { leisure: 'park', name: 'Parc' } },
      { type: 'way', id: 2, nodes: [1, 2, 3, 4, 1], tags: { landuse: 'cemetery', name: 'Cimetière' } },
      { type: 'way', id: 3, nodes: [1, 2, 3, 4, 1], tags: { natural: 'water' } },
      { type: 'way', id: 4, nodes: [1, 2, 3, 4, 1], tags: { landuse: 'forest', name: 'Bois' } },
    ],
  };

  it('labels the named areas the map draws at the center of their outline', () => {
    const labels = areaLabels(collectFeatures(osmData));
    expect(labels.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'Bois', type: 'forest' },
      { name: 'Parc', type: 'park' },
    ]);
    for (const label of labels) {
      expect(label.lat).toBeCloseTo(48.001);
      expect(label.lon).toBeCloseTo(2.002);
    }
  });
});

describe('editableFeatures', () => {
  const osmData = {
    elements: [
      { type: 'node', id: 1, lat: 48, lon: 2 },
      { type: 'node', id: 2, lat: 48, lon: 2.004 },
      { type: 'node', id: 3, lat: 48.002, lon: 2.004 },
      { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'residential' } },
      { type: 'way', id: 2, nodes: [1, 2], tags: { railway: 'rail' } },
      { type: 'way', id: 3, nodes: [1, 2, 3, 1], tags: { landuse: 'forest' } },
      { type: 'way', id: 4, nodes: [1, 2, 3, 1], tags: { landuse: 'residential' } },
      { type: 'relation', id: 5, tags: { type: 'multipolygon', building: 'yes' }, members: [{ type: 'way', ref: 4, role: 'outer' }] },
    ],
  };

  it('lists the features that can be recolored, with their category and center', () => {
    const editable = editableFeatures(collectFeatures(osmData));
    expect([...editable.keys()].sort()).toEqual([-5, 1, 3]);
    expect(editable.get(1)?.category).toBe('highway');
    expect(editable.get(1)?.center.lat).toBeCloseTo(48);
    expect(editable.get(1)?.center.lon).toBeCloseTo(2.002);
    expect(editable.get(3)?.category).toBe('natural');
    expect(editable.get(-5)?.category).toBe('building');
    expect(editable.get(-5)?.center.lat).toBeCloseTo(48 + 0.002 / 3);
  });
});

describe('AREA_TAGS', () => {
  it('lists tag values the map draws as natural or landuse areas', () => {
    for (const [key, values] of Object.entries(AREA_TAGS)) {
      for (const value of values) {
        expect(['natural', 'landuse'], `${key}=${value}`).toContain(classifyWay({ [key]: value })?.kind);
      }
    }
  });

  it('covers water, woods, parks and landuse', () => {
    expect(AREA_TAGS.natural).toEqual(expect.arrayContaining(['water', 'wood', 'grassland', 'grass', 'beach']));
    expect(AREA_TAGS.landuse).toEqual(expect.arrayContaining(['forest', 'residential', 'retail', 'meadow', 'reservoir']));
    expect(AREA_TAGS.leisure).toEqual(['park', 'garden', 'playground', 'pitch']);
    expect(AREA_TAGS.waterway).toEqual(['riverbank', 'dock']);
  });
});
