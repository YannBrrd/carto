import { describe, it, expect } from 'vitest';
import { loadOfflineModeState, saveOfflineModeState, OFFLINE_MODE_KEY } from './offlineModeState';
import { OfflineModeState } from '../types';

function storageWith(value: string | null) {
  const store: Record<string, string> = {};
  if (value !== null) store[OFFLINE_MODE_KEY] = value;
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, item: string) => { store[key] = item; },
    store,
  };
}

const loadedFile: OfflineModeState = {
  enabled: true,
  filePath: '/tmp/ville.osm',
  fileName: 'ville.osm',
  dataBounds: { minlat: 48.8, minlon: 2.3, maxlat: 48.9, maxlon: 2.4 },
};

describe('loadOfflineModeState', () => {
  it('restores the toggle but not a file that is no longer loaded', () => {
    const storage = storageWith(JSON.stringify(loadedFile));
    expect(loadOfflineModeState(storage)).toEqual({ enabled: true, filePath: null, fileName: null, dataBounds: null });
  });

  it('starts online when nothing was saved', () => {
    expect(loadOfflineModeState(storageWith(null)).enabled).toBe(false);
  });

  it.each(['null', '"offline"', '{"enabled":"yes"}', '{not json'])('starts online when the saved state is %s', (saved) => {
    expect(loadOfflineModeState(storageWith(saved))).toEqual({ enabled: false, filePath: null, fileName: null, dataBounds: null });
  });

  it('starts online when the storage cannot be read', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); } };
    expect(loadOfflineModeState(storage).enabled).toBe(false);
  });
});

describe('saveOfflineModeState', () => {
  it('saves the state and ignores a storage that cannot be written', () => {
    const storage = storageWith(null);
    saveOfflineModeState(loadedFile, storage);
    expect(JSON.parse(storage.store[OFFLINE_MODE_KEY])).toEqual(loadedFile);
    expect(() => saveOfflineModeState(loadedFile, { setItem: () => { throw new Error('QuotaExceededError'); } })).not.toThrow();
  });
});
