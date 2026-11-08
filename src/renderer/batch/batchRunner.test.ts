import { describe, it, expect, vi } from 'vitest';
import { runBatch, outputPath, reportCsv, BatchIO, BatchRenderer, BatchRow, BatchData } from './batchRunner';
import { defaultBatchProfile, BatchProfile } from './batchProfile';

// KML of a square of `km` kilometers around Paris city hall
function squareKml(km = 1): string {
  const dLat = km / 2 / 111.2;
  const dLng = km / 2 / 73.1;
  const [lat, lng] = [48.8566, 2.3522];
  const ring = [[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]];
  return `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon><outerBoundaryIs><LinearRing>
    <coordinates>${ring.map(p => p.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
}

// Input tree in memory, outputs recorded
function memoryIO(files: Record<string, string>, existing: string[] = []) {
  const written = new Map<string, BatchData>();
  const io: BatchIO = {
    listKml: async () => Object.keys(files),
    readText: async path => files[path],
    exists: async path => existing.includes(path) || written.has(path),
    write: async (path, data) => { written.set(path, data); },
  };
  return { io, written };
}

function fakeRenderer(overrides: Partial<BatchRenderer> = {}) {
  const renderer: BatchRenderer = {
    fetchData: vi.fn(async () => ({ elements: [] })),
    render: vi.fn(async format => ({ data: { text: `<${format}>` }, sizeKB: 10, overLimit: false })),
    ...overrides,
  };
  return renderer;
}

const profile = (changes: Partial<BatchProfile> = {}): BatchProfile => ({ ...defaultBatchProfile(), ...changes });

async function run(files: Record<string, string>, options: Partial<Parameters<typeof runBatch>[0]> = {}) {
  const { io, written } = memoryIO(files, (options as any).existing);
  const renderer = options.renderer ?? fakeRenderer();
  const rows = await runBatch({ io, renderer, profile: profile(), sleep: async () => {}, ...options });
  return { rows, written, renderer };
}

describe('outputPath', () => {
  it('puts the output beside the place of the KML in the tree, with the extension of the format', () => {
    expect(outputPath('a/b/zone.kml', 'pdf')).toBe('a/b/zone.pdf');
    expect(outputPath('Zone.KML', 'png')).toBe('Zone.png');
    expect(outputPath('x.kml', 'jpeg')).toBe('x.jpg');
    expect(outputPath('x.y.kml', 'svg')).toBe('x.y.svg');
  });
});

describe('runBatch', () => {
  it('exports every territory in every format, mirroring the input tree', async () => {
    const { rows, written } = await run(
      { 'a.kml': squareKml(), 'sub/dir/b.kml': squareKml() },
      { profile: profile({ formats: ['pdf', 'png'] }) },
    );
    expect([...written.keys()].sort()).toEqual(['a.pdf', 'a.png', 'sub/dir/b.pdf', 'sub/dir/b.png']);
    expect(rows.map(row => row.status)).toEqual(['ok', 'ok']);
    expect(rows[0]).toMatchObject({ file: 'a.kml', zones: 1, page: 'a4', outputs: ['a.pdf', 'a.png'] });
    expect(rows[0].zoom).toBeGreaterThanOrEqual(15);
  });

  it('renders each format with the plan of the page and the SVG of the territory', async () => {
    const { renderer } = await run({ 'a.kml': squareKml() });
    const [format, svg, plan] = vi.mocked(renderer.render).mock.calls[0];
    expect(format).toBe('pdf');
    expect(svg).toContain('<svg');
    expect(plan).toMatchObject({ ok: true, format: 'a4' });
  });

  it('rejects an unreadable territory with its reason and goes on with the next', async () => {
    const { rows, written, renderer } = await run({ 'bad.kml': '<kml></kml>', 'good.kml': squareKml() });
    expect(rows[0]).toMatchObject({ file: 'bad.kml', status: 'rejected', reason: 'no-polygon', outputs: [] });
    expect(rows[0].message).toMatch(/polygone/i);
    expect(rows[1].status).toBe('ok');
    expect([...written.keys()]).toEqual(['good.pdf']);
    expect(renderer.fetchData).toHaveBeenCalledTimes(1);
  });

  it('puts a territory too large for A4 on A3, and rejects one too large for A3 without fetching its data', async () => {
    const { rows, renderer } = await run({ 'medium.kml': squareKml(3), 'huge.kml': squareKml(10) });
    const row = (file: string) => rows.find(r => r.file === file);
    expect(row('medium.kml')).toMatchObject({ status: 'ok', page: 'a3' });
    expect(row('huge.kml')).toMatchObject({ status: 'rejected', reason: 'too-large' });
    expect(renderer.fetchData).toHaveBeenCalledTimes(1);
  });

  it('skips a territory whose outputs all exist, unless asked to overwrite', async () => {
    const files = { 'a.kml': squareKml(), 'b.kml': squareKml() };
    const options = { profile: profile({ formats: ['pdf', 'png'] }), existing: ['a.pdf', 'a.png', 'b.pdf'] } as any;
    const skipped = await run(files, options);
    expect(skipped.rows.map(row => row.status)).toEqual(['skipped', 'ok']);
    expect([...skipped.written.keys()]).toEqual(['b.pdf', 'b.png']);

    const overwritten = await run(files, { ...options, overwrite: true });
    expect(overwritten.rows.map(row => row.status)).toEqual(['ok', 'ok']);
  });

  it('tries the data again once after a pause, then reports the failure and goes on', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fetchData = vi.fn()
      .mockRejectedValueOnce(new Error('Trop de requêtes.'))
      .mockRejectedValueOnce(new Error('Trop de requêtes.'))
      .mockResolvedValue({ elements: [] });
    const { rows } = await run({ 'a.kml': squareKml(), 'b.kml': squareKml() }, {
      renderer: fakeRenderer({ fetchData }), sleep, retryDelayMs: 60_000,
    });
    expect(rows[0]).toMatchObject({ status: 'error', reason: 'data-unavailable' });
    expect(rows[0].message).toContain('Trop de requêtes');
    expect(rows[1].status).toBe('ok');
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it('pauses between two downloads, to spare the Overpass servers', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    await run({ 'a.kml': squareKml(), 'b.kml': squareKml(), 'c.kml': squareKml() }, { sleep, pauseMs: 2000 });
    expect(sleep.mock.calls.filter(([ms]) => ms === 2000)).toHaveLength(2);
  });

  it('writes a file still over the size limit, with a warning', async () => {
    const render = vi.fn(async () => ({ data: { text: 'x' }, sizeKB: 900, overLimit: true }));
    const { rows, written } = await run({ 'a.kml': squareKml() }, { renderer: fakeRenderer({ render }) });
    expect(rows[0]).toMatchObject({ status: 'warning', sizesKB: [900] });
    expect(rows[0].message).toMatch(/limite/);
    expect(written.has('a.pdf')).toBe(true);
  });

  it('reports a rendering error for the territory and goes on', async () => {
    const render = vi.fn()
      .mockRejectedValueOnce(new Error('Image trop grande'))
      .mockResolvedValue({ data: { text: 'x' }, sizeKB: 1, overLimit: false });
    const { rows } = await run({ 'a.kml': squareKml(), 'b.kml': squareKml() }, { renderer: fakeRenderer({ render }) });
    expect(rows[0]).toMatchObject({ status: 'error', reason: 'export-failed', message: 'Image trop grande' });
    expect(rows[1].status).toBe('ok');
  });

  it('stops before the next territory once cancelled', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn((progress: { index: number }) => { if (progress.index === 1) controller.abort(); });
    const { rows } = await run({ 'a.kml': squareKml(), 'b.kml': squareKml(), 'c.kml': squareKml() }, {
      signal: controller.signal, onProgress,
    });
    expect(rows.map(row => row.file)).toEqual(['a.kml']);
  });

  it('tells its progress, territory by territory', async () => {
    const onProgress = vi.fn();
    await run({ 'a.kml': squareKml(), 'b.kml': '' }, { onProgress });
    const done = onProgress.mock.calls.map(([progress]) => progress).filter(progress => progress.row);
    expect(done.map(progress => [progress.index, progress.total, progress.row.file])).toEqual([[1, 2, 'a.kml'], [2, 2, 'b.kml']]);
  });

  it('goes through the territories in a stable order', async () => {
    const { rows } = await run({ 'z.kml': squareKml(), 'a/b.kml': squareKml(), 'm.kml': squareKml() });
    expect(rows.map(row => row.file)).toEqual(['a/b.kml', 'm.kml', 'z.kml']);
  });
});

describe('reportCsv', () => {
  const rows: BatchRow[] = [
    { file: 'a.kml', status: 'ok', message: '', zones: 2, page: 'a4', orientation: 'landscape', zoom: 16.25, outputs: ['a.pdf', 'a.png'], sizesKB: [120.4, 300], durationMs: 12_345 },
    { file: 'b;"c".kml', status: 'rejected', reason: 'too-many-zones', message: '7 polygones : 5 zones au maximum.', outputs: [], sizesKB: [], durationMs: 5 },
  ];

  it('writes one line per territory with French headers and statuses, for spreadsheets', () => {
    const csv = reportCsv(rows);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('fichier;statut;motif;message;zones;page;orientation;zoom;sorties;taille_ko;duree_s');
    expect(lines[1]).toBe('a.kml;ok;;;2;A4;paysage;16.25;a.pdf | a.png;120 | 300;12.3');
    expect(lines[2]).toBe('"b;""c"".kml";rejeté;too-many-zones;7 polygones : 5 zones au maximum.;;;;;;;0.0');
  });
});
