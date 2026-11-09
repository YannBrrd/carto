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

/** Node coordinates by id, in growable typed arrays; ids are added in increasing order */
class NodeTable {
  private ids = new Float64Array(1024);
  private lats = new Float64Array(1024);
  private lons = new Float64Array(1024);
  size = 0;

  add(id: number, lat: number, lon: number): void {
    if (this.size === this.ids.length) {
      const grow = (array: Float64Array) => { const next = new Float64Array(array.length * 2); next.set(array); return next; };
      this.ids = grow(this.ids);
      this.lats = grow(this.lats);
      this.lons = grow(this.lons);
    }
    // Files are sorted by id; an unsorted one is sorted once read (see sort)
    this.ids[this.size] = id;
    this.lats[this.size] = lat;
    this.lons[this.size] = lon;
    this.size++;
  }

  /** Sorts by id, for files that are not sorted */
  sort(): void {
    const order = Array.from({ length: this.size }, (_, i) => i);
    let sorted = true;
    for (let i = 1; i < this.size && sorted; i++) sorted = this.ids[i - 1] < this.ids[i];
    if (sorted) return;
    order.sort((a, b) => this.ids[a] - this.ids[b]);
    const reorder = (array: Float64Array) => Float64Array.from(order, i => array[i]);
    [this.ids, this.lats, this.lons] = [reorder(this.ids), reorder(this.lats), reorder(this.lons)];
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

  lat(index: number): number { return this.lats[index]; }
  lon(index: number): number { return this.lons[index]; }
}

interface StoredWay { id: number; refs: number[]; tags: Tags; drawn: boolean; box: Box }
interface StoredRelation { id: number; members: PbfMember[]; tags: Tags; box: Box }

const emptyBox = (): Box => ({ south: Infinity, west: Infinity, north: -Infinity, east: -Infinity });
const extend = (box: Box, lat: number, lon: number) => {
  box.south = Math.min(box.south, lat); box.north = Math.max(box.north, lat);
  box.west = Math.min(box.west, lon); box.east = Math.max(box.east, lon);
};
const intersects = (a: Box, b: Box) => a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west;
const contains = (box: Box, lat: number, lon: number) => lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;

export async function buildOsmStore(
  file: string,
  boxes: Box[],
  filter: OsmFilter,
  onProgress?: (progress: ExtractProgress) => void
): Promise<OsmStore> {
  const progress = (phase: ExtractPhase) => (read: number, total: number) => onProgress?.({ phase, fraction: total ? read / total : 1 });

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
  const nodeTags = new Map<number, Tags>();
  for await (const block of readPbfBlocks(file, progress('nodes'), { nodes: true })) {
    for (const node of block.nodes) {
      if (!cells.has(cellKey(node.lat, node.lon))) continue;
      table.add(node.id, node.lat, node.lon);
      if (node.tags && matchesAny(node.tags, filter.nodes)) nodeTags.set(node.id, node.tags);
    }
  }
  table.sort();

  // 3. Drawn ways and member ways; a way is kept when it touches the bounds or its multipolygon does
  const keptWays = new Map<number, Omit<StoredWay, 'box'>>();
  const memberWays = new Map<number, Omit<StoredWay, 'box'>>();
  const touchedRelations = new Set<number>();
  for await (const block of readPbfBlocks(file, progress('ways'), { ways: true })) {
    for (const way of block.ways) {
      const drawn = matchesAny(way.tags, filter.ways);
      const ofRelations = relationsOfWay.get(way.id);
      if (!drawn && !ofRelations) continue;
      const touches = way.refs.some(ref => table.indexOf(ref) >= 0);
      const stored = { id: way.id, refs: way.refs, tags: way.tags, drawn };
      if (touches) {
        keptWays.set(way.id, stored);
        ofRelations?.forEach(id => touchedRelations.add(id));
      } else if (ofRelations) {
        memberWays.set(way.id, stored);
      }
    }
  }
  for (const id of [...relations.keys()]) {
    if (!touchedRelations.has(id)) relations.delete(id);
  }
  for (const relation of relations.values()) {
    for (const member of relation.members) {
      const way = member.type === 'way' ? memberWays.get(member.ref) : undefined;
      if (way) keptWays.set(way.id, way);
    }
  }
  memberWays.clear();
  relationsOfWay.clear();

  // 4. Nodes of the kept ways outside the bounds
  const missing = new Set<number>();
  for (const way of keptWays.values()) {
    for (const ref of way.refs) if (table.indexOf(ref) < 0) missing.add(ref);
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

  // Index: the box of every way and multipolygon
  const ways = new Map<number, StoredWay>();
  for (const way of keptWays.values()) {
    const box = emptyBox();
    for (const ref of way.refs) {
      const index = table.indexOf(ref);
      if (index >= 0) extend(box, table.lat(index), table.lon(index));
    }
    ways.set(way.id, { ...way, box });
  }
  const storedRelations: StoredRelation[] = [...relations.values()].map(relation => {
    const box = emptyBox();
    for (const member of relation.members) {
      const way = member.type === 'way' ? ways.get(member.ref) : undefined;
      if (way) { extend(box, way.box.south, way.box.west); extend(box, way.box.north, way.box.east); }
    }
    return { ...relation, box };
  });
  const taggedNodes = [...nodeTags.entries()];

  const query = (box: Box) => {
    const nodeIds = new Set<number>();
    const wayIds = new Set<number>();
    const outRelations: OsmElement[] = [];
    for (const relation of storedRelations) {
      if (!intersects(relation.box, box)) continue;
      outRelations.push({ type: 'relation', id: relation.id, members: relation.members, tags: relation.tags });
      for (const member of relation.members) if (member.type === 'way' && ways.has(member.ref)) wayIds.add(member.ref);
    }
    for (const way of ways.values()) {
      if (way.drawn && intersects(way.box, box)) wayIds.add(way.id);
    }
    const outWays: OsmElement[] = [];
    for (const id of wayIds) {
      const way = ways.get(id)!;
      outWays.push({ type: 'way', id, nodes: way.refs, tags: way.tags });
      way.refs.forEach(ref => nodeIds.add(ref));
    }
    const outNodes: OsmElement[] = [];
    for (const [id, tags] of taggedNodes) {
      const index = table.indexOf(id);
      if (contains(box, table.lat(index), table.lon(index))) {
        outNodes.push({ type: 'node', id, lat: table.lat(index), lon: table.lon(index), tags });
        nodeIds.delete(id);
      }
    }
    for (const id of nodeIds) {
      const index = table.indexOf(id);
      if (index < 0) continue;
      const tags = nodeTags.get(id);
      outNodes.push(tags ? { type: 'node', id, lat: table.lat(index), lon: table.lon(index), tags }
        : { type: 'node', id, lat: table.lat(index), lon: table.lon(index) });
    }
    return { elements: [...outNodes, ...outWays, ...outRelations] };
  };

  return { query, stats: { nodes: table.size, ways: ways.size, relations: storedRelations.length } };
}
