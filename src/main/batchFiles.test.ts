import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { resolveInside, listKmlFiles, outputExists, writeOutput } from './batchFiles';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'carto-batch-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const touch = async (relative: string, content = '') => {
  const file = path.join(root, ...relative.split('/'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};

describe('resolveInside', () => {
  it('resolves a relative path with slashes inside the root', () => {
    expect(resolveInside(root, 'a/b/c.pdf')).toBe(path.join(root, 'a', 'b', 'c.pdf'));
  });

  it('refuses a path leaving the root', () => {
    expect(() => resolveInside(root, '../x.pdf')).toThrow();
    expect(() => resolveInside(root, 'a/../../x.pdf')).toThrow();
    expect(() => resolveInside(root, path.resolve('/etc/passwd'))).toThrow();
    expect(() => resolveInside(root, '')).toThrow();
  });
});

describe('listKmlFiles', () => {
  it('lists the KML files of the folder and of all its subfolders, relative, with slashes, sorted', async () => {
    await touch('b.kml');
    await touch('a/z.KML');
    await touch('a/deep/er/x.kml');
    await touch('notes.txt');
    await touch('a/carte.pdf');
    expect(await listKmlFiles(root)).toEqual(['a/deep/er/x.kml', 'a/z.KML', 'b.kml']);
  });

  it('gives nothing for an empty folder, and fails for a folder that does not exist', async () => {
    expect(await listKmlFiles(root)).toEqual([]);
    await expect(listKmlFiles(path.join(root, 'missing'))).rejects.toThrow();
  });
});

describe('writeOutput', () => {
  it('creates the subfolders and writes text, data URLs and bytes', async () => {
    await writeOutput(root, 'a/b/x.svg', { text: '<svg/>' });
    await writeOutput(root, 'a/x.png', { dataUrl: `data:image/png;base64,${Buffer.from('png!').toString('base64')}` });
    await writeOutput(root, 'x.pdf', { bytes: new TextEncoder().encode('%PDF-').buffer as ArrayBuffer });
    expect(await fs.readFile(path.join(root, 'a', 'b', 'x.svg'), 'utf8')).toBe('<svg/>');
    expect(await fs.readFile(path.join(root, 'a', 'x.png'), 'utf8')).toBe('png!');
    expect(await fs.readFile(path.join(root, 'x.pdf'), 'utf8')).toBe('%PDF-');
  });

  it('replaces an existing file and leaves no temporary file', async () => {
    await touch('x.svg', 'old');
    await writeOutput(root, 'x.svg', { text: 'new' });
    expect(await fs.readFile(path.join(root, 'x.svg'), 'utf8')).toBe('new');
    expect(await fs.readdir(root)).toEqual(['x.svg']);
  });

  it('refuses an image the canvas could not encode, writing nothing', async () => {
    await expect(writeOutput(root, 'x.png', { dataUrl: 'data:,' })).rejects.toThrow();
    expect(await outputExists(root, 'x.png')).toBe(false);
  });

  it('refuses to write outside the output folder', async () => {
    await expect(writeOutput(root, '../evil.svg', { text: 'x' })).rejects.toThrow();
  });
});

describe('outputExists', () => {
  it('tells whether an output was written', async () => {
    expect(await outputExists(root, 'a/x.pdf')).toBe(false);
    await touch('a/x.pdf', '%PDF-');
    expect(await outputExists(root, 'a/x.pdf')).toBe(true);
  });

  it('does not count an empty file, left by an interrupted write', async () => {
    await touch('x.pdf');
    expect(await outputExists(root, 'x.pdf')).toBe(false);
  });
});
