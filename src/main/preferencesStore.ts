/**
 * Preferences of the application, in one JSON file. The values are read once and kept in
 * memory, so two changes made at the same time cannot overwrite each other with an old copy
 * of the file; writes run one after the other, each to a temporary file renamed over the
 * real one, so an interrupted write never leaves half a file.
 */

import { promises as fs } from 'fs';

export interface PreferencesStore {
  get: (key: string) => Promise<unknown>;
  all: () => Promise<Record<string, unknown>>;
  set: (key: string, value: unknown) => Promise<void>;
}

export function createPreferencesStore(filePath: string): PreferencesStore {
  let loaded: Promise<Record<string, unknown>> | null = null;
  let lastWrite: Promise<void> = Promise.resolve();

  const load = (): Promise<Record<string, unknown>> => {
    loaded ??= (async () => {
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        return {};  // No file yet
      }
      try {
        const parsed: unknown = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Not JSON: handled below
      }
      // The next save would erase what the file still holds (the CARTO key...): keep it aside
      console.error(`Preferences file unreadable, kept as ${filePath}.corrupt`);
      await fs.rename(filePath, `${filePath}.corrupt`).catch(() => {});
      return {};
    })();
    return loaded;
  };

  const write = (prefs: Record<string, unknown>): Promise<void> => {
    const content = JSON.stringify(prefs, null, 2);
    lastWrite = lastWrite.then(async () => {
      const temporary = `${filePath}.tmp`;
      try {
        await fs.writeFile(temporary, content, 'utf-8');
        await fs.rename(temporary, filePath);
      } catch (error) {
        console.error('Error saving preferences:', error);
        await fs.rm(temporary, { force: true }).catch(() => {});
      }
    });
    return lastWrite;
  };

  return {
    get: async (key) => (await load())[key] ?? null,
    all: async () => ({ ...(await load()) }),
    set: async (key, value) => {
      const prefs = await load();
      prefs[key] = value;
      await write(prefs);
    },
  };
}
