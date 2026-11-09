import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildOsmStore, OsmStore, Box, matchesRule } from './osmExtract';
import { writePbf, TestNode, TestWay, TestRelation } from './testing/pbfWriter';
// The filter of the Overpass query, as the renderer sends it
import { OSM_FILTER } from '../../renderer/utils/osmData';

// Territory A around Paris city hall, territory B in Lyon
const A: Box = { south: 48.85, west: 2.35, north: 48.86, east: 2.36 };
const B: Box = { south: 45.75, west: 4.83, north: 45.76, east: 4.84 };

const nodes: TestNode[] = [
  // Inside A
  { id: 1, lat: 48.852, lon: 2.352 },
  { id: 2, lat: 48.852, lon: 2.358 },
  { id: 3, lat: 48.858, lon: 2.358, tags: { amenity: 'cafe', name: 'Café' } },
  { id: 4, lat: 48.858, lon: 2.352, tags: { barrier: 'gate' } },
  { id: 5, lat: 48.855, lon: 2.355 },
  // Just outside A: the far ends of a road and of a lake
  { id: 10, lat: 48.87, lon: 2.355 },
  { id: 11, lat: 48.84, lon: 2.34 },
  { id: 12, lat: 48.84, lon: 2.37 },
  // Far from every territory
  { id: 20, lat: 43.6, lon: 1.44 },
  { id: 21, lat: 43.61, lon: 1.44 },
  { id: 22, lat: 43.6, lon: 1.45, tags: { amenity: 'school' } },
  // Inside B
  { id: 30, lat: 45.755, lon: 4.835, tags: { shop: 'bakery' } },
  { id: 31, lat: 45.752, lon: 4.832 },
  { id: 32, lat: 45.758, lon: 4.838 },
  // Inside the lake, an island far outside A
  { id: 40, lat: 48.83, lon: 2.34 },
  { id: 41, lat: 48.83, lon: 2.345 },
  { id: 42, lat: 48.835, lon: 2.345 },
];

const ways: TestWay[] = [
  { id: 100, refs: [1, 2], tags: { highway: 'primary', name: 'Rue de Rivoli' } },
  // Leaves A: kept with its outside node
  { id: 101, refs: [5, 10], tags: { highway: 'residential' } },
  // Untagged and outside every relation: not drawn
  { id: 102, refs: [1, 5] },
  // Tagged but not drawn by the map
  { id: 103, refs: [2, 5], tags: { power: 'line' } },
  // Far away
  { id: 104, refs: [20, 21], tags: { building: 'yes' } },
  // Lake: outer ring through A, inner ring outside A
  { id: 110, refs: [11, 12, 2, 11] },
  { id: 111, refs: [40, 41, 42, 40] },
  // B
  { id: 120, refs: [31, 32], tags: { highway: 'tertiary' } },
];

const relations: TestRelation[] = [
  {
    id: 900, tags: { type: 'multipolygon', natural: 'water', name: 'Lac' },
    members: [{ type: 'way', ref: 110, role: 'outer' }, { type: 'way', ref: 111, role: 'inner' }],
  },
  // Not a multipolygon, and a multipolygon the map does not draw
  { id: 901, tags: { type: 'route', route: 'bus' }, members: [{ type: 'way', ref: 100, role: '' }] },
  { id: 902, tags: { type: 'multipolygon', landuse: 'cemetery' }, members: [{ type: 'way', ref: 102, role: 'outer' }] },
];

let dir: string;
let file: string;
let store: OsmStore;
const phases: string[] = [];

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carto-extract-'));
  file = path.join(dir, 'region.osm.pbf');
  // Sorted like real extracts: nodes, then ways, then relations, over several blocks
  await fs.writeFile(file, writePbf([
    { nodes: nodes.slice(0, 9) }, { nodes: nodes.slice(9) }, { ways: ways.slice(0, 4) }, { ways: ways.slice(4) }, { relations },
  ]));
  store = await buildOsmStore(file, [A, B], OSM_FILTER, progress => { phases.push(progress.phase); });
});
afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

const ids = (elements: any[], type: string) => elements.filter(e => e.type === type).map(e => e.id).sort((a, b) => a - b);

describe('matchesRule', () => {
  it('matches a key with any value, or with one of the values', () => {
    expect(matchesRule({ highway: 'primary' }, { key: 'highway' })).toBe(true);
    expect(matchesRule({ highway: 'bus_stop' }, { key: 'highway', values: ['bus_stop'] })).toBe(true);
    expect(matchesRule({ highway: 'primary' }, { key: 'highway', values: ['bus_stop'] })).toBe(false);
    expect(matchesRule({}, { key: 'highway' })).toBe(false);
  });
});

describe('buildOsmStore', () => {
  it('reads the file in passes, telling each phase', () => {
    expect([...new Set(phases)]).toEqual(['relations', 'nodes', 'ways', 'missing-nodes']);
  });

  it('keeps only the nodes the territories need', () => {
    // Nodes of A, B, the far ends of the road and of the lake, the island: not Toulouse
    expect(store.stats.nodes).toBe(nodes.length - 3);
  });

  it('gives the ways the map draws in the bounds, with all their nodes', () => {
    const { elements } = store.query(A);
    expect(ids(elements, 'way')).toEqual([100, 101, 110, 111]);
    const road = elements.find(e => e.type === 'way' && e.id === 101);
    expect(road).toEqual({ type: 'way', id: 101, nodes: [5, 10], tags: { highway: 'residential' } });
    // The node of the road outside A is there, so the road is drawn up to the edge
    expect(elements.find(e => e.type === 'node' && e.id === 10)).toMatchObject({ lat: expect.closeTo(48.87, 6), lon: expect.closeTo(2.355, 6) });
  });

  it('gives the multipolygons through the bounds with every member way and node, even outside', () => {
    const { elements } = store.query(A);
    expect(ids(elements, 'relation')).toEqual([900]);
    expect(elements.find(e => e.type === 'relation')).toEqual({
      type: 'relation', id: 900, tags: { type: 'multipolygon', natural: 'water', name: 'Lac' },
      members: [{ type: 'way', ref: 110, role: 'outer' }, { type: 'way', ref: 111, role: 'inner' }],
    });
    for (const id of [11, 12, 40, 41, 42]) expect(ids(elements, 'node')).toContain(id);
  });

  it('gives the tagged nodes the map draws, with their tags, and the other nodes without', () => {
    const { elements } = store.query(A);
    expect(elements.find(e => e.id === 3 && e.type === 'node')!.tags).toEqual({ amenity: 'cafe', name: 'Café' });
    // The gate is in no returned way: not given
    expect(ids(elements, 'node')).not.toContain(4);
    expect(elements.find(e => e.id === 1 && e.type === 'node')).not.toHaveProperty('tags');
  });

  it('gives each territory its own data only', () => {
    const { elements } = store.query(B);
    expect(ids(elements, 'way')).toEqual([120]);
    expect(ids(elements, 'node')).toEqual([30, 31, 32]);
    expect(ids(elements, 'relation')).toEqual([]);
  });

  it('gives nothing for bounds outside the territories it was built for', () => {
    expect(store.query({ south: 43.59, west: 1.43, north: 43.62, east: 1.46 }).elements).toEqual([]);
  });

  it('gives every element once, nodes before the ways that use them', () => {
    const { elements } = store.query(A);
    const keys = elements.map(e => `${e.type}/${e.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    const firstWay = elements.findIndex(e => e.type === 'way');
    expect(elements.slice(firstWay).every(e => e.type !== 'node')).toBe(true);
  });
});
