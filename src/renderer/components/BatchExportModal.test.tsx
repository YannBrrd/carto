import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BatchExportModal } from './BatchExportModal';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { ExportOptions } from '../hooks/useExport';
import { BatchRenderer } from '../batch/batchRunner';
import { defaultBatchProfile, serializeBatchProfile } from '../batch/batchProfile';
import { DataChoice, describePrepare } from '../batch/batchRender';

const KML = `<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon><outerBoundaryIs><LinearRing>
  <coordinates>2.350,48.855 2.356,48.855 2.356,48.858 2.350,48.858 2.350,48.855</coordinates>
</LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;

const exportOptions: ExportOptions = {
  forceAllLabels: true,
  borderColor: '#123456',
  exteriorOverlay: true,
  exteriorOverlayOpacity: 0.4,
  showPOI: false,
  showCompass: true,
  maxExportSizeEnabled: true,
  maxExportSizeKB: 800,
  minQualityPercent: 30,
  kmlAlongside: true,
};

function fakeBatchApi(files: Record<string, string> = { 'a.kml': KML, 'b.kml': '<kml/>' }) {
  const written = new Map<string, unknown>();
  const api = {
    listKml: vi.fn(async () => Object.keys(files)),
    readKml: vi.fn(async (_root: string, path: string) => files[path]),
    outputExists: vi.fn(async (_root: string, path: string) => written.has(path)),
    writeOutput: vi.fn(async (_root: string, path: string, data: unknown) => { written.set(path, data); }),
    chooseFolder: vi.fn(async (title: string) => (title.includes('KML') ? '/data/kml' : '/data/out')),
    loadProfile: vi.fn(async (): Promise<string | null> => null),
    saveProfile: vi.fn(async (_json: string) => {}),
    exportProfile: vi.fn(async (_json: string) => ({ success: true, path: '/data/profil-lot.json' })),
    openPath: vi.fn(async () => ''),
    chooseOsmFile: vi.fn(async (): Promise<string | null> => '/data/idf.osm.pbf'),
    cacheGet: vi.fn(async () => null),
    cachePut: vi.fn(async () => {}),
    cachePurge: vi.fn(async () => 0),
    osmOpen: vi.fn(async () => ({ nodes: 0, ways: 0, relations: 0 })),
    osmQuery: vi.fn(async () => ({ elements: [] })),
    osmClose: vi.fn(async () => {}),
    onOsmProgress: vi.fn(() => () => {}),
    cliJob: vi.fn(),
    cliLog: vi.fn(),
    cliDone: vi.fn(),
  };
  return { api, written };
}

const renderer: BatchRenderer = {
  fetchData: async () => ({ data: { elements: [] }, source: 'network' as const }),
  render: async () => ({ data: { text: 'x' }, sizeKB: 12, overLimit: false }),
};

let batch: ReturnType<typeof fakeBatchApi>;
const onClose = vi.fn();

beforeEach(() => {
  batch = fakeBatchApi();
  onClose.mockReset();
  createRenderer.mockReset().mockImplementation(() => renderer);
  (window as any).electronAPI = {
    batch: batch.api,
    getPreference: async () => null,
    setPreference: async () => ({ success: true }),
  };
});
afterEach(() => cleanup());

const createRenderer = vi.fn((_choice: DataChoice) => renderer);

function open(props: Partial<Parameters<typeof BatchExportModal>[0]> & { renderer?: BatchRenderer } = {}) {
  const { renderer: chosen, ...rest } = props;
  if (chosen) createRenderer.mockImplementation(() => chosen);
  return render(
    <BatchExportModal
      style={MAPS_STYLE}
      exportOptions={exportOptions}
      onClose={onClose}
      createRenderer={createRenderer}
      sleep={async () => {}}
      {...rest}
    />,
  );
}

const launch = () => screen.getByRole('button', { name: 'Lancer' });

async function chooseFolders() {
  // The folders of the last batch load first
  await waitFor(() => expect(screen.getByRole('button', { name: /Choisir le dossier des KML/ }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Choisir le dossier des KML/ }));
  await screen.findByText('/data/kml');
  fireEvent.click(screen.getByRole('button', { name: /Choisir le dossier de sortie/ }));
  await screen.findByText('/data/out');
}

describe('BatchExportModal', () => {
  it('launches only once both folders and a format are chosen', async () => {
    open();
    expect(launch().hasAttribute('disabled')).toBe(true);
    await chooseFolders();
    expect(launch().hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByLabelText(/PDF/));
    expect(launch().hasAttribute('disabled')).toBe(true);
  });

  it('exports the batch with the style and export options of the application, and reports it', async () => {
    open();
    await chooseFolders();
    fireEvent.click(screen.getByLabelText('PNG'));
    fireEvent.click(launch());

    await screen.findByText(/1 exporté, 0 ignoré, 1 rejeté, 0 erreur/);
    expect(batch.api.listKml).toHaveBeenCalledWith('/data/kml');
    expect([...batch.written.keys()].sort()).toEqual(['a.pdf', 'a.png', 'rapport.csv']);
    expect(batch.api.writeOutput).toHaveBeenCalledWith('/data/out', 'rapport.csv', expect.anything());

    // The profile of the batch is kept for the command line
    const saved = JSON.parse(batch.api.saveProfile.mock.calls[0][0]);
    expect(saved.formats).toEqual(['pdf', 'png']);
    expect(saved.style.backgroundColor).toBe(MAPS_STYLE.backgroundColor);
    expect(saved.export).toMatchObject({ borderColor: '#123456', maxExportSizeKB: 800, minQualityPercent: 30, showPOI: false });
    expect(saved.export).not.toHaveProperty('kmlAlongside');
  });

  it('opens the report once the batch is done', async () => {
    open();
    await chooseFolders();
    fireEvent.click(launch());
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le rapport' }));
    expect(batch.api.openPath).toHaveBeenCalledWith(expect.stringMatching(/out[\\/]rapport\.csv$/));
  });

  it('lists the territories that were not exported, with their reason', async () => {
    open();
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByText(/b\.kml/);
    expect(screen.getByText(/Aucun polygone/)).toBeTruthy();
  });

  it('stops after the current territory when cancelled, and still writes the report', async () => {
    let release: () => void = () => {};
    const slow: BatchRenderer = {
      ...renderer,
      fetchData: () => new Promise(resolve => { release = () => resolve(({ data: { elements: [] }, source: 'network' as const })); }),
    };
    batch = fakeBatchApi({ 'a.kml': KML, 'b.kml': KML });
    (window as any).electronAPI.batch = batch.api;
    open({ renderer: slow });
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByText(/1 \/ 2|0 \/ 2/);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    release();
    await screen.findByText(/Lot interrompu/);
    expect([...batch.written.keys()].sort()).toEqual(['a.pdf', 'rapport.csv']);
  });

  it('cannot be closed while the batch runs', async () => {
    let release: () => void = () => {};
    open({ renderer: { ...renderer, fetchData: () => new Promise(resolve => { release = () => resolve(({ data: { elements: [] }, source: 'network' as const })); }) } });
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByRole('button', { name: 'Annuler' });
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
    release();
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('takes the formats of the last batch', async () => {
    batch.api.loadProfile.mockResolvedValue(serializeBatchProfile({ ...defaultBatchProfile(), formats: ['jpeg', 'svg'] }));
    open();
    await waitFor(() => expect((screen.getByLabelText('JPEG') as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('SVG') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/PDF/) as HTMLInputElement).checked).toBe(false);
  });

  it('saves the profile for the command line where the user chooses', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le profil/ }));
    await screen.findByText(/profil-lot\.json/);
    expect(JSON.parse(batch.api.exportProfile.mock.calls[0][0]).formats).toEqual(['pdf']);
  });

  it('tells the page rules and the size limit', () => {
    open();
    expect(screen.getByText(/A4, ou A3/)).toBeTruthy();
    expect(screen.getByText(/800 Ko/)).toBeTruthy();
  });

  it('downloads through the disk cache, after removing its expired entries', async () => {
    open();
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByText(/1 exporté/);
    expect(createRenderer).toHaveBeenCalledWith({ osmFile: undefined, refresh: false });
    expect(batch.api.cachePurge).toHaveBeenCalled();
  });

  it('downloads the data again when asked', async () => {
    open();
    await chooseFolders();
    fireEvent.click(screen.getByLabelText(/Retélécharger les données/));
    fireEvent.click(launch());
    await screen.findByText(/1 exporté/);
    expect(createRenderer).toHaveBeenCalledWith({ osmFile: undefined, refresh: true });
  });

  it('reads the data from the chosen OSM file, once it is chosen', async () => {
    open();
    await chooseFolders();
    fireEvent.click(screen.getByLabelText(/Fichier OSM/));
    expect(launch().hasAttribute('disabled')).toBe(true);
    expect(screen.queryByLabelText(/Retélécharger les données/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Choisir le fichier OSM/ }));
    await screen.findByText('/data/idf.osm.pbf');
    fireEvent.click(launch());
    await screen.findByText(/1 exporté/);
    expect(createRenderer).toHaveBeenCalledWith({ osmFile: '/data/idf.osm.pbf', refresh: false });
    expect(batch.api.cachePurge).not.toHaveBeenCalled();
  });

  it('shows the reading of the OSM file', async () => {
    let release: () => void = () => {};
    const reading: BatchRenderer = {
      ...renderer,
      offline: true,
      prepare: (_boxes, onProgress) => new Promise(resolve => {
        onProgress({ phase: 'nodes', fraction: 0.5 });
        release = () => resolve();
      }),
    };
    open({ renderer: reading });
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByText(describePrepare({ phase: 'nodes', fraction: 0.5 }));
    release();
    await screen.findByText(/1 exporté/);
  });

  it('tells why the batch could not run', async () => {
    open({ renderer: { ...renderer, offline: true, prepare: async () => { throw new Error("Ce fichier n'est pas un fichier OSM PBF (.osm.pbf)."); } } });
    await chooseFolders();
    fireEvent.click(launch());
    await screen.findByText(/pas un fichier OSM PBF/);
  });
});
