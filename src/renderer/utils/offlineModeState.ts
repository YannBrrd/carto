/**
 * Offline mode state saved between sessions: the toggle and the file to read again at startup.
 * The parsed data and its bounds are gone with the process, so the bounds are never restored:
 * they come back with the file once it is loaded.
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
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_STATE };
    const { enabled, filePath, fileName } = parsed as Record<string, unknown>;
    const hasFile = typeof filePath === 'string' && filePath.length > 0 && typeof fileName === 'string' && fileName.length > 0;
    return {
      ...DEFAULT_STATE,
      enabled: enabled === true,
      filePath: hasFile ? filePath : null,
      fileName: hasFile ? fileName : null,
    };
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
