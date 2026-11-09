/**
 * The data of the batch territories, read from an OSM PBF extract instead of Overpass. The
 * file is read in four passes so that only what the territories need stays in memory:
 * 1. relations: the multipolygons the map draws, and their member ways;
 * 2. nodes: those in the territory bounds (coordinates in typed arrays, tags of the drawn ones);
 * 3. ways: those drawn, or members of a multipolygon, that touch the bounds;
 * 4. missing nodes: the nodes of the kept ways and multipolygons outside the bounds.
 * A territory then gets what the Overpass query of its bounds gives (`>;` included):
 * drawn ways and multipolygons through its bounds, with every member way and node.
 */

import { readPbfBlocks, Tags, PbfMember } from './pbfFile';

export interface Box { south: number; west: number; north: number; east: number }
export interface OsmTagRule { key: string; values?: string[] }
export interface OsmFilter { ways: OsmTagRule[]; multipolygons: OsmTagRule[]; nodes: OsmTagRule[] }

export type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number; tags?: Tags }
  | { type: 'way'; id: number; nodes: number[]; tags: Tags }
  | { type: 'relation'; id: number; members: PbfMember[]; tags: Tags };

export type ExtractPhase = 'relations' | 'nodes' | 'ways' | 'missing-nodes';
export interface ExtractProgress { phase: ExtractPhase; fraction: number }

export interface OsmStore {
  query(box: Box): { elements: OsmElement[] };
  stats: { nodes: number; ways: number; relations: number };
}

export function matchesRule(tags: Tags, rule: OsmTagRule): boolean {
  const value = tags[rule.key];
  if (value === undefined) return false;
  return !rule.values || rule.values.includes(value);
}

const matchesAny = (tags: Tags, rules: OsmTagRule[]) => rules.some(rule => matchesRule(tags, rule));

// Cells of 0.01° covered by the boxes, one cell of margin around each
const CELL = 100;
const cellKey = (lat: number, lon: number) => Math.floor(lat * CELL) * 100_000 + Math.floor((lon + 180) * CELL);

function coveredCells(boxes: Box[]): Set<number> {
  const cells = new Set<number>();
  for (const box of boxes) {
    for (let y = Math.floor(box.south * CELL) - 1; y <= Math.floor(box.north * CELL) + 1; y++) {
      for (let x = Math.floor((box.west + 180) * CELL) - 1; x <= Math.floor((box.east + 180) * CELL) + 1; x++) {
        cells.add(y * 100_000 + x);
      }
    }
  }
  return cells;
}

const COORDINATE_SCALE = 1e7;

function grown<T extends Float64Array | Int32Array | Uint8Array>(array: T, length: number): T {
  if (length <= array.length) return array;
  const next = new (array.constructor as new (n: number) => T)(Math.max(length, array.length * 2));
  next.set(array);
  return next;
}

/** Node coordinates by id, in typed arrays (16 bytes a node); ids are added in increasing order */
class NodeTable {
  private ids = new Float64Array(1024);
  private coords = new Int32Array(2048);
  size = 0;

  add(id: number, lat: number, lon: number): void {
    this.ids = grown(this.ids, this.size + 1);
    this.coords = grown(this.coords, this.size * 2 + 2);
    this.ids[this.size] = id;
    this.coords[this.size * 2] = Math.round(lat * COORDINATE_SCALE);
    this.coords[this.size * 2 + 1] = Math.round(lon * COORDINATE_SCALE);
    this.size++;
  }

  /** Sorts by id, for files that are not sorted and for the nodes added by the last pass */
  sort(): void {
    let sorted = true;
    for (let i = 1; i < this.size && sorted; i++) sorted = this.ids[i - 1] < this.ids[i];
    if (sorted) return;
    const order = Array.from({ length: this.size }, (_, i) => i).sort((a, b) => this.ids[a] - this.ids[b]);
    const ids = new Float64Array(this.size);
    const coords = new Int32Array(this.size * 2);
    order.forEach((from, to) => {
      ids[to] = this.ids[from];
      coords[to * 2] = this.coords[from * 2];
      coords[to * 2 + 1] = this.coords[from * 2 + 1];
    });
    this.ids = ids;
    this.coords = coords;
  }

  indexOf(id: number): number {
    let low = 0, high = this.size - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const value = this.ids[middle];
      if (value === id) return middle;
      if (value < id) low = middle + 1;
      else high = middle - 1;
    }
    return -1;
  }

  lat(index: number): number { return this.coords[index * 2] / COORDINATE_SCALE; }
  lon(index: number): number { return this.coords[index * 2 + 1] / COORDINATE_SCALE; }
}

/** Tag sets stored once: thousands of ways share building=yes */
class TagSets {
  private index = new Map<string, number>();
  readonly list: Tags[] = [];

  id(tags: Tags): number {
    const key = JSON.stringify(tags);
    let id = this.index.get(key);
    if (id === undefined) {
      id = this.list.push(tags) - 1;
      this.index.set(key, id);
    }
    return id;
  }
}

/** Ways in typed arrays: ids, node references in one pool, tag set, flags, bounding box */
class WayTable {
  ids = new Float64Array(1024);
  private refStart = new Float64Array(1025);
  private refs = new Float64Array(8192);
  tagSet = new Int32Array(1024);
  drawn = new Uint8Array(1024);
  kept = new Uint8Array(1024);
  size = 0;

  add(id: number, refs: number[], tagSet: number, drawn: boolean, kept: boolean): number {
    const index = this.size++;
    const start = index === 0 ? 0 : this.refStart[index];
    this.ids = grown(this.ids, this.size);
    this.tagSet = grown(this.tagSet, this.size);
    this.drawn = grown(this.drawn, this.size);
    this.kept = grown(this.kept, this.size);
    this.refStart = grown(this.refStart, this.size + 1);
    this.refs = grown(this.refs, start + refs.length);
    this.ids[index] = id;
    this.tagSet[index] = tagSet;
    this.drawn[index] = drawn ? 1 : 0;
    this.kept[index] = kept ? 1 : 0;
    this.refs.set(refs, start);
    this.refStart[index] = start;
    this.refStart[index + 1] = start + refs.length;
    return index;
  }

  refsOf(index: number): Float64Array {
    return this.refs.subarray(this.refStart[index], this.refStart[index + 1]);
  }
}

interface StoredRelation { id: number; members: PbfMember[]; tags: Tags; box: Box }

const emptyBox = (): Box => ({ south: Infinity, west: Infinity, north: -Infinity, east: -Infinity });
const extend = (box: Box, lat: number, lon: number) => {
  box.south = Math.min(box.south, lat); box.north = Math.max(box.north, lat);
  box.west = Math.min(box.west, lon); box.east = Math.max(box.east, lon);
};
const intersects = (a: Box, b: Box) => a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
const contains = (box: Box, lat: number, lon: number) => lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;

/** Items by grid cell, to find those near a box without going through all of them */
class Grid {
  private cells = new Map<number, number[]>();

  add(item: number, box: Box): void {
    for (const key of cellKeys(box)) {
      const list = this.cells.get(key);
      if (list) list.push(item);
      else this.cells.set(key, [item]);
    }
  }

  near(box: Box, visit: (item: number) => void): void {
    for (const key of cellKeys(box)) this.cells.get(key)?.forEach(visit);
  }
}

function* cellKeys(box: Box): Generator<number> {
  for (let y = Math.floor(box.south * CELL); y <= Math.floor(box.north * CELL); y++) {
    for (let x = Math.floor((box.west + 180) * CELL); x <= Math.floor((box.east + 180) * CELL); x++) yield y * 100_000 + x;
  }
}

export async function buildOsmStore(
  file: string,
  boxes: Box[],
  filter: OsmFilter,
  onProgress?: (progress: ExtractProgress) => void
): Promise<OsmStore> {
  const progress = (phase: ExtractPhase) => (read: number, total: number) => onProgress?.({ phase, fraction: total ? read / total : 1 });
  const tagSets = new TagSets();

  // 1. Multipolygons the map draws, and the relations of each member way
  const relations = new Map<number, Omit<StoredRelation, 'box'>>();
  const relationsOfWay = new Map<number, number[]>();
  for await (const block of readPbfBlocks(file, progress('relations'), { relations: true })) {
    for (const relation of block.relations) {
      if (relation.tags.type !== 'multipolygon' || !matchesAny(relation.tags, filter.multipolygons)) continue;
      relations.set(relation.id, relation);
      for (const member of relation.members) {
        if (member.type !== 'way') continue;
        const list = relationsOfWay.get(member.ref);
        if (list) list.push(relation.id);
        else relationsOfWay.set(member.ref, [relation.id]);
      }
    }
  }

  // 2. Nodes in the bounds, and the tags of the drawn ones
  const cells = coveredCells(boxes);
  const table = new NodeTable();
  const nodeTags = new Map<number, number>();
  for await (const block of readPbfBlocks(file, progress('nodes'), { nodes: true })) {
    for (const node of block.nodes) {
      if (!cells.has(cellKey(node.lat, node.lon))) continue;
      table.add(node.id, node.lat, node.lon);
      if (node.tags && matchesAny(node.tags, filter.nodes)) nodeTags.set(node.id, tagSets.id(node.tags));
    }
  }
  table.sort();

  // 3. Drawn ways and member ways; a way is kept when it touches the bounds or its multipolygon does
  const ways = new WayTable();
  const memberIndex = new Map<number, number>();
  const touchedRelations = new Set<number>();
  for await (const block of readPbfBlocks(file, progress('ways'), { ways: true })) {
    for (const way of block.ways) {
      const drawn = matchesAny(way.tags, filter.ways);
      const ofRelations = relationsOfWay.get(way.id);
      if (!drawn && !ofRelations) continue;
      const touches = way.refs.some(ref => table.indexOf(ref) >= 0);
      if (!touches && !ofRelations) continue;
      const index = ways.add(way.id, way.refs, tagSets.id(way.tags), drawn, touches);
      if (ofRelations) {
        memberIndex.set(way.id, index);
        if (touches) ofRelations.forEach(id => touchedRelations.add(id));
      }
    }
  }
  for (const id of [...relations.keys()]) {
    if (!touchedRelations.has(id)) relations.delete(id);
  }
  for (const relation of relations.values()) {
    for (const member of relation.members) {
      const index = member.type === 'way' ? memberIndex.get(member.ref) : undefined;
      if (index !== undefined) ways.kept[index] = 1;
    }
  }
  relationsOfWay.clear();

  // 4. Nodes of the kept ways outside the bounds
  const missing = new Set<number>();
  for (let index = 0; index < ways.size; index++) {
    if (!ways.kept[index]) continue;
    for (const ref of ways.refsOf(index)) if (table.indexOf(ref) < 0) missing.add(ref);
  }
  if (missing.size > 0) {
    for await (const block of readPbfBlocks(file, progress('missing-nodes'), { nodes: true })) {
      for (const node of block.nodes) {
        if (missing.has(node.id)) table.add(node.id, node.lat, node.lon);
      }
    }
    table.sort();
  } else {
    onProgress?.({ phase: 'missing-nodes', fraction: 1 });
  }
  missing.clear();

  // Index: the box of every kept way in a grid, and of every multipolygon
  const wayBoxes: Box[] = new Array(ways.size);
  const wayGrid = new Grid();
  let keptWays = 0;
  for (let index = 0; index < ways.size; index++) {
    if (!ways.kept[index]) continue;
    keptWays++;
    const box = emptyBox();
    for (const ref of ways.refsOf(index)) {
      const node = table.indexOf(ref);
      if (node >= 0) extend(box, table.lat(node), table.lon(node));
    }
    wayBoxes[index] = box;
    if (ways.drawn[index] && box.south <= box.north) wayGrid.add(index, box);
  }
  const storedRelations: StoredRelation[] = [...relations.values()].map(relation => {
    const box = emptyBox();
    for (const member of relation.members) {
      const index = member.type === 'way' ? memberIndex.get(member.ref) : undefined;
      const wayBox = index !== undefined ? wayBoxes[index] : undefined;
      if (wayBox && wayBox.south <= wayBox.north) { extend(box, wayBox.south, wayBox.west); extend(box, wayBox.north, wayBox.east); }
    }
    return { ...relation, box };
  });
  const taggedGrid = new Grid();
  const taggedIds: number[] = [];
  for (const id of nodeTags.keys()) {
    const node = table.indexOf(id);
    const lat = table.lat(node), lon = table.lon(node);
    taggedGrid.add(taggedIds.push(id) - 1, { south: lat, west: lon, north: lat, east: lon });
  }

  // Ways seen by the current query
  const seen = new Uint32Array(ways.size);
  let queries = 0;

  const query = (box: Box) => {
    const stamp = ++queries;
    const wayIndexes: number[] = [];
    const take = (index: number) => {
      if (seen[index] === stamp) return;
      seen[index] = stamp;
      wayIndexes.push(index);
    };
    const outRelations: OsmElement[] = [];
    for (const relation of storedRelations) {
      if (!intersects(relation.box, box)) continue;
      outRelations.push({ type: 'relation', id: relation.id, members: relation.members, tags: relation.tags });
      for (const member of relation.members) {
        const index = member.type === 'way' ? memberIndex.get(member.ref) : undefined;
        if (index !== undefined && ways.kept[index]) take(index);
      }
    }
    wayGrid.near(box, index => { if (intersects(wayBoxes[index], box)) take(index); });

    const nodeIds = new Set<number>();
    const outWays: OsmElement[] = wayIndexes.map(index => {
      const refs = Array.from(ways.refsOf(index));
      refs.forEach(ref => nodeIds.add(ref));
      return { type: 'way', id: ways.ids[index], nodes: refs, tags: tagSets.list[ways.tagSet[index]] };
    });

    const outNodes: OsmElement[] = [];
    const nodeOf = (id: number, node: number): OsmElement => {
      const tagSet = nodeTags.get(id);
      return tagSet === undefined
        ? { type: 'node', id, lat: table.lat(node), lon: table.lon(node) }
        : { type: 'node', id, lat: table.lat(node), lon: table.lon(node), tags: tagSets.list[tagSet] };
    };
    // Drawn nodes in the box, then the nodes of the ways (with their tags when drawn), once each
    const emitted = new Set<number>();
    taggedGrid.near(box, item => {
      const id = taggedIds[item];
      const node = table.indexOf(id);
      if (contains(box, table.lat(node), table.lon(node))) {
        emitted.add(id);
        outNodes.push(nodeOf(id, node));
      }
    });
    for (const id of nodeIds) {
      if (emitted.has(id)) continue;
      const node = table.indexOf(id);
      if (node >= 0) outNodes.push(nodeOf(id, node));
    }
    return { elements: [...outNodes, ...outWays, ...outRelations] };
  };

  return { query, stats: { nodes: table.size, ways: keptWays, relations: storedRelations.length } };
}
