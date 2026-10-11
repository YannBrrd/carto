import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import L from 'leaflet';
import { useOSMOverlay } from './useOSMOverlay';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { objectFingerprint } from '../utils/geometry';
import { ColorOverridesState, RenderStyle } from '../types';

// A map that only keeps track of its layers: the overlay is never drawn
function fakeMap() {
  const layers = new Set<L.Layer>();
  const panes: Record<string, HTMLElement> = {};
  return {
    addLayer(layer: L.Layer) { layers.add(layer); return this; },
    removeLayer(layer: L.Layer) { layers.delete(layer); return this; },
    hasLayer(layer: L.Layer) { return layers.has(layer); },
    getPane(name: string) { return panes[name]; },
    createPane(name: string) { panes[name] = document.createElement('div'); return panes[name]; },
  } as unknown as L.Map;
}

const data = () => ({
  elements: [
    { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
    { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
    { type: 'node', id: 3, lat: 48.857, lon: 2.355 },
    { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'primary' } },
    { type: 'way', id: 200, nodes: [2, 3], tags: { highway: 'primary' } },
  ],
});

interface Props {
  map: L.Map;
  osmData: any;
  style: RenderStyle;
  overrides: ColorOverridesState;
}

const handleClick = () => false;

function setup(initial: Props) {
  return renderHook((props: Props) => useOSMOverlay(
    props.map, props.osmData, props.style, objectFingerprint(props.style as any), props.overrides,
    undefined, false, false, handleClick,
  ), { initialProps: initial });
}

const override = (wayId: number, color: string) => ({ wayId, color, category: 'highway' as const });
const fillOf = (overlay: L.LayerGroup | null, wayId: number): any =>
  overlay!.getLayers().find((layer: any) => layer.wayId === wayId && !layer.isCasing);
const settle = () => act(() => { vi.advanceTimersByTime(500); });

describe('useOSMOverlay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('applies every color override to an overlay rebuilt for new data, even when overrides changed meanwhile', () => {
    const red = { overrides: { 100: override(100, '#ff0000') } };
    let props: Props = { map: fakeMap(), osmData: data(), style: structuredClone(MAPS_STYLE), overrides: red };
    const hook = setup(props);
    settle();
    expect(fillOf(hook.result.current.osmOverlay, 100).options.color).toBe('#ff0000');

    props = { ...props, osmData: data() };
    hook.rerender(props);
    act(() => { vi.advanceTimersByTime(100); });
    props = { ...props, overrides: { overrides: { ...red.overrides, 200: override(200, '#0000ff') } } };
    hook.rerender(props);
    settle();

    const overlay = hook.result.current.osmOverlay;
    expect(fillOf(overlay, 100).options.color).toBe('#ff0000');
    expect(fillOf(overlay, 200).options.color).toBe('#0000ff');
  });

  it('removes the overlay when there is no data to show (zoomed out)', () => {
    const map = fakeMap();
    let props: Props = { map, osmData: data(), style: structuredClone(MAPS_STYLE), overrides: { overrides: {} } };
    const hook = setup(props);
    settle();
    const overlay = hook.result.current.osmOverlay!;
    expect(map.hasLayer(overlay)).toBe(true);

    props = { ...props, osmData: null };
    hook.rerender(props);
    settle();
    expect(map.hasLayer(overlay)).toBe(false);
    expect(hook.result.current.osmOverlay).toBeNull();
    expect(hook.result.current.layerMapRef.current.size).toBe(0);
  });

  it('draws every overlay of a map on the same canvas renderer', () => {
    let props: Props = { map: fakeMap(), osmData: data(), style: structuredClone(MAPS_STYLE), overrides: { overrides: {} } };
    const hook = setup(props);
    settle();
    const first = fillOf(hook.result.current.osmOverlay, 100).options.renderer;
    props = { ...props, osmData: data() };
    hook.rerender(props);
    settle();
    expect(first).toBeInstanceOf(L.Canvas);
    expect(fillOf(hook.result.current.osmOverlay, 100).options.renderer).toBe(first);
  });

  it('keeps the casing and the fill of a road in the layer map, to recolor both', () => {
    const props: Props = { map: fakeMap(), osmData: data(), style: structuredClone(MAPS_STYLE), overrides: { overrides: {} } };
    const hook = setup(props);
    settle();
    expect(hook.result.current.layerMapRef.current.get(100)).toHaveLength(2);
  });
});
