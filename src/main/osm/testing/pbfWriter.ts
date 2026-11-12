/**
 * Minimal OSM PBF writer for the tests: dense or plain nodes, ways, relations, raw or zlib
 * blobs. Not part of the application (excluded from the main build).
 */

import * as zlib from 'zlib';

class ProtoWriter {
  private bytes: number[] = [];

  varint(value: number): this {
    let v = value;
    while (v >= 0x80) {
      this.bytes.push((v % 0x80) | 0x80);
      v = Math.floor(v / 0x80);
    }
    this.bytes.push(v);
    return this;
  }

  private key(field: number, wire: number): this {
    return this.varint(field * 8 + wire);
  }

  uint(field: number, value: number): this {
    return this.key(field, 0).varint(value);
  }

  sint(field: number, value: number): this {
    return this.uint(field, zigzag(value));
  }

  bytesField(field: number, data: Uint8Array): this {
    this.key(field, 2).varint(data.length);
    for (const b of data) this.bytes.push(b);
    return this;
  }

  string(field: number, text: string): this {
    return this.bytesField(field, Buffer.from(text, 'utf8'));
  }

  message(field: number, writer: ProtoWriter): this {
    return this.bytesField(field, writer.finish());
  }

  packedUint(field: number, values: number[]): this {
    const inner = new ProtoWriter();
    values.forEach(v => inner.varint(v));
    return this.bytesField(field, inner.finish());
  }

  packedSint(field: number, values: number[]): this {
    return this.packedUint(field, values.map(zigzag));
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const zigzag = (v: number) => (v < 0 ? -v * 2 - 1 : v * 2);

export type Tags = Record<string, string>;
export interface TestNode { id: number; lat: number; lon: number; tags?: Tags }
export interface TestWay { id: number; refs: number[]; tags?: Tags }
export interface TestMember { type: 'node' | 'way' | 'relation'; ref: number; role: string }
export interface TestRelation { id: number; members: TestMember[]; tags?: Tags }

export interface TestBlock {
  nodes?: TestNode[];
  /** Nodes written as plain Node messages instead of DenseNodes */
  plainNodes?: TestNode[];
  ways?: TestWay[];
  relations?: TestRelation[];
  granularity?: number;
  latOffset?: number;
  lonOffset?: number;
}

function primitiveBlock(block: TestBlock): Uint8Array {
  const strings = [''];
  const sid = (text: string) => {
    let index = strings.indexOf(text);
    if (index < 0) index = strings.push(text) - 1;
    return index;
  };
  const granularity = block.granularity ?? 100;
  const latOffset = block.latOffset ?? 0;
  const lonOffset = block.lonOffset ?? 0;
  const coordinate = (value: number, offset: number) => Math.round((value * 1e9 - offset) / granularity);

  const group = new ProtoWriter();
  if (block.nodes?.length) {
    const dense = new ProtoWriter();
    const delta = (values: number[]) => values.map((v, i) => v - (i ? values[i - 1] : 0));
    dense.packedSint(1, delta(block.nodes.map(n => n.id)));
    dense.packedSint(8, delta(block.nodes.map(n => coordinate(n.lat, latOffset))));
    dense.packedSint(9, delta(block.nodes.map(n => coordinate(n.lon, lonOffset))));
    const keysVals: number[] = [];
    for (const node of block.nodes) {
      for (const [k, v] of Object.entries(node.tags ?? {})) keysVals.push(sid(k), sid(v));
      keysVals.push(0);
    }
    dense.packedUint(10, keysVals);
    group.message(2, dense);
  }
  for (const node of block.plainNodes ?? []) {
    const message = new ProtoWriter().sint(1, node.id);
    const tags = Object.entries(node.tags ?? {});
    message.packedUint(2, tags.map(([k]) => sid(k))).packedUint(3, tags.map(([, v]) => sid(v)));
    message.sint(8, coordinate(node.lat, latOffset)).sint(9, coordinate(node.lon, lonOffset));
    group.message(1, message);
  }
  for (const way of block.ways ?? []) {
    const tags = Object.entries(way.tags ?? {});
    const message = new ProtoWriter().uint(1, way.id)
      .packedUint(2, tags.map(([k]) => sid(k))).packedUint(3, tags.map(([, v]) => sid(v)))
      .packedSint(8, way.refs.map((r, i) => r - (i ? way.refs[i - 1] : 0)));
    group.message(3, message);
  }
  for (const relation of block.relations ?? []) {
    const tags = Object.entries(relation.tags ?? {});
    const ids = relation.members.map(m => m.ref);
    const message = new ProtoWriter().uint(1, relation.id)
      .packedUint(2, tags.map(([k]) => sid(k))).packedUint(3, tags.map(([, v]) => sid(v)))
      .packedUint(8, relation.members.map(m => sid(m.role)))
      .packedSint(9, ids.map((id, i) => id - (i ? ids[i - 1] : 0)))
      .packedUint(10, relation.members.map(m => ['node', 'way', 'relation'].indexOf(m.type)));
    group.message(4, message);
  }

  const table = new ProtoWriter();
  strings.forEach(text => table.string(1, text));
  const primitive = new ProtoWriter().message(1, table).message(2, group);
  if (block.granularity !== undefined) primitive.uint(17, granularity);
  if (block.latOffset !== undefined) primitive.uint(19, latOffset);
  if (block.lonOffset !== undefined) primitive.uint(20, lonOffset);
  return primitive.finish();
}

export type Compression = 'zlib' | 'raw' | 'lzma';

function fileBlock(type: string, data: Uint8Array, compression: Compression): Buffer {
  const blob = new ProtoWriter();
  if (compression === 'raw') blob.bytesField(1, data);
  else if (compression === 'zlib') blob.uint(2, data.length).bytesField(3, zlib.deflateSync(data));
  else blob.uint(2, data.length).bytesField(4, data);
  const blobBytes = blob.finish();
  const header = new ProtoWriter().string(1, type).uint(3, blobBytes.length).finish();
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return Buffer.concat([length, Buffer.from(header), Buffer.from(blobBytes)]);
}

/** OSM PBF file of the blocks, after a header requiring the given features */
export function writePbf(
  blocks: TestBlock[],
  options: { compression?: Compression; requiredFeatures?: string[] } = {}
): Buffer {
  const compression = options.compression ?? 'zlib';
  const header = new ProtoWriter();
  for (const feature of options.requiredFeatures ?? ['OsmSchema-V0.6', 'DenseNodes']) header.string(4, feature);
  header.string(16, 'carto-tests');
  return Buffer.concat([
    fileBlock('OSMHeader', header.finish(), compression === 'lzma' ? 'zlib' : compression),
    ...blocks.map(block => fileBlock('OSMData', primitiveBlock(block), compression)),
  ]);
}
