import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import L from 'leaflet';
import { useExport, ExportOptions } from './useExport';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { MultiZoneState, Zone } from '../types';
import { fetchOSMData } from '../utils/osmData';

vi.mock('../utils/osmData', () => ({
  fetchOSMData: vi.fn(async () => ({ elements: [] })),
}));

const NORTH = 48.858;
const SOUTH = 48.854;
const WEST = 2.35;
const EAST = 2.356;

const zone: Zone = {
  id: 'z1',
  type: 'Polygon',
  coordinates: [[NORTH, WEST], [NORTH, EAST], [SOUTH, EAST], [SOUTH, WEST]],
  bounds: L.latLngBounds([SOUTH, WEST], [NORTH, EAST]),
};
const multiZoneState: MultiZoneState = { zones: [zone], activeZoneId: 'z1', contextBounds: null, contextBoundsLocked: false };

const map = {
  latLngToContainerPoint: (latLng: L.LatLng) => L.point((latLng.lng - WEST) * 100000, (NORTH - latLng.lat) * 100000),
} as unknown as L.Map;

const options: ExportOptions = {
  forceAllLabels: false,
  borderColor: '#3b82f6',
  exteriorOverlay: true,
  exteriorOverlayOpacity: 0.3,
  showPOI: false,
  showCompass: false,
  maxExportSizeEnabled: false,
  maxExportSizeKB: 500,
  minQualityPercent: 25,
  kmlAlongside: false,
};

// 2 x 2 white JPEG: what the stubbed canvas encodes
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const saved = { kml: vi.fn(), pdf: vi.fn(), svg: vi.fn(), kmlBeside: vi.fn() };

beforeEach(() => {
  saved.kml.mockReset().mockResolvedValue({ success: true, path: '/tmp/zones.kml' });
  saved.pdf.mockReset().mockResolvedValue({ success: true, path: '/tmp/carte.pdf' });
  saved.svg.mockReset().mockResolvedValue({ success: true, path: '/tmp/carte.svg' });
  saved.kmlBeside.mockReset().mockResolvedValue({ success: true, path: '/tmp/carte.kml' });
  vi.mocked(fetchOSMData).mockClear();
  (window as any).electronAPI = {
    saveKml: saved.kml,
    savePdfBuffer: saved.pdf,
    saveSvg: saved.svg,
    saveKmlBeside: saved.kmlBeside,
    getPreference: async () => null,
    setPreference: async () => ({ success: true }),
  };
  // jsdom neither loads images nor draws on canvases
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
  });
  URL.createObjectURL = () => 'blob:svg';
  URL.revokeObjectURL = () => {};
  (HTMLCanvasElement.prototype as any).getContext = () => new Proxy({}, { get: () => () => {} });
  (HTMLCanvasElement.prototype as any).toDataURL = () => JPEG;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function exportAs(format: 'kml' | 'pdf' | 'svg', exportOptions: ExportOptions = options) {
  const setStatusMessage = vi.fn();
  const { result } = renderHook(() => useExport(map, multiZoneState, MAPS_STYLE, exportOptions, undefined, false, setStatusMessage));
  act(() => result.current.setExportFormat(format));
  await act(async () => { await result.current.handleExport(); });
  return setStatusMessage;
}

describe('useExport KML', () => {
  it('saves the zones as KML, with the export border color, without fetching map data', async () => {
    const status = await exportAs('kml');
    expect(saved.kml).toHaveBeenCalledTimes(1);
    const [kml, filename] = saved.kml.mock.calls[0];
    expect(filename).toBe('zones.kml');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain(`${WEST},${NORTH}`);
    expect(kml).toContain('<color>fff6823b</color>');
    expect(fetchOSMData).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('KML exporté: /tmp/zones.kml');
  });

  it('is not written twice when the KML format itself is exported with the KML option on', async () => {
    await exportAs('kml', { ...options, kmlAlongside: true });
    expect(saved.kml).toHaveBeenCalledTimes(1);
    expect(saved.kmlBeside).not.toHaveBeenCalled();
  });
});

describe('useExport KML alongside the map', () => {
  it('writes the zones as KML beside the exported PDF, without a second dialog', async () => {
    const status = await exportAs('pdf', { ...options, kmlAlongside: true });
    expect(saved.pdf).toHaveBeenCalledTimes(1);
    expect(saved.kmlBeside).toHaveBeenCalledTimes(1);
    const [kml, mapPath] = saved.kmlBeside.mock.calls[0];
    expect(mapPath).toBe('/tmp/carte.pdf');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<color>fff6823b</color>');
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^PDF exporté: \/tmp\/carte\.pdf \(\d+ Ko\), KML: \/tmp\/carte\.kml$/));
  });

  it('does the same for the other map formats', async () => {
    const status = await exportAs('svg', { ...options, kmlAlongside: true });
    expect(saved.kmlBeside).toHaveBeenCalledWith(expect.stringContaining('<kml'), '/tmp/carte.svg');
    expect(status).toHaveBeenLastCalledWith('SVG exporté: /tmp/carte.svg, KML: /tmp/carte.kml');
  });

  it('writes nothing beside the map when the option is off', async () => {
    await exportAs('pdf');
    expect(saved.kmlBeside).not.toHaveBeenCalled();
  });

  it('writes nothing when the map export is cancelled', async () => {
    saved.pdf.mockResolvedValue({ success: false });
    const status = await exportAs('pdf', { ...options, kmlAlongside: true });
    expect(saved.kmlBeside).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('Export annulé.');
  });

  it('tells when an existing KML was kept', async () => {
    saved.kmlBeside.mockResolvedValue({ success: false, cancelled: true, path: '/tmp/carte.kml' });
    const status = await exportAs('svg', { ...options, kmlAlongside: true });
    expect(status).toHaveBeenLastCalledWith('SVG exporté: /tmp/carte.svg, KML existant conservé: /tmp/carte.kml');
  });

  it('tells when the KML could not be written, the map export being done', async () => {
    saved.kmlBeside.mockResolvedValue({ success: false, error: 'Espace disque insuffisant.' });
    const status = await exportAs('svg', { ...options, kmlAlongside: true });
    expect(status).toHaveBeenLastCalledWith('SVG exporté: /tmp/carte.svg. Erreur KML: Espace disque insuffisant.');
  });
});

describe('useExport PDF', () => {
  it('georeferences the page over the selected bounds', async () => {
    await exportAs('pdf');
    expect(saved.pdf).toHaveBeenCalledTimes(1);
    const pdf = new TextDecoder('latin1').decode(saved.pdf.mock.calls[0][0] as ArrayBuffer);
    expect(pdf).toContain('/VP [<</Type /Viewport');
    expect(pdf).toContain(`/GPTS [${SOUTH} ${WEST} ${NORTH} ${WEST} ${NORTH} ${EAST} ${SOUTH} ${EAST}]`);
    expect(pdf).toContain('/EPSG 4326');
  });
});
