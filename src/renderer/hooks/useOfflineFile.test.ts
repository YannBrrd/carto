import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import L from 'leaflet';
import { useOfflineFile } from './useOfflineFile';
import { OFFLINE_MODE_KEY } from '../utils/offlineModeState';
import { fetchOSMData, clearAllCaches } from '../utils/osmData';

const XML = '<?xml version="1.0"?><osm version="0.6">'
  + '<bounds minlat="48.85" minlon="2.34" maxlat="48.86" maxlon="2.36"/>'
  + '<node id="1" lat="48.855" lon="2.35"><tag k="amenity" v="cafe"/></node>'
  + '</osm>';
const bounds = { minlat: 48.85, minlon: 2.34, maxlat: 48.86, maxlon: 2.36 };
const view = L.latLngBounds([48.85, 2.34], [48.86, 2.36]);

const api = { readOsmFile: vi.fn(), openOsmFile: vi.fn() };

beforeEach(() => {
  localStorage.clear();
  clearAllCaches();
  api.readOsmFile.mockReset();
  api.openOsmFile.mockReset();
  (window as any).electronAPI = api;
});
afterEach(() => { clearAllCaches(); });

const saved = (filePath: string | null) => localStorage.setItem(OFFLINE_MODE_KEY, JSON.stringify({
  enabled: true, filePath, fileName: filePath && filePath.split('/').pop(), dataBounds: bounds,
}));

describe('useOfflineFile at startup', () => {
  it('reloads the saved file and leaves Overpass once it is loaded', async () => {
    saved('/data/ville.osm');
    api.readOsmFile.mockResolvedValue({ success: true, content: XML, filePath: '/data/ville.osm', fileName: 'ville.osm' });

    const hook = renderHook(() => useOfflineFile());
    expect(hook.result.current.useOfflineMode).toBe(false);  // Nothing loaded yet
    await waitFor(() => expect(hook.result.current.useOfflineMode).toBe(true));

    expect(api.readOsmFile).toHaveBeenCalledWith('/data/ville.osm');
    expect(hook.result.current.offlineMode).toEqual({ enabled: true, filePath: '/data/ville.osm', fileName: 'ville.osm', dataBounds: bounds });
    expect(hook.result.current.isLoadingOfflineFile).toBe(false);
    const data = await fetchOSMData(view, true);
    expect(data.elements.map((e: any) => e.id)).toEqual([1]);
  });

  it('forgets a saved file that cannot be read and says so', async () => {
    saved('/data/parti.osm');
    api.readOsmFile.mockResolvedValue({ success: false, error: 'Fichier introuvable : /data/parti.osm' });

    const hook = renderHook(() => useOfflineFile());
    await waitFor(() => expect(hook.result.current.isLoadingOfflineFile).toBe(false));
    await waitFor(() => expect(hook.result.current.loadError).toMatch(/parti\.osm/));

    expect(hook.result.current.useOfflineMode).toBe(false);
    expect(hook.result.current.offlineMode).toEqual({ enabled: true, filePath: null, fileName: null, dataBounds: null });
    expect(JSON.parse(localStorage.getItem(OFFLINE_MODE_KEY)!).filePath).toBeNull();
  });

  it('reads nothing when no file was saved', async () => {
    const hook = renderHook(() => useOfflineFile());
    await waitFor(() => expect(hook.result.current.isLoadingOfflineFile).toBe(false));
    expect(api.readOsmFile).not.toHaveBeenCalled();
    expect(hook.result.current.offlineMode.enabled).toBe(false);
  });
});

describe('useOfflineFile actions', () => {
  it('loads a chosen file, keeps it across the toggle and forgets it when cleared', async () => {
    api.openOsmFile.mockResolvedValue({ success: true, content: XML, filePath: '/data/ville.osm', fileName: 'ville.osm' });
    const hook = renderHook(() => useOfflineFile());
    await waitFor(() => expect(hook.result.current.isLoadingOfflineFile).toBe(false));

    await act(async () => { await hook.result.current.selectOfflineFile(); });
    expect(hook.result.current.useOfflineMode).toBe(true);
    expect(hook.result.current.offlineMode.fileName).toBe('ville.osm');
    expect(JSON.parse(localStorage.getItem(OFFLINE_MODE_KEY)!).filePath).toBe('/data/ville.osm');

    act(() => hook.result.current.toggleOfflineMode(false));
    expect(hook.result.current.useOfflineMode).toBe(false);
    act(() => hook.result.current.toggleOfflineMode(true));
    expect(hook.result.current.useOfflineMode).toBe(true);
    expect(api.readOsmFile).not.toHaveBeenCalled();

    act(() => hook.result.current.clearOfflineFile());
    expect(hook.result.current.useOfflineMode).toBe(false);
    expect(hook.result.current.offlineMode).toEqual({ enabled: true, filePath: null, fileName: null, dataBounds: null });
  });
});
