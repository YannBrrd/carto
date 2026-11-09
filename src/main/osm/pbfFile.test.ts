import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readPbfBlocks, PbfBlock } from './pbfFile';
import { writePbf, TestBlock, Compression } from './testing/pbfWriter';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carto-pbf-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

async function fileOf(blocks: TestBlock[], options: { compression?: Compression; requiredFeatures?: string[] } = {}) {
  const file = path.join(dir, 'test.osm.pbf');
  await fs.writeFile(file, writePbf(blocks, options));
  return file;
}

async function readAll(file: string, onProgress?: (read: number, total: number) => void): Promise<PbfBlock[]> {
  const blocks: PbfBlock[] = [];
  for await (const block of readPbfBlocks(file, onProgress)) blocks.push(block);
  return blocks;
}

describe('readPbfBlocks', () => {
  it('reads dense nodes, with their coordinates and tags', async () => {
    const file = await fileOf([{
      nodes: [
        { id: 1, lat: 48.8566, lon: 2.3522 },
        { id: 7, lat: 48.85, lon: 2.36, tags: { amenity: 'cafe', name: 'Café de la Mairie' } },
        { id: 12_000_000_000, lat: -33.9, lon: -70.6 },
      ],
    }]);
    const [block] = await readAll(file);
    expect(block.nodes.map(n => n.id)).toEqual([1, 7, 12_000_000_000]);
    expect(block.nodes[0].lat).toBeCloseTo(48.8566, 7);
    expect(block.nodes[0].lon).toBeCloseTo(2.3522, 7);
    expect(block.nodes[0].tags).toBeNull();
    expect(block.nodes[1].tags).toEqual({ amenity: 'cafe', name: 'Café de la Mairie' });
    expect(block.nodes[2].lat).toBeCloseTo(-33.9, 7);
    expect(block.nodes[2].lon).toBeCloseTo(-70.6, 7);
  });

  it('applies the granularity and the offsets of the block', async () => {
    const file = await fileOf([{ nodes: [{ id: 1, lat: 48.8566, lon: 2.3522 }], granularity: 1000, latOffset: 40e9, lonOffset: 2e9 }]);
    const [block] = await readAll(file);
    expect(block.nodes[0].lat).toBeCloseTo(48.8566, 6);
    expect(block.nodes[0].lon).toBeCloseTo(2.3522, 6);
  });

  it('reads plain nodes too', async () => {
    const file = await fileOf([{ plainNodes: [{ id: 5, lat: 45.5, lon: 4.8, tags: { shop: 'bakery' } }] }]);
    const [block] = await readAll(file);
    expect(block.nodes).toEqual([{ id: 5, lat: expect.closeTo(45.5, 7), lon: expect.closeTo(4.8, 7), tags: { shop: 'bakery' } }]);
  });

  it('reads ways with their node references and tags', async () => {
    const file = await fileOf([{ ways: [{ id: 100, refs: [3, 1, 2, 3], tags: { building: 'yes' } }, { id: 101, refs: [9, 8] }] }]);
    const [block] = await readAll(file);
    expect(block.ways).toEqual([
      { id: 100, refs: [3, 1, 2, 3], tags: { building: 'yes' } },
      { id: 101, refs: [9, 8], tags: {} },
    ]);
  });

  it('reads relations with their members and roles', async () => {
    const file = await fileOf([{
      relations: [{
        id: 900,
        tags: { type: 'multipolygon', natural: 'water' },
        members: [{ type: 'way', ref: 100, role: 'outer' }, { type: 'way', ref: 50, role: 'inner' }, { type: 'node', ref: 7, role: '' }],
      }],
    }]);
    const [block] = await readAll(file);
    expect(block.relations).toEqual([{
      id: 900,
      tags: { type: 'multipolygon', natural: 'water' },
      members: [{ type: 'way', ref: 100, role: 'outer' }, { type: 'way', ref: 50, role: 'inner' }, { type: 'node', ref: 7, role: '' }],
    }]);
  });

  it('reads every block, raw or compressed, and tells its progress up to the size of the file', async () => {
    for (const compression of ['raw', 'zlib'] as const) {
      const file = await fileOf([{ nodes: [{ id: 1, lat: 1, lon: 1 }] }, { ways: [{ id: 2, refs: [1] }] }], { compression });
      const progress: number[][] = [];
      const blocks = await readAll(file, (read, total) => progress.push([read, total]));
      expect(blocks.map(b => [b.nodes.length, b.ways.length])).toEqual([[1, 0], [0, 1]]);
      const size = (await fs.stat(file)).size;
      expect(progress.at(-1)).toEqual([size, size]);
    }
  });

  it('refuses a compression it cannot read', async () => {
    const file = await fileOf([{ nodes: [{ id: 1, lat: 1, lon: 1 }] }], { compression: 'lzma' });
    await expect(readAll(file)).rejects.toThrow(/compression/i);
  });

  it('refuses a file needing a feature it does not know', async () => {
    const file = await fileOf([], { requiredFeatures: ['OsmSchema-V0.6', 'HistoricalInformation'] });
    await expect(readAll(file)).rejects.toThrow(/HistoricalInformation/);
  });

  it('refuses a truncated file and a file that is not PBF', async () => {
    const whole = writePbf([{ nodes: [{ id: 1, lat: 1, lon: 1 }] }]);
    const truncated = path.join(dir, 'cut.osm.pbf');
    await fs.writeFile(truncated, whole.subarray(0, whole.length - 5));
    await expect(readAll(truncated)).rejects.toThrow(/tronqué|PBF/i);

    const xml = path.join(dir, 'map.osm');
    await fs.writeFile(xml, '<?xml version="1.0"?><osm version="0.6"></osm>');
    await expect(readAll(xml)).rejects.toThrow(/PBF/);
  });
});
