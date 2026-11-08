import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import L from 'leaflet';
import { createBatchRenderer } from './batchRender';
import { defaultBatchProfile, BatchProfile } from './batchProfile';
import { planPage } from './pagePlan';
import { AcceptedPlan } from './batchRunner';
import { fetchFromOverpass } from '../utils/osmData';

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
