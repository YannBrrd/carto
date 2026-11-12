import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createOverpassCache, CACHE_MAX_AGE_MS } from './overpassCache';

let dir: string;
let now: number;
const clock = () => now;

beforeEach(async () => {
  dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'carto-cache-')), 'overpass-cache');
  now = Date.parse('2026-11-09T12:00:00Z');
});
afterEach(async () => { await fs.rm(path.dirname(dir), { recursive: true, force: true }); });

const DAY = 24 * 3600 * 1000;
const answer = JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 48.85, lon: 2.35 }] });

describe('overpass cache', () => {
  it('keeps answers 30 days', () => {
    expect(CACHE_MAX_AGE_MS).toBe(30 * DAY);
  });

  it('gives back the answer of a query, and nothing for another query', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    expect(await cache.get('query A')).toBeNull();
    await cache.put('query A', answer);
    expect(await cache.get('query A')).toBe(answer);
    expect(await cache.get('query B')).toBeNull();
  });

  it('compresses the answers on disk', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    const large = JSON.stringify({ elements: Array.from({ length: 2000 }, (_, id) => ({ type: 'node', id, lat: 48.85, lon: 2.35 })) });
    await cache.put('query', large);
    const [file] = await fs.readdir(dir);
    expect(file).toMatch(/^[0-9a-f]{64}\.json\.gz$/);
    expect((await fs.stat(path.join(dir, file))).size).toBeLessThan(large.length / 5);
  });

  it('forgets an answer older than its maximum age', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    await cache.put('query', answer);
    now += 29 * DAY;
    expect(await cache.get('query')).toBe(answer);
    now += 2 * DAY;
    expect(await cache.get('query')).toBeNull();
  });

  it('removes the expired answers and the leftovers of interrupted writes, keeping the others', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    await cache.put('old', answer);
    now += 20 * DAY;
    await cache.put('recent', answer);
    await fs.writeFile(path.join(dir, 'abc.json.gz.123.part'), 'partial');
    now += 15 * DAY;
    expect(await cache.purge()).toBe(2);
    expect(await cache.get('old')).toBeNull();
    expect(await cache.get('recent')).toBe(answer);
  });

  it('treats a damaged entry as missing', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    await cache.put('query', answer);
    const [file] = await fs.readdir(dir);
    await fs.writeFile(path.join(dir, file), 'not gzip');
    expect(await cache.get('query')).toBeNull();
  });

  it('works before its folder exists, and purges nothing then', async () => {
    const cache = createOverpassCache(dir, { now: clock });
    expect(await cache.purge()).toBe(0);
    expect(await cache.get('query')).toBeNull();
  });
});
