/**
 * Hook for managing persistent preferences via Electron IPC
 * Preferences are stored in a JSON file in the app's userData directory
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Preference keys
export const PREF_KEYS = {
  ACTIVE_PRESET: 'activePresetId',
  EXPORT_FORMAT: 'exportFormat',
  EXPORT_OPTIONS: 'exportOptions',
  SHOW_POI: 'showPOI',
  SHOW_COMPASS: 'showCompass',
} as const;

export type PreferenceKey = typeof PREF_KEYS[keyof typeof PREF_KEYS];

// Export options interface
export interface PersistedExportOptions {
  forceAllLabels: boolean;
  exteriorOverlay: boolean;
  exteriorOverlayOpacity: number;
  maxExportSizeEnabled: boolean;
  maxExportSizeKB: number;
}

// Default values
export const DEFAULT_EXPORT_OPTIONS: PersistedExportOptions = {
  forceAllLabels: false,
  exteriorOverlay: true,
  exteriorOverlayOpacity: 0.3,
  maxExportSizeEnabled: true,
  maxExportSizeKB: 300,
};

/**
 * Get a preference value (async)
 */
export async function getPreference<T>(key: string, defaultValue: T): Promise<T> {
  if (!window.electronAPI?.getPreference) {
    console.warn('electronAPI.getPreference not available');
    return defaultValue;
  }
  try {
    const value = await window.electronAPI.getPreference<T>(key);
    return value !== null ? value : defaultValue;
  } catch (error) {
    console.error(`Error getting preference ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Set a preference value (async)
 */
export async function setPreference(key: string, value: unknown): Promise<void> {
  if (!window.electronAPI?.setPreference) {
    console.warn('electronAPI.setPreference not available');
    return;
  }
  try {
    await window.electronAPI.setPreference(key, value);
  } catch (error) {
    console.error(`Error setting preference ${key}:`, error);
  }
}

/**
 * Hook for a single preference with automatic persistence
 * @param key - The preference key
 * @param defaultValue - Default value if not found
 * @returns [value, setValue, isLoading]
 */
export function usePreference<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);

  // Load preference on mount
  useEffect(() => {
    let mounted = true;

    async function load() {
      const loaded = await getPreference<T>(key, defaultValue);
      if (mounted) {
        setValueState(loaded);
        setIsLoading(false);
        isInitializedRef.current = true;
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [key, defaultValue]);

  // Save preference when value changes (but not on initial load)
  const setValue = useCallback((newValue: T) => {
    setValueState(newValue);
    // Only save if we've initialized (prevents saving default on mount)
    if (isInitializedRef.current) {
      setPreference(key, newValue);
    }
  }, [key]);

  return [value, setValue, isLoading];
}

/**
 * Hook for export options with automatic persistence
 */
export function useExportOptionsPreference(): [
  PersistedExportOptions,
  (options: PersistedExportOptions) => void,
  boolean
] {
  return usePreference<PersistedExportOptions>(
    PREF_KEYS.EXPORT_OPTIONS,
    DEFAULT_EXPORT_OPTIONS
  );
}
