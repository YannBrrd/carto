/**
 * Offline mode state saved between sessions. Only the toggle is restored: the parsed .osm file
 * lives in memory and is gone with the process, so restoring its name would show a file that
 * is not loaded, and the map would silently fall back to Overpass without its zoom guard.
 */

import { OfflineModeState } from '../types';

export const OFFLINE_MODE_KEY = 'carto-offline-mode';

const DEFAULT_STATE: OfflineModeState = { enabled: false, filePath: null, fileName: null, dataBounds: null };

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

export function loadOfflineModeState(storage: ReadableStorage = localStorage): OfflineModeState {
  try {
    const stored = storage.getItem(OFFLINE_MODE_KEY);
    if (!stored) return { ...DEFAULT_STATE };
    const parsed: unknown = JSON.parse(stored);
    const enabled = typeof parsed === 'object' && parsed !== null && (parsed as { enabled?: unknown }).enabled === true;
    return { ...DEFAULT_STATE, enabled };
  } catch (error) {
    console.error('Error loading offline mode state:', error);
    return { ...DEFAULT_STATE };
  }
}

export function saveOfflineModeState(state: OfflineModeState, storage: WritableStorage = localStorage): void {
  try {
    storage.setItem(OFFLINE_MODE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving offline mode state:', error);
  }
}
