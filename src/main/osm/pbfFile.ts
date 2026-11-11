/**
 * Reading of an OSM PBF file (.osm.pbf, as Geofabrik distributes them), block by block, so
 * that a regional extract never sits in memory as a whole. Blobs are raw or zlib; dense and
 * plain nodes, ways and relations are decoded with their tags.
 */

import * as fs from 'fs/promises';
import * as zlib from 'zlib';
import { ProtoReader, WIRE_BYTES } from './protobuf';

export type Tags = Record<string, string>;
export interface PbfNode { id: number; lat: number; lon: number; tags: Tags | null }
export interface PbfWay { id: number; refs: number[]; tags: Tags }
export type MemberType = 'node' | 'way' | 'relation';
export interface PbfMember { type: MemberType; ref: number; role: string }
export interface PbfRelation { id: number; members: PbfMember[]; tags: Tags }
export interface PbfBlock { nodes: PbfNode[]; ways: PbfWay[]; relations: PbfRelation[] }

const SUPPORTED_FEATURES = new Set(['OsmSchema-V0.6', 'DenseNodes', 'Sort.Type_then_ID', 'Sort.Geographic']);
const MEMBER_TYPES: MemberType[] = ['node', 'way', 'relation'];
// The format caps a header at 64 KB and a blob at 32 MB
const MAX_HEADER = 64 * 1024;
const MAX_BLOB = 32 * 1024 * 1024;

function notPbf(): Error {
  return new Error('Ce fichier n\'est pas un fichier OSM PBF (.osm.pbf).');
}

// Type and size of a blob, from its BlobHeader
function readBlobHeader(bytes: Uint8Array): { type: string; size: number } {
  const reader = new ProtoReader(bytes);
  let type = '';
  let size = -1;
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1 && wire === WIRE_BYTES) type = reader.string();
    else if (field === 3) size = reader.varint();
    else reader.skip(wire);
  }
  if (!type || size < 0) throw notPbf();
  return { type, size };
}

// Uncompressed content of a Blob
function readBlob(bytes: Uint8Array): Uint8Array {
  const reader = new ProtoReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) return reader.bytes();
    if (field === 3) return zlib.inflateSync(reader.bytes());
    if (field >= 4 && field <= 7) {
      throw new Error('Compression du fichier PBF non prise en charge (seules les données brutes et zlib le sont).');
    }
    reader.skip(wire);
  }
  throw notPbf();
}

function checkHeaderBlock(bytes: Uint8Array): void {
  const reader = new ProtoReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 4 && wire === WIRE_BYTES) {
      const feature = reader.string();
      if (!SUPPORTED_FEATURES.has(feature)) throw new Error(`Fichier PBF non pris en charge : ${feature}.`);
    } else {
      reader.skip(wire);
    }
  }
}

function tagsOf(keys: number[], values: number[], strings: string[]): Tags {
  const tags: Tags = {};
  for (let i = 0; i < keys.length; i++) tags[strings[keys[i]]] = strings[values[i]];
  return tags;
}

/** Kinds of elements to decode; the others are skipped without being decoded */
export interface PbfWant { nodes?: boolean; ways?: boolean; relations?: boolean }
const ALL: PbfWant = { nodes: true, ways: true, relations: true };

/** Nodes, ways and relations of a PrimitiveBlock */
export function decodePrimitiveBlock(bytes: Uint8Array, want: PbfWant = ALL): PbfBlock {
  const block: PbfBlock = { nodes: [], ways: [], relations: [] };
  const strings: string[] = [];
  const groups: ProtoReader[] = [];
  let granularity = 100;
  let latOffset = 0;
  let lonOffset = 0;

  const reader = new ProtoReader(bytes);
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) {
      const table = reader.message();
      while (!table.done) {
        const entry = table.key();
        if (entry.field === 1) strings.push(table.string());
        else table.skip(entry.wire);
      }
    } else if (field === 2) groups.push(reader.message());
    else if (field === 17) granularity = reader.varint();
    else if (field === 19) latOffset = reader.varint();
    else if (field === 20) lonOffset = reader.varint();
    else reader.skip(wire);
  }

  const lat = (value: number) => (latOffset + granularity * value) * 1e-9;
  const lon = (value: number) => (lonOffset + granularity * value) * 1e-9;

  for (const group of groups) {
    while (!group.done) {
      const { field, wire } = group.key();
      if (field === 1 && want.nodes) block.nodes.push(decodeNode(group.message(), strings, lat, lon));
      else if (field === 2 && want.nodes) decodeDense(group.message(), strings, lat, lon, block.nodes);
      else if (field === 3 && want.ways) block.ways.push(decodeWay(group.message(), strings));
      else if (field === 4 && want.relations) block.relations.push(decodeRelation(group.message(), strings));
      else group.skip(wire);
    }
  }
  return block;
}

type Coordinate = (value: number) => number;

function decodeNode(reader: ProtoReader, strings: string[], lat: Coordinate, lon: Coordinate): PbfNode {
  let id = 0, la = 0, lo = 0;
  let keys: number[] = [], values: number[] = [];
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) id = reader.sint();
    else if (field === 2) keys = reader.packed();
    else if (field === 3) values = reader.packed();
    else if (field === 8) la = reader.sint();
    else if (field === 9) lo = reader.sint();
    else reader.skip(wire);
  }
  return { id, lat: lat(la), lon: lon(lo), tags: keys.length ? tagsOf(keys, values, strings) : null };
}

function decodeDense(reader: ProtoReader, strings: string[], lat: Coordinate, lon: Coordinate, out: PbfNode[]): void {
  let ids: number[] = [], lats: number[] = [], lons: number[] = [], keysVals: number[] = [];
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) ids = reader.packed(true);
    else if (field === 8) lats = reader.packed(true);
    else if (field === 9) lons = reader.packed(true);
    else if (field === 10) keysVals = reader.packed();
    else reader.skip(wire);
  }
  let id = 0, la = 0, lo = 0, kv = 0;
  for (let i = 0; i < ids.length; i++) {
    id += ids[i];
    la += lats[i];
    lo += lons[i];
    let tags: Tags | null = null;
    // keys_vals: key, value pairs of each node, ended by 0; absent when no node has tags
    while (kv < keysVals.length && keysVals[kv] !== 0) {
      tags ??= {};
      tags[strings[keysVals[kv]]] = strings[keysVals[kv + 1]];
      kv += 2;
    }
    kv++;
    out.push({ id, lat: lat(la), lon: lon(lo), tags });
  }
}

function decodeWay(reader: ProtoReader, strings: string[]): PbfWay {
  let id = 0;
  let keys: number[] = [], values: number[] = [], deltas: number[] = [];
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) id = reader.varint();
    else if (field === 2) keys = reader.packed();
    else if (field === 3) values = reader.packed();
    else if (field === 8) deltas = reader.packed(true);
    else reader.skip(wire);
  }
  let ref = 0;
  return { id, refs: deltas.map(delta => (ref += delta)), tags: tagsOf(keys, values, strings) };
}

function decodeRelation(reader: ProtoReader, strings: string[]): PbfRelation {
  let id = 0;
  let keys: number[] = [], values: number[] = [], roles: number[] = [], deltas: number[] = [], types: number[] = [];
  while (!reader.done) {
    const { field, wire } = reader.key();
    if (field === 1) id = reader.varint();
    else if (field === 2) keys = reader.packed();
    else if (field === 3) values = reader.packed();
    else if (field === 8) roles = reader.packed();
    else if (field === 9) deltas = reader.packed(true);
    else if (field === 10) types = reader.packed();
    else reader.skip(wire);
  }
  let ref = 0;
  const members = deltas.map((delta, i) => ({ type: MEMBER_TYPES[types[i] ?? 0] ?? 'node', ref: (ref += delta), role: strings[roles[i]] ?? '' }));
  return { id, members, tags: tagsOf(keys, values, strings) };
}

/** Data blocks of the file, in order; `onProgress` gets the bytes read and the file size */
export async function* readPbfBlocks(
  file: string,
  onProgress?: (read: number, total: number) => void,
  want: PbfWant = ALL
): AsyncGenerator<PbfBlock> {
  const handle = await fs.open(file, 'r');
  try {
    const total = (await handle.stat()).size;
    let position = 0;
    let first = true;
    const read = async (length: number): Promise<Buffer> => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (bytesRead < length) throw new Error('Fichier PBF tronqué.');
      position += length;
      return buffer;
    };

    while (position < total) {
      const headerLength = (await read(4)).readUInt32BE(0);
      if (headerLength === 0 || headerLength > MAX_HEADER) throw notPbf();
      const header = readBlobHeader(await read(headerLength));
      if (header.size > MAX_BLOB) throw notPbf();
      if (first && header.type !== 'OSMHeader') throw notPbf();
      first = false;
      const content = readBlob(await read(header.size));
      if (header.type === 'OSMHeader') checkHeaderBlock(content);
      else if (header.type === 'OSMData') yield decodePrimitiveBlock(content, want);
      onProgress?.(position, total);
    }
    if (first) throw notPbf();
  } finally {
    await handle.close();
  }
}
