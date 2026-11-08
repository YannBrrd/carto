import { describe, it, expect, vi } from 'vitest';
import { runCliBatch, CliBatchApi } from './cliBatch';
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
    cliJob: async () => ({ input: '/in', output: '/out', profileText: null, overwrite: false, ...job }),
    cliLog: (line: string) => { logs.push(line); },
    cliDone: done,
  };
  return { api, written, logs, done };
}

const renderer: BatchRenderer = {
  fetchData: async () => ({ elements: [] }),
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
