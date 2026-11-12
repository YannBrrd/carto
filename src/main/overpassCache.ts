/**
 * Disk cache of the Overpass answers of the batch export: a batch run again (another style,
 * an interrupted run) does not download its data again. One gzip file per query, named by
 * the hash of the query, valid 30 days from its writing.
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const SUFFIX = '.json.gz';

export interface OverpassCache {
  get(query: string): Promise<string | null>;
  put(query: string, answer: string): Promise<void>;
  /** Removes the expired answers and the leftovers of interrupted writes; gives their number */
  purge(): Promise<number>;
}

export function createOverpassCache(
  dir: string,
  options: { maxAgeMs?: number; now?: () => number } = {}
): OverpassCache {
  const maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
  const now = options.now ?? Date.now;
  const fileOf = (query: string) => path.join(dir, createHash('sha256').update(query).digest('hex') + SUFFIX);
  const expired = (mtimeMs: number) => now() - mtimeMs > maxAgeMs;

  return {
    async get(query) {
      const file = fileOf(query);
      try {
        const { mtimeMs } = await fs.stat(file);
        if (expired(mtimeMs)) return null;
        return (await gunzip(await fs.readFile(file))).toString('utf8');
      } catch {
        return null;
      }
    },

    async put(query, answer) {
      await fs.mkdir(dir, { recursive: true });
      const file = fileOf(query);
      const temporary = `${file}.${process.pid}.part`;
      try {
        await fs.writeFile(temporary, await gzip(Buffer.from(answer, 'utf8')));
        // The age of an entry is the time of its writing, on the cache clock
        const time = new Date(now());
        await fs.utimes(temporary, time, time);
        await fs.rename(temporary, file);
      } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
      }
    },

    async purge() {
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return 0;
      }
      let removed = 0;
      for (const entry of entries) {
        const file = path.join(dir, entry);
        try {
          const stale = entry.endsWith('.part') || (entry.endsWith(SUFFIX) && expired((await fs.stat(file)).mtimeMs));
          if (stale) {
            await fs.rm(file, { force: true });
            removed++;
          }
        } catch {
          // An entry removed meanwhile
        }
      }
      return removed;
    },
  };
}
