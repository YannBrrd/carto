/**
 * Batch export of the command line: the main process gives the job to a hidden window,
 * which runs the batch, logs each territory and gives the exit code (0 all exported,
 * 1 a rejection or an error, 2 the batch could not run).
 */

import { BatchProfile, defaultBatchProfile, parseBatchProfile, BatchFormat } from './batchProfile';
import { BatchRenderer, BatchRow, REPORT_FILE, reportCsv, runBatch, summarizeBatch } from './batchRunner';
import { BatchApi, ipcBatchIO, ipcErrorMessage } from './batchIpc';
import { CacheApi, describePrepare, OsmFileApi, rendererFor } from './batchRender';

export interface CliJob {
  input: string;
  output: string;
  /** Profile file, or the last profile of the application; null: the defaults */
  profileText: string | null;
  formats?: BatchFormat[];
  overwrite: boolean;
  /** Download again instead of using the cache */
  refresh: boolean;
  /** OSM PBF extract to read the data from, instead of Overpass */
  osmFile?: string;
}

export interface CliBatchApi extends BatchApi, CacheApi, OsmFileApi {
  cachePurge(): Promise<number>;
  cliJob(): Promise<CliJob | null>;
  cliLog(line: string, isError?: boolean): void;
  cliDone(code: number): void;
}

const STATUS_WORDS: Record<BatchRow['status'], string> = {
  ok: 'ok', warning: 'avertissement', skipped: 'ignoré', rejected: 'rejeté', error: 'erreur',
};

function rowLine(index: number, total: number, row: BatchRow): string {
  const details = row.status === 'ok' || row.status === 'warning'
    ? `${row.page?.toUpperCase()} ${row.orientation === 'landscape' ? 'paysage' : 'portrait'}, zoom ${row.zoom?.toFixed(1)}`
    : '';
  const message = [details, row.message].filter(Boolean).join(' - ');
  return `[${index}/${total}] ${row.file} : ${STATUS_WORDS[row.status]}${message ? ` - ${message}` : ''}`;
}

/** Data of the job: its OSM file, else Overpass through the disk cache */
export function rendererForJob(job: CliJob, api: CliBatchApi): BatchRenderer {
  return rendererFor({ osmFile: job.osmFile, refresh: job.refresh }, api);
}

export async function runCliBatch(
  api: CliBatchApi,
  options: { renderer?: BatchRenderer; sleep?: (ms: number) => Promise<void> } = {}
): Promise<void> {
  const fail = (message: string) => {
    api.cliLog(`Erreur : ${message}`, true);
    api.cliDone(2);
  };

  const job = await api.cliJob();
  if (!job) return fail('aucun lot à exporter.');

  let profile: BatchProfile = defaultBatchProfile();
  if (job.profileText !== null) {
    const parsed = parseBatchProfile(job.profileText);
    if (!parsed.ok) return fail(parsed.message);
    profile = parsed.profile;
  }
  if (job.formats) profile = { ...profile, formats: job.formats };

  const io = ipcBatchIO(api, job.input, job.output);
  // Reading of the OSM file, logged every 10 % of each phase
  const logged = new Map<string, number>();
  const onPrepareProgress = (progress: { phase: string; fraction: number }) => {
    const tenth = Math.floor(progress.fraction * 10);
    if ((logged.get(progress.phase) ?? -1) >= tenth) return;
    logged.set(progress.phase, tenth);
    api.cliLog(describePrepare(progress));
  };
  try {
    api.cliLog(`Export par lot : ${job.input} -> ${job.output} (${profile.formats.join(', ')})`);
    api.cliLog(job.osmFile ? `Données : ${job.osmFile}` : `Données : Overpass${job.refresh ? ' (retéléchargées)' : ', cache de 30 jours'}`);
    if (!job.osmFile) await api.cachePurge().catch(() => 0);
    const rows = await runBatch({
      io,
      renderer: options.renderer ?? rendererForJob(job, api),
      onPrepareProgress,
      profile,
      overwrite: job.overwrite,
      sleep: options.sleep,
      onProgress: ({ index, total, row }) => { if (row) api.cliLog(rowLine(index, total, row), row.status === 'error'); },
    });
    await io.write(REPORT_FILE, { text: reportCsv(rows) });
    api.cliLog(`Terminé : ${summarizeBatch(rows)}. Rapport : ${REPORT_FILE}`);
    api.cliDone(rows.some(row => row.status === 'rejected' || row.status === 'error') ? 1 : 0);
  } catch (error) {
    fail(ipcErrorMessage(error));
  }
}
