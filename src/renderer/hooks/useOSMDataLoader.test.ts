import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import L from 'leaflet';
import { useOSMDataLoader } from './useOSMDataLoader';
import { setOfflineData, clearAllCaches } from '../utils/osmData';

// A map that only reports its view and dispatches its move events
function fakeMap(bounds: L.LatLngBounds, zoom: number) {
  const handlers: Record<string, Array<() => void>> = {};
  return {
    bounds,
    getBounds: () => bounds,
    getZoom: () => zoom,
    on(event: string, handler: () => void) { (handlers[event] ??= []).push(handler); return this; },
    off(event: string, handler: () => void) { handlers[event] = (handlers[event] ?? []).filter(h => h !== handler); return this; },
    fire(event: string) { (handlers[event] ?? []).forEach(h => h()); },
    moveTo(newBounds: L.LatLngBounds) { bounds = newBounds; this.bounds = newBounds; this.fire('moveend'); },
  };
}

const paris = L.latLngBounds([48.85, 2.34], [48.86, 2.36]);
const lyon = L.latLngBounds([45.75, 4.83], [45.76, 4.85]);

const jsonResponse = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as unknown as Response);
const setStatus = () => {};

describe('useOSMDataLoader', () => {
  beforeEach(() => { clearAllCaches(); });
  afterEach(() => { vi.unstubAllGlobals(); clearAllCaches(); });

  it('keeps the offline file when offline mode takes effect', async () => {
    const online = { elements: [{ type: 'node', id: 1, lat: 48.855, lon: 2.35 }] };
    const offline = { elements: [{ type: 'node', id: 2, lat: 48.855, lon: 2.351, tags: { amenity: 'cafe' } }] };
    const fetchSpy = vi.fn(async () => jsonResponse(online));
    vi.stubGlobal('fetch', fetchSpy);
    const map = fakeMap(paris, 16);

    const hook = renderHook(
      ({ offlineMode }: { offlineMode: boolean }) => useOSMDataLoader(map as unknown as L.Map, offlineMode, setStatus),
      { initialProps: { offlineMode: false } },
    );
    await waitFor(() => expect(hook.result.current.osmData).toBe(online));

    // The user loads a file, then the app switches to offline mode
    setOfflineData(offline, null);
    hook.rerender({ offlineMode: true });

    // The file answers with what the view shows
    await waitFor(() => expect(hook.result.current.osmData?.elements.map((e: any) => e.id)).toEqual([2]));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('asks to zoom in below zoom 15 in offline mode too', async () => {
    setOfflineData({ elements: [{ type: 'node', id: 2, lat: 48.855, lon: 2.351 }] }, null);
    const status = vi.fn();
    const map = fakeMap(paris, 12);
    const hook = renderHook(() => useOSMDataLoader(map as unknown as L.Map, true, status));
    await waitFor(() => expect(status).toHaveBeenCalledWith(expect.stringContaining('Zoomez davantage')));
    expect(hook.result.current.osmData).toBeNull();
  });

  it('loads the view the user reached while a load was running', async () => {
    const first = { elements: [{ type: 'node', id: 1, lat: 48.855, lon: 2.35 }] };
    const second = { elements: [{ type: 'node', id: 2, lat: 45.755, lon: 4.84 }] };
    let finishFirst: () => void = () => {};
    const urls: string[] = [];
    const fetchSpy = vi.fn((url: string) => {
      urls.push(url);
      if (urls.length === 1) return new Promise<Response>(resolve => { finishFirst = () => resolve(jsonResponse(first)); });
      return Promise.resolve(jsonResponse(second));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const map = fakeMap(paris, 16);

    const hook = renderHook(() => useOSMDataLoader(map as unknown as L.Map, false, setStatus));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // The user pans to another city while the first load is still running
    map.moveTo(lyon);
    await waitFor(() => expect(hook.result.current.isLoadingView).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 900));  // past the move debounce
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finishFirst();

    await waitFor(() => expect(hook.result.current.osmData).toBe(second), { timeout: 2000 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(urls[1])).toMatch(/\(45\.7\d*,4\.8\d*,45\.7\d*,4\.8\d*\)/);  // Lyon, padded
  });
});
