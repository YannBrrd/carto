import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createPreferencesStore } from './preferencesStore';

describe('preferences store', () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carto-prefs-'));
    file = path.join(dir, 'preferences.json');
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  const saved = async () => JSON.parse(await fs.readFile(file, 'utf-8'));

  it('reads the saved values, null for a key that was never set', async () => {
    await fs.writeFile(file, JSON.stringify({ showPOI: false }), 'utf-8');
    const store = createPreferencesStore(file);
    expect(await store.get('showPOI')).toBe(false);
    expect(await store.get('exportFormat')).toBeNull();
    expect(await store.all()).toEqual({ showPOI: false });
  });

  it('keeps every key when several are set at the same time', async () => {
    await fs.writeFile(file, JSON.stringify({ cartoApiKey: 'k' }), 'utf-8');
    const store = createPreferencesStore(file);
    await Promise.all([store.set('showPOI', false), store.set('showCompass', true), store.set('exportFormat', 'pdf')]);
    expect(await saved()).toEqual({ cartoApiKey: 'k', showPOI: false, showCompass: true, exportFormat: 'pdf' });
  });

  it('saves the last value of a key set many times in a row', async () => {
    const store = createPreferencesStore(file);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set('opacity', i)));
    expect((await saved()).opacity).toBe(19);
    expect(await store.get('opacity')).toBe(19);
  });

  it('replaces the file in one step and leaves no temporary file', async () => {
    const store = createPreferencesStore(file);
    await store.set('showPOI', true);
    expect((await fs.readdir(dir)).sort()).toEqual(['preferences.json']);
  });

  it('starts empty from a file that is not JSON, and keeps that file aside', async () => {
    await fs.writeFile(file, '{ "cartoApiKey": "k", ', 'utf-8');
    const store = createPreferencesStore(file);
    expect(await store.all()).toEqual({});
    await store.set('showPOI', true);
    expect(await saved()).toEqual({ showPOI: true });
    expect(await fs.readFile(`${file}.corrupt`, 'utf-8')).toContain('cartoApiKey');
  });
});
