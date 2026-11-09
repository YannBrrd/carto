/**
 * Batch export of the command line: the main process gives the job to a hidden window,
 * which runs the batch, logs each territory and gives the exit code (0 all exported,
 * 1 a rejection or an error, 2 the batch could not run).
 */

import { BatchProfile, defaultBatchProfile, parseBatchProfile, BatchFormat } from './batchProfile';
import { BatchRenderer, BatchRow, REPORT_FILE, reportCsv, runBatch, summarizeBatch } from './batchRunner';
import { BatchApi, ipcBatchIO, ipcErrorMessage } from './batchIpc';
import { createBatchRenderer } from './batchRender';

export interface CliJob {
  input: string;
  output: string;
  /** Profile file, or the last profile of the application; null: the defaults */
  profileText: string | null;
  formats?: BatchFormat[];
  overwrite: boolean;
}

export interface CliBatchApi extends BatchApi {
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
  try {
    api.cliLog(`Export par lot : ${job.input} -> ${job.output} (${profile.formats.join(', ')})`);
    const rows = await runBatch({
      io,
      renderer: options.renderer ?? createBatchRenderer(),
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
