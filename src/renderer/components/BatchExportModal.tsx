/**
 * Batch export of the application: every territory KML of a folder and its subfolders,
 * exported with the current style and export options into a mirrored output folder. The
 * profile of the batch is kept, so that the command line exports the same way.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RenderStyle } from '../types';
import { ExportOptions } from '../hooks/useExport';
import { usePreference } from '../hooks/usePreferences';
import { BATCH_FORMATS, BatchFormat, BatchProfile, parseBatchProfile, serializeBatchProfile } from '../batch/batchProfile';
import { DEFAULT_PAGE_SETTINGS, PageSettings } from '../batch/pagePlan';
import { BatchProgress, BatchRenderer, BatchRow, PrepareProgress, REPORT_FILE, reportCsv, runBatch, summarizeBatch } from '../batch/batchRunner';
import { ipcBatchIO, ipcErrorMessage } from '../batch/batchIpc';
import { DataChoice, describePrepare, rendererFor } from '../batch/batchRender';
import { MAX_ZONES } from '../utils/zoneUtils';

interface BatchExportModalProps {
  style: RenderStyle;
  exportOptions: ExportOptions;
  onClose: () => void;
  /** Data and rendering of the chosen data source (tests) */
  createRenderer?: (choice: DataChoice) => BatchRenderer;
  sleep?: (ms: number) => Promise<void>;
}

const FORMAT_LABELS: Record<BatchFormat, string> = {
  pdf: 'PDF (géoréférencé)',
  png: 'PNG',
  jpeg: 'JPEG',
  svg: 'SVG',
};

type Phase = 'idle' | 'running' | 'done' | 'cancelled' | 'failed';

// Report path in the output folder, with the separator of the folder (Windows or not)
const reportPath = (output: string) => `${output.replace(/[\\/]+$/, '')}${output.includes('\\') ? '\\' : '/'}${REPORT_FILE}`;

export const BatchExportModal: React.FC<BatchExportModalProps> = ({ style, exportOptions, onClose, createRenderer, sleep }) => {
  const api = window.electronAPI.batch;
  // Folders of the last batch; a folder is chosen only once they are loaded, or loading would undo it
  const [input, setInput, inputLoading] = usePreference<string>('batchInputFolder', '');
  const [output, setOutput, outputLoading] = usePreference<string>('batchOutputFolder', '');
  // Data: Overpass through the disk cache, or a local OSM PBF extract
  const [osmFile, setOsmFile, osmFileLoading] = usePreference<string>('batchOsmFile', '');
  const [useOsmFile, setUseOsmFile] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const [reading, setReading] = useState<PrepareProgress | null>(null);
  const [formats, setFormats] = useState<BatchFormat[]>(['pdf']);
  const [page, setPage] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [overwrite, setOverwrite] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Formats and page settings of the last batch
  useEffect(() => {
    let mounted = true;
    api.loadProfile().then(text => {
      const parsed = text ? parseBatchProfile(text) : null;
      if (mounted && parsed?.ok) {
        setFormats(parsed.profile.formats);
        setPage(parsed.profile.page);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [api]);

  const profile = useMemo((): BatchProfile => {
    const { kmlAlongside: _kmlAlongside, ...options } = exportOptions;
    return { style, formats: BATCH_FORMATS.filter(format => formats.includes(format)), export: options, page };
  }, [style, exportOptions, formats, page]);

  const running = phase === 'running';
  const canLaunch = !running && input !== '' && output !== '' && formats.length > 0 && (!useOsmFile || osmFile !== '');
  const loading = inputLoading || outputLoading || osmFileLoading;

  const chooseFolder = async (title: string, set: (folder: string) => void) => {
    const folder = await api.chooseFolder(title);
    if (folder) set(folder);
  };

  const toggleFormat = (format: BatchFormat) => {
    setFormats(current => (current.includes(format) ? current.filter(f => f !== format) : [...current, format]));
  };

  const launch = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const done: BatchRow[] = [];
    setPhase('running');
    setRows([]);
    setProgress(null);
    setReading(null);
    setMessage('');
    const io = ipcBatchIO(api, input, output);
    const choice: DataChoice = { osmFile: useOsmFile ? osmFile : undefined, refresh: !useOsmFile && refresh };
    try {
      const json = serializeBatchProfile(profile);
      await api.saveProfile(json).catch(() => {});
      if (!choice.osmFile) await api.cachePurge().catch(() => 0);
      await runBatch({
        io,
        renderer: (createRenderer ?? (c => rendererFor(c, api)))(choice),
        profile,
        overwrite,
        signal: controller.signal,
        sleep,
        onPrepareProgress: setReading,
        onProgress: next => {
          setProgress(next);
          if (next.row) {
            done.push(next.row);
            setRows([...done]);
          }
        },
      });
      await io.write(REPORT_FILE, { text: reportCsv(done) });
      setPhase(controller.signal.aborted ? 'cancelled' : 'done');
    } catch (error) {
      setMessage(ipcErrorMessage(error));
      setPhase('failed');
    }
  }, [api, input, output, profile, overwrite, useOsmFile, osmFile, refresh, createRenderer, sleep]);

  const saveProfile = async () => {
    const result = await api.exportProfile(serializeBatchProfile(profile));
    if (result.success && result.path) setMessage(`Profil enregistré : ${result.path}`);
    else if (result.error) setMessage(`Erreur : ${result.error}`);
  };

  const notExported = rows.filter(row => row.status === 'rejected' || row.status === 'error' || row.status === 'warning');
  const limit = exportOptions.maxExportSizeEnabled ? `${exportOptions.maxExportSizeKB} Ko au plus par fichier` : 'pas de limite de taille';

  const folderRow = (label: string, value: string, title: string, set: (folder: string) => void) => (
    <div className="control-group">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ flex: 1, fontSize: '13px', wordBreak: 'break-all', color: value ? '#333' : '#999' }}>
          {value || 'Aucun dossier choisi'}
        </span>
        <button type="button" className="secondary" style={{ width: 'auto', marginTop: 0 }}
          disabled={running || loading}
          onClick={() => chooseFolder(title, set)} aria-label={title}>
          Choisir…
        </button>
      </div>
    </div>
  );

  const modal = (
    <div className="modal-overlay">
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="batch-title">
        <h2 id="batch-title">Export par lot</h2>
        <div className="modal-body">
          {folderRow('Dossier des KML (sous-dossiers compris)', input, 'Choisir le dossier des KML', setInput)}
          {folderRow('Dossier de sortie (même arborescence)', output, 'Choisir le dossier de sortie', setOutput)}

          <div className="control-group">
            <label>Formats</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {BATCH_FORMATS.map(format => (
                <label key={format} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                  <input type="checkbox" checked={formats.includes(format)} disabled={running}
                    onChange={() => toggleFormat(format)} />
                  {FORMAT_LABELS[format]}
                </label>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Données</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <input type="radio" name="batch-data" checked={!useOsmFile} disabled={running} onChange={() => setUseOsmFile(false)} />
              Téléchargées (Overpass, gardées 30 jours en cache)
            </label>
            {!useOsmFile && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginLeft: '22px' }}>
                <input type="checkbox" checked={refresh} disabled={running} onChange={e => setRefresh(e.target.checked)} />
                Retélécharger les données (ignorer le cache)
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <input type="radio" name="batch-data" checked={useOsmFile} disabled={running} onChange={() => setUseOsmFile(true)} />
              Fichier OSM (.osm.pbf, par exemple un extrait Geofabrik)
            </label>
            {useOsmFile && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '22px' }}>
                <span style={{ flex: 1, fontSize: '13px', wordBreak: 'break-all', color: osmFile ? '#333' : '#999' }}>
                  {osmFile || 'Aucun fichier choisi'}
                </span>
                <button type="button" className="secondary" style={{ width: 'auto', marginTop: 0 }}
                  disabled={running || loading} aria-label="Choisir le fichier OSM"
                  onClick={async () => { const file = await api.chooseOsmFile(); if (file) setOsmFile(file); }}>
                  Choisir…
                </button>
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input type="checkbox" checked={overwrite} disabled={running} onChange={e => setOverwrite(e.target.checked)} />
            Réexporter les territoires déjà exportés
          </label>

          <p style={{ fontSize: '12px', color: '#666', margin: '12px 0 0' }}>
            Page {page.formats.map(f => f.toUpperCase()).join(', ou ')} si le territoire n'y est pas lisible
            (zoom {page.minZoom} minimum), {page.dpi} dpi, {limit}. Style et options d'export : ceux de l'application.
            Une zone par polygone, {MAX_ZONES} au plus par fichier.
          </p>

          {phase !== 'idle' && (
            <div style={{ marginTop: '16px' }} aria-live="polite">
              {reading && running && !progress && (
                <>
                  <progress max={1} value={reading.fraction} style={{ width: '100%' }} />
                  <div style={{ fontSize: '13px' }}>{describePrepare(reading)}</div>
                </>
              )}
              {progress && (
                <>
                  <progress max={progress.total || 1} value={progress.index} style={{ width: '100%' }} />
                  <div style={{ fontSize: '13px' }}>
                    {progress.index} / {progress.total}{running ? ` — ${progress.file}` : ''}
                  </div>
                </>
              )}
              {rows.length > 0 && <div style={{ fontSize: '13px', marginTop: '6px' }}>{summarizeBatch(rows)}</div>}
              {phase === 'cancelled' && <div style={{ fontSize: '13px' }}>Lot interrompu. Relancez-le pour reprendre où il s'est arrêté.</div>}
              {notExported.length > 0 && (
                <ul style={{ fontSize: '12px', maxHeight: '140px', overflowY: 'auto', paddingLeft: '18px' }}>
                  {notExported.map(row => <li key={row.file}><strong>{row.file}</strong> : {row.message}</li>)}
                </ul>
              )}
              {(phase === 'done' || phase === 'cancelled') && (
                <button type="button" className="secondary" style={{ width: 'auto' }}
                  onClick={() => api.openPath(reportPath(output))}>
                  Ouvrir le rapport
                </button>
              )}
            </div>
          )}
          {message && <div style={{ fontSize: '13px', marginTop: '8px' }}>{message}</div>}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary" onClick={saveProfile} disabled={running || formats.length === 0}
            title="Profil pour la ligne de commande : carto --batch --profile">
            Enregistrer le profil…
          </button>
          {running
            ? <button type="button" className="secondary" onClick={() => abortRef.current?.abort()}>Annuler</button>
            : <button type="button" className="secondary" onClick={onClose}>Fermer</button>}
          <button type="button" onClick={launch} disabled={!canLaunch}>Lancer</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
