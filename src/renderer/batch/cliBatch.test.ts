import { describe, it, expect, vi } from 'vitest';
import { runCliBatch, rendererForJob, CliBatchApi } from './cliBatch';
import { describePrepare } from './batchRender';
import { fetchFromOverpass } from '../utils/osmData';

vi.mock('../utils/osmData', async original => ({
  ...(await original<typeof import('../utils/osmData')>()),
  fetchFromOverpass: vi.fn(async () => ({ elements: [] })),
}));
import { ipcBatchIO, BatchApi } from './batchIpc';
import { BatchRenderer } from './batchRunner';
import { defaultBatchProfile, serializeBatchProfile } from './batchProfile';

const KML = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon><outerBoundaryIs><LinearRing>
  <coordinates>2.350,48.855 2.356,48.855 2.356,48.858 2.350,48.858 2.350,48.855</coordinates>
</LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;

function fakeApi(job: Partial<NonNullable<Awaited<ReturnType<CliBatchApi['cliJob']>>>> = {}, files: Record<string, string> = { 'a.kml': KML, 'b.kml': '<kml/>' }) {
  const written = new Map<string, unknown>();
  const logs: string[] = [];
  const done = vi.fn();
  const api: CliBatchApi = {
    listKml: async () => Object.keys(files),
    readKml: async (_root, path) => files[path],
    outputExists: async (_root, path) => written.has(path),
    writeOutput: async (_root, path, data) => { written.set(path, data); },
    cliJob: async () => ({ input: '/in', output: '/out', profileText: null, overwrite: false, refresh: false, ...job }),
    cacheGet: vi.fn(async () => null),
    cachePut: vi.fn(async () => {}),
    cachePurge: vi.fn(async () => 0),
    osmOpen: vi.fn(async () => ({ nodes: 0, ways: 0, relations: 0 })),
    osmQuery: vi.fn(async () => ({ elements: [] })),
    osmClose: vi.fn(async () => {}),
    onOsmProgress: vi.fn(() => () => {}),
    cliLog: (line: string) => { logs.push(line); },
    cliDone: done,
  };
  return { api, written, logs, done };
}

const renderer: BatchRenderer = {
  fetchData: async () => ({ data: { elements: [] }, source: 'network' as const }),
  render: async () => ({ data: { text: 'x' }, sizeKB: 12, overLimit: false }),
};

const run = (api: CliBatchApi) => runCliBatch(api, { renderer, sleep: async () => {} });

describe('runCliBatch', () => {
  it('exports the batch, logs each territory and writes the report in the output folder', async () => {
    const { api, written, logs, done } = fakeApi();
    await run(api);
    expect(written.has('a.pdf')).toBe(true);
    expect(written.get('rapport.csv')).toMatchObject({ text: expect.stringContaining('fichier;statut') });
    expect(logs.some(line => line.includes('[1/2] a.kml') && line.includes('ok'))).toBe(true);
    expect(logs.some(line => line.includes('[2/2] b.kml') && line.includes('rejeté'))).toBe(true);
    expect(logs.at(-1)).toMatch(/1 exporté.*1 rejeté/);
    // A rejection gives exit code 1
    expect(done).toHaveBeenCalledWith(1);
  });

  it('ends with code 0 when every territory is exported', async () => {
    const { api, done } = fakeApi({}, { 'a.kml': KML });
    await run(api);
    expect(done).toHaveBeenCalledWith(0);
  });

  it('uses the profile and the formats of the command line', async () => {
    const profile = { ...defaultBatchProfile(), formats: ['svg' as const] };
    const { api, written } = fakeApi({ profileText: serializeBatchProfile(profile) }, { 'a.kml': KML });
    await run(api);
    expect(written.has('a.svg')).toBe(true);

    const withFormats = fakeApi({ profileText: serializeBatchProfile(profile), formats: ['png', 'jpeg'] }, { 'a.kml': KML });
    await run(withFormats.api);
    expect([...withFormats.written.keys()].sort()).toEqual(['a.jpg', 'a.png', 'rapport.csv']);
  });

  it('stops with code 2 on a profile it refuses, exporting nothing', async () => {
    const { api, written, logs, done } = fakeApi({ profileText: '{ "formats": ["gif"] }' });
    await run(api);
    expect(written.size).toBe(0);
    expect(logs.join('\n')).toContain('gif');
    expect(done).toHaveBeenCalledWith(2);
  });

  it('stops with code 2 when the input folder cannot be read', async () => {
    const { api, done, logs } = fakeApi();
    api.listKml = async () => { throw new Error("Error invoking remote method 'batch-list-kml': Error: ENOENT: no such file or directory"); };
    await run(api);
    expect(done).toHaveBeenCalledWith(2);
    expect(logs.join('\n')).toContain('ENOENT');
  });

  it('does nothing without a job', async () => {
    const { api, done } = fakeApi();
    api.cliJob = async () => null;
    await run(api);
    expect(done).toHaveBeenCalledWith(2);
  });
});

describe('ipcBatchIO', () => {
  it('reads from the input folder and writes into the output folder', async () => {
    const calls: unknown[][] = [];
    const api = {
      listKml: async (root: string) => { calls.push(['list', root]); return ['a.kml']; },
      readKml: async (root: string, path: string) => { calls.push(['read', root, path]); return KML; },
      outputExists: async (root: string, path: string) => { calls.push(['exists', root, path]); return false; },
      writeOutput: async (root: string, path: string) => { calls.push(['write', root, path]); },
    } as unknown as BatchApi;
    const io = ipcBatchIO(api, '/in', '/out');
    await io.listKml();
    await io.readText('a.kml');
    await io.exists('a.pdf');
    await io.write('a.pdf', { text: 'x' });
    expect(calls).toEqual([['list', '/in'], ['read', '/in', 'a.kml'], ['exists', '/out', 'a.pdf'], ['write', '/out', 'a.pdf']]);
  });

  it('gives the message of a main process error without the IPC wrapping', async () => {
    const api = {
      writeOutput: async () => { throw new Error("Error invoking remote method 'batch-write-output': Error: Espace disque insuffisant."); },
    } as unknown as BatchApi;
    await expect(ipcBatchIO(api, '/in', '/out').write('a.pdf', { text: 'x' })).rejects.toThrow(/^Espace disque insuffisant\.$/);
  });
});

describe('rendererForJob', () => {
  const bounds = { getSouth: () => 48.85, getWest: () => 2.35, getNorth: () => 48.86, getEast: () => 2.36 } as any;

  it('reads the data from the OSM file of the job', async () => {
    const { api } = fakeApi({ osmFile: '/data/idf.osm.pbf' });
    const renderer = rendererForJob(await api.cliJob() as any, api);
    expect(renderer.offline).toBe(true);
    await renderer.prepare!([], () => {});
    expect(api.osmOpen).toHaveBeenCalledWith('/data/idf.osm.pbf', [], expect.anything());
  });

  it('downloads through the disk cache otherwise', async () => {
    const { api } = fakeApi();
    vi.mocked(api.cacheGet).mockResolvedValue(JSON.stringify({ elements: [] }));
    const renderer = rendererForJob(await api.cliJob() as any, api);
    expect(await renderer.fetchData(bounds)).toMatchObject({ source: 'cache' });
  });

  it('skips the cache when the job asks to refresh', async () => {
    const { api } = fakeApi({ refresh: true });
    vi.mocked(fetchFromOverpass).mockClear();
    const renderer = rendererForJob(await api.cliJob() as any, api);
    expect(await renderer.fetchData(bounds)).toMatchObject({ source: 'network' });
    expect(api.cacheGet).not.toHaveBeenCalled();
    expect(fetchFromOverpass).toHaveBeenCalled();
  });
});

describe('runCliBatch data', () => {
  it('removes the expired cache entries before downloading', async () => {
    const { api } = fakeApi({}, { 'a.kml': KML });
    await run(api);
    expect(api.cachePurge).toHaveBeenCalled();
  });

  it('logs the reading of an OSM file every 10 %, and does not touch the cache', async () => {
    const { api, logs } = fakeApi({ osmFile: '/data/idf.osm.pbf' }, { 'a.kml': KML });
    const reading: BatchRenderer = {
      ...renderer,
      offline: true,
      prepare: async (_boxes, onProgress) => {
        for (const fraction of [0, 0.03, 0.1, 0.15, 0.5, 1]) onProgress({ phase: 'nodes', fraction });
      },
    };
    await runCliBatch(api, { renderer: reading, sleep: async () => {} });
    expect(logs.filter(line => line.startsWith('Lecture'))).toEqual([
      describePrepare({ phase: 'nodes', fraction: 0 }),
      describePrepare({ phase: 'nodes', fraction: 0.1 }),
      describePrepare({ phase: 'nodes', fraction: 0.5 }),
      describePrepare({ phase: 'nodes', fraction: 1 }),
    ]);
    expect(api.cachePurge).not.toHaveBeenCalled();
  });

  it('stops with code 2 when the OSM file cannot be read', async () => {
    const { api, done, logs } = fakeApi({ osmFile: '/data/carte.osm' }, { 'a.kml': KML });
    const failing: BatchRenderer = { ...renderer, offline: true, prepare: async () => { throw new Error("Ce fichier n'est pas un fichier OSM PBF (.osm.pbf)."); } };
    await runCliBatch(api, { renderer: failing, sleep: async () => {} });
    expect(done).toHaveBeenCalledWith(2);
    expect(logs.join('\n')).toContain('PBF');
  });
});

describe('describePrepare', () => {
  it('tells the phase and the percentage in French', () => {
    expect(describePrepare({ phase: 'nodes', fraction: 0.456 })).toBe('Lecture du fichier OSM (2/4, nœuds) : 46 %');
    expect(describePrepare({ phase: 'relations', fraction: 1 })).toBe('Lecture du fichier OSM (1/4, relations) : 100 %');
    expect(describePrepare({ phase: 'ways', fraction: 0 })).toBe('Lecture du fichier OSM (3/4, voies) : 0 %');
    expect(describePrepare({ phase: 'missing-nodes', fraction: 0.5 })).toBe('Lecture du fichier OSM (4/4, nœuds hors des territoires) : 50 %');
  });
});
