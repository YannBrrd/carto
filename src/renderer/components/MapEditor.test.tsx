import React from 'react';
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import L from 'leaflet';
import MapEditor from './MapEditor';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { ColorEditMode, MultiZoneState } from '../types';

// jsdom has no canvas: the overlay draws on a context that accepts every call.
// OSM data is never fetched: the tests stay offline
beforeAll(() => {
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  const noop = () => {};
  (HTMLCanvasElement.prototype as any).getContext = function getContext() {
    return new Proxy({}, {
      get: (target: any, key) => (key in target ? target[key] : noop),
      set: (target: any, key, value) => { target[key] = value; return true; },
    });
  };
});

afterEach(cleanup);

const zone = {
  id: 'z1',
  type: 'Polygon' as const,
  coordinates: [[48.857, 2.350], [48.857, 2.356], [48.855, 2.356], [48.855, 2.350]],
  bounds: L.latLngBounds([48.855, 2.350], [48.857, 2.356]),
};
const multiZoneState: MultiZoneState = { zones: [zone], activeZoneId: 'z1', contextBounds: null, contextBoundsLocked: false };
const noop = () => {};

function editor(colorEditMode: ColorEditMode, isPreviewMode = false) {
  return (
    <MapEditor
      renderStyle={MAPS_STYLE} previewStyle={MAPS_STYLE} isPreviewMode={isPreviewMode} multiZoneState={multiZoneState}
      onAddZone={noop} onUpdateZone={noop} onDeleteZone={noop} onSetActiveZone={noop} onUpdateContextBounds={noop}
      onClearAllZones={noop} colorOverrides={{ overrides: {} }} colorEditMode={colorEditMode} onApplyColorOverride={noop}
    />
  );
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });

describe('MapEditor zones during click recoloring', () => {
  it('keep letting clicks through to the map features after the style editor is opened and closed', async () => {
    const clickMode: ColorEditMode = { active: true, selectedColor: '#ff0000', selectedCategory: 'building', selectionMode: 'click' };
    const { rerender, container } = render(editor({ ...clickMode, active: false }));
    await settle();
    rerender(editor(clickMode));
    await settle();
    const zonePath = () => container.querySelector('path[stroke="#3b82f6"]') as SVGPathElement;
    expect(zonePath().style.pointerEvents).toBe('none');

    rerender(editor(clickMode, true));
    await settle();
    rerender(editor(clickMode, false));
    await settle();
    expect(zonePath().style.pointerEvents).toBe('none');
  });
});

describe('MapEditor CARTO basemap key', () => {
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  function stubPreferences(saved: Record<string, unknown>) {
    const setPreference = vi.fn(async () => ({ success: true }));
    (window as any).electronAPI = {
      getPreference: async (key: string) => (key in saved ? saved[key] : null),
      setPreference,
    };
    return setPreference;
  }

  const idle: ColorEditMode = { active: false, selectedColor: '#ff0000', selectedCategory: null, selectionMode: 'click' };

  it('asks for the key in the tools panel and saves it in the preferences', async () => {
    const setPreference = stubPreferences({});
    const { getByLabelText, getByRole, findByText } = render(editor(idle));
    await settle();
    fireEvent.change(getByLabelText('Clé API CARTO'), { target: { value: 'abc123' } });
    fireEvent.click(getByRole('button', { name: 'Enregistrer' }));
    expect(setPreference).toHaveBeenCalledWith('cartoApiKey', 'abc123');
    expect(await findByText('Fond de carte CARTO : clé enregistrée')).toBeTruthy();
  });

  it('does not ask again once a key is saved', async () => {
    stubPreferences({ cartoApiKey: 'abc123' });
    const { queryByLabelText, findByText } = render(editor(idle));
    expect(await findByText('Fond de carte CARTO : clé enregistrée')).toBeTruthy();
    expect(queryByLabelText('Clé API CARTO')).toBeNull();
  });
});
