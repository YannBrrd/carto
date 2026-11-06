import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readOsmFile } from './osmFile';

const XML = '<?xml version="1.0"?><osm version="0.6"><node id="1" lat="48.85" lon="2.35"/></osm>';

describe('readOsmFile', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carto-osm-'));
    await fs.writeFile(path.join(dir, 'ville.osm'), XML, 'utf-8');
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not a map', 'utf-8');
  });
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads an .osm file and names it', async () => {
    const filePath = path.join(dir, 'ville.osm');
    await expect(readOsmFile(filePath)).resolves.toEqual({ success: true, content: XML, filePath, fileName: 'ville.osm' });
  });

  it('reports a file that is no longer there', async () => {
    const result = await readOsmFile(path.join(dir, 'parti.osm'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/introuvable/);
  });

  it('refuses anything but an OSM XML file', async () => {
    const result = await readOsmFile(path.join(dir, 'notes.txt'));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\.osm/);
  });
});
