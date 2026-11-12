import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import L from 'leaflet';
import { createBatchRenderer, createOsmFileRenderer, OsmFileApi } from './batchRender';
import { defaultBatchProfile, BatchProfile } from './batchProfile';
import { planPage } from './pagePlan';
import { AcceptedPlan } from './batchRunner';
import { fetchFromOverpass, OSM_FILTER } from '../utils/osmData';

vi.mock('../utils/osmData', async original => ({
  ...(await original<typeof import('../utils/osmData')>()),
  fetchFromOverpass: vi.fn(async () => ({ elements: [] })),
}));

const bounds = L.latLngBounds([48.852, 2.345], [48.861, 2.359]);
const plan = planPage(bounds) as AcceptedPlan;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.frame.width}" height="${plan.frame.height}"></svg>`;

const profile = (exportChanges: Partial<BatchProfile['export']> = {}): BatchProfile => {
  const p = defaultBatchProfile();
  return { ...p, export: { ...p.export, ...exportChanges } };
};

// Size of the canvases drawn during a test (they are emptied once encoded)
let canvases: { width: number; height: number }[] = [];
const seen = new WeakSet<HTMLCanvasElement>();

// 2 x 2 white JPEG: jsPDF reads the JPEG it embeds
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

beforeEach(() => {
  canvases = [];
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
  });
  URL.createObjectURL = () => 'blob:svg';
  URL.revokeObjectURL = () => {};
  (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
    if (!seen.has(this) && this.width > 0) {
      seen.add(this);
      canvases.push({ width: this.width, height: this.height });
    }
    return new Proxy({}, { get: () => () => {} });
  };
  // PNG payload of 1 byte per 100 pixels
  (HTMLCanvasElement.prototype as any).toDataURL = function (this: HTMLCanvasElement, type: string) {
    if (type === 'image/jpeg') return JPEG;
    return `data:${type};base64,${'A'.repeat(Math.ceil((this.width * this.height) / 75))}`;
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('createBatchRenderer', () => {
  it('downloads the data of exactly the bounds of the territory', async () => {
    await createBatchRenderer().fetchData(bounds);
    const query = vi.mocked(fetchFromOverpass).mock.calls[0][0];
    expect(query).toContain('48.852,2.345,48.861,2.359');
    // Pages cover large territories: the server gets more time, and the client waits longer
    expect(query).toContain('[timeout:90]');
    expect(vi.mocked(fetchFromOverpass).mock.calls[0][1]).toMatchObject({ timeoutMs: 100_000 });
  });

  it('writes the SVG as text', async () => {
    const encoded = await createBatchRenderer().render('svg', svg, plan, profile({ maxExportSizeEnabled: false }));
    expect(encoded.data).toEqual({ text: svg });
    expect(encoded.overLimit).toBe(false);
  });

  it('marks an SVG over the size limit, which it cannot reduce', async () => {
    const big = svg + ' '.repeat(5 * 1024);
    const encoded = await createBatchRenderer().render('svg', big, plan, profile({ maxExportSizeEnabled: true, maxExportSizeKB: 1 }));
    expect(encoded.overLimit).toBe(true);
  });

  it('draws the images at the size of the page', async () => {
    for (const format of ['png', 'jpeg', 'pdf'] as const) {
      canvases = [];
      await createBatchRenderer().render(format, svg, plan, profile({ maxExportSizeEnabled: false }));
      expect(canvases[0].width).toBeCloseTo(plan.imageWidth, -1);
      expect(canvases[0].height).toBeCloseTo(plan.imageHeight, -1);
    }
  });

  it('encodes each format as its kind of file', async () => {
    const renderer = createBatchRenderer();
    const p = profile({ maxExportSizeEnabled: false });
    expect((await renderer.render('png', svg, plan, p)).data).toMatchObject({ dataUrl: expect.stringMatching(/^data:image\/png;base64,/) });
    expect((await renderer.render('jpeg', svg, plan, p)).data).toMatchObject({ dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/) });
    const pdf = (await renderer.render('pdf', svg, plan, p)).data as { bytes: ArrayBuffer };
    expect(new TextDecoder('latin1').decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('lays the PDF on the page format of the plan', async () => {
    const a3 = planPage(bounds, { ...defaultBatchProfile().page, formats: ['a3'] }) as AcceptedPlan;
    const pdf = (await createBatchRenderer().render('pdf', svg, a3, profile({ maxExportSizeEnabled: false }))).data as { bytes: ArrayBuffer };
    const box = new TextDecoder('latin1').decode(pdf.bytes).match(/\/MediaBox \[([^\]]+)\]/)![1].trim().split(/\s+/).map(Number);
    const [width, height] = [box[2], box[3]].sort((a, b) => a - b);
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(1190.55, 1);
  });

  it('keeps every raster format under the size limit when it can', async () => {
    const renderer = createBatchRenderer();
    // Full page: about 3.3 MB at 1 byte per 100 pixels... in this stub, ~ 100 KB
    const p = profile({ maxExportSizeEnabled: true, maxExportSizeKB: 40, minQualityPercent: 10 });
    const png = await renderer.render('png', svg, plan, p);
    expect(png.overLimit).toBe(false);
    expect(png.sizeKB).toBeLessThanOrEqual(40);
  });
});

describe('data of the batch renderer', () => {
  const overpass = { elements: [{ type: 'node', id: 1, lat: 48.855, lon: 2.35 }] };
  const cached = { elements: [{ type: 'node', id: 2, lat: 48.856, lon: 2.351 }] };

  function fakeCache(entries: Record<string, string> = {}) {
    return {
      entries,
      cacheGet: vi.fn(async (query: string) => entries[query] ?? null),
      cachePut: vi.fn(async (query: string, text: string) => { entries[query] = text; }),
    };
  }

  beforeEach(() => {
    vi.mocked(fetchFromOverpass).mockReset().mockResolvedValue(overpass);
  });

  it('downloads without a cache', async () => {
    expect(await createBatchRenderer().fetchData(bounds)).toEqual({ data: overpass, source: 'network' });
  });

  it('downloads what the cache does not have, and keeps it', async () => {
    const cache = fakeCache();
    const fetched = await createBatchRenderer({ cache }).fetchData(bounds);
    expect(fetched).toEqual({ data: overpass, source: 'network' });
    const [query] = vi.mocked(fetchFromOverpass).mock.calls[0];
    expect(cache.cachePut).toHaveBeenCalledWith(query, JSON.stringify(overpass));
  });

  it('answers from the cache without downloading', async () => {
    const first = fakeCache();
    await createBatchRenderer({ cache: first }).fetchData(bounds);
    const query = Object.keys(first.entries)[0];
    vi.mocked(fetchFromOverpass).mockClear();

    const cache = fakeCache({ [query]: JSON.stringify(cached) });
    expect(await createBatchRenderer({ cache }).fetchData(bounds)).toEqual({ data: cached, source: 'cache' });
    expect(fetchFromOverpass).not.toHaveBeenCalled();
  });

  it('downloads again when asked to refresh, replacing the cached answer', async () => {
    const probe = fakeCache();
    await createBatchRenderer({ cache: probe }).fetchData(bounds);
    const query = Object.keys(probe.entries)[0];
    const cache = fakeCache({ [query]: JSON.stringify(cached) });
    expect(await createBatchRenderer({ cache, refresh: true }).fetchData(bounds)).toEqual({ data: overpass, source: 'network' });
    expect(cache.cacheGet).not.toHaveBeenCalled();
    expect(cache.entries[query]).toBe(JSON.stringify(overpass));
  });

  it('downloads when the cache cannot be read, and exports even when it cannot be written', async () => {
    const cache = { cacheGet: vi.fn(async () => { throw new Error('EACCES'); }), cachePut: vi.fn(async () => { throw new Error('ENOSPC'); }) };
    expect(await createBatchRenderer({ cache }).fetchData(bounds)).toEqual({ data: overpass, source: 'network' });
  });

  it('downloads again an unreadable cached answer', async () => {
    const probe = fakeCache();
    await createBatchRenderer({ cache: probe }).fetchData(bounds);
    const query = Object.keys(probe.entries)[0];
    const cache = fakeCache({ [query]: '{ truncated' });
    expect((await createBatchRenderer({ cache }).fetchData(bounds)).source).toBe('network');
  });
});

describe('createOsmFileRenderer', () => {
  function fakeOsmApi() {
    let listener: ((progress: { phase: string; fraction: number }) => void) | null = null;
    const api: OsmFileApi & { unsubscribed: boolean } = {
      unsubscribed: false,
      osmOpen: vi.fn(async () => {
        listener?.({ phase: 'nodes', fraction: 0.25 });
        return { nodes: 10, ways: 2, relations: 0 };
      }),
      osmQuery: vi.fn(async () => ({ elements: [{ type: 'node', id: 9, lat: 48.85, lon: 2.35 }] })),
      osmClose: vi.fn(async () => {}),
      onOsmProgress: vi.fn(callback => { listener = callback; return () => { listener = null; api.unsubscribed = true; }; }),
    };
    return api;
  }

  it('reads the file once for the bounds of the batch, with the tag filter of the Overpass query', async () => {
    const api = fakeOsmApi();
    const renderer = createOsmFileRenderer(api, '/data/idf.osm.pbf');
    const boxes = [{ south: 48.85, west: 2.35, north: 48.86, east: 2.36 }];
    const progress = vi.fn();
    await renderer.prepare!(boxes, progress);
    expect(api.osmOpen).toHaveBeenCalledWith('/data/idf.osm.pbf', boxes, OSM_FILTER);
    expect(progress).toHaveBeenCalledWith({ phase: 'nodes', fraction: 0.25 });
    expect(api.unsubscribed).toBe(true);
    expect(renderer.offline).toBe(true);
  });

  it('gives each territory the data of its bounds, from the file', async () => {
    const api = fakeOsmApi();
    const renderer = createOsmFileRenderer(api, '/data/idf.osm.pbf');
    await renderer.prepare!([], () => {});
    const fetched = await renderer.fetchData(bounds);
    expect(api.osmQuery).toHaveBeenCalledWith({ south: 48.852, west: 2.345, north: 48.861, east: 2.359 });
    expect(fetched).toEqual({ data: { elements: [{ type: 'node', id: 9, lat: 48.85, lon: 2.35 }] }, source: 'file' });
    await renderer.close!();
    expect(api.osmClose).toHaveBeenCalled();
  });
});
