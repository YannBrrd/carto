/**
 * Batch export: every territory KML of a tree is exported in every format of the profile,
 * into a mirrored tree. A territory that fails is reported, with its reason, and the batch
 * goes on. Files, data and rendering come from the caller, so that the application, the
 * command line and the tests run the same batch.
 */

import { generateSVG, projectionAtZoom } from '../utils/svgGenerator';
import { readTerritoryKml } from '../utils/kmlReader';
import { calculateContextBounds } from '../utils/zoneUtils';
import { Encoded } from '../utils/rasterExport';
import { BatchFormat, BatchProfile } from './batchProfile';
import { planPage, PagePlan } from './pagePlan';
import L from 'leaflet';

/** Content of an output file */
export type BatchData = { text: string } | { dataUrl: string } | { bytes: ArrayBuffer };

/** Files of the batch, by path relative to the input or output folder, with '/' separators */
export interface BatchIO {
  listKml(): Promise<string[]>;
  readText(path: string): Promise<string>;
  exists(outputPath: string): Promise<boolean>;
  write(outputPath: string, data: BatchData): Promise<void>;
}

export type AcceptedPlan = Extract<PagePlan, { ok: true }>;

/** Origin of the data of a territory: Overpass, its disk cache, or a local OSM file */
export type DataSource = 'network' | 'cache' | 'file';

export interface FetchedData {
  data: unknown;
  source: DataSource;
}

export interface Box { south: number; west: number; north: number; east: number }
export interface PrepareProgress { phase: string; fraction: number }

export interface BatchRenderer {
  fetchData(bounds: L.LatLngBounds): Promise<FetchedData>;
  render(format: BatchFormat, svg: string, plan: AcceptedPlan, profile: BatchProfile): Promise<Encoded<BatchData>>;
  /** Local data: no pause between territories, no second try */
  offline?: boolean;
  /** Reads the data of every territory to export once, before the first one */
  prepare?(boxes: Box[], onProgress: (progress: PrepareProgress) => void): Promise<void>;
  /** Releases the prepared data, whatever the outcome of the batch */
  close?(): Promise<void>;
}

export type BatchStatus = 'ok' | 'warning' | 'skipped' | 'rejected' | 'error';

export interface BatchRow {
  file: string;
  status: BatchStatus;
  /** Code of a rejection or an error */
  reason?: string;
  message: string;
  zones?: number;
  page?: string;
  orientation?: string;
  zoom?: number;
  source?: DataSource;
  outputs: string[];
  sizesKB: number[];
  durationMs: number;
}

export interface BatchProgress {
  /** Territories done, this one included once `row` is given */
  index: number;
  total: number;
  file: string;
  row?: BatchRow;
}

export interface BatchOptions {
  io: BatchIO;
  renderer: BatchRenderer;
  profile: BatchProfile;
  overwrite?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  /** Pause between two downloads */
  pauseMs?: number;
  /** Pause before trying the data of a territory again */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Progress of the preparation of a local data file */
  onPrepareProgress?: (progress: PrepareProgress) => void;
}

const EXTENSIONS: Record<BatchFormat, string> = { pdf: 'pdf', png: 'png', jpeg: 'jpg', svg: 'svg' };

/** Output of a territory in a format, at the place of its KML in the tree */
export function outputPath(kmlPath: string, format: BatchFormat): string {
  return `${kmlPath.replace(/\.kml$/i, '')}.${EXTENSIONS[format]}`;
}

class Failure extends Error {
  constructor(readonly status: 'rejected' | 'error', readonly reason: string, message: string) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runBatch(options: BatchOptions): Promise<BatchRow[]> {
  const { io, renderer, profile, overwrite = false, signal, onProgress } = options;
  const pauseMs = options.pauseMs ?? 2000;
  const retryDelayMs = options.retryDelayMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;

  const files = [...await io.listKml()].sort((a, b) => a.localeCompare(b, 'en'));
  const rows: BatchRow[] = [];
  let lastSource: DataSource | null = null;

  const alreadyDone = async (file: string) =>
    !overwrite && (await Promise.all(profile.formats.map(format => io.exists(outputPath(file, format))))).every(Boolean);

  // Territory of a file, its bounds and its page, or why it is rejected; the row, when
  // given, gets the number of zones even when the page rejects the territory
  const readTerritory = async (file: string, row?: BatchRow) => {
    const territory = readTerritoryKml(await io.readText(file));
    if (!territory.ok) throw new Failure('rejected', territory.reason, territory.message);
    if (row) row.zones = territory.zones.length;
    const bounds = calculateContextBounds(territory.zones, null, false) as L.LatLngBounds;
    const plan = planPage(bounds, profile.page);
    if (!plan.ok) throw new Failure('rejected', plan.reason, plan.message);
    return { zones: territory.zones, bounds, plan };
  };

  // Data of a territory. Overpass answers 429 and 504: a pause after each download, and
  // a second try after a longer one. Local data needs neither.
  const fetchData = async (bounds: L.LatLngBounds): Promise<FetchedData> => {
    if (lastSource === 'network') await sleep(pauseMs);
    try {
      const fetched = await renderer.fetchData(bounds);
      lastSource = fetched.source;
      return fetched;
    } catch (error) {
      if (renderer.offline) throw new Failure('error', 'data-unavailable', `Données OSM indisponibles : ${errorMessage(error)}`);
      await sleep(retryDelayMs);
      try {
        const fetched = await renderer.fetchData(bounds);
        lastSource = fetched.source;
        return fetched;
      } catch (retryError) {
        lastSource = 'network';
        throw new Failure('error', 'data-unavailable', `Données OSM indisponibles : ${errorMessage(retryError)}`);
      }
    }
  };

  const exportTerritory = async (file: string, row: BatchRow) => {
    if (await alreadyDone(file)) {
      row.status = 'skipped';
      row.message = 'Déjà exporté.';
      return;
    }

    const { zones, bounds, plan } = await readTerritory(file, row);
    Object.assign(row, { page: plan.format, orientation: plan.orientation, zoom: plan.zoom });

    const { data, source } = await fetchData(bounds);
    row.source = source;
    let svg: string;
    try {
      svg = generateSVG(data, zones, bounds, profile.style, projectionAtZoom(plan.zoom), profile.export);
    } catch (error) {
      throw new Failure('error', 'export-failed', errorMessage(error));
    }

    for (const format of profile.formats) {
      try {
        const encoded = await renderer.render(format, svg, plan, profile);
        const path = outputPath(file, format);
        await io.write(path, encoded.data);
        row.outputs.push(path);
        row.sizesKB.push(encoded.sizeKB);
        if (encoded.overLimit) {
          row.status = 'warning';
          row.message = 'Taille au-dessus de la limite, même à la qualité minimale.';
        }
      } catch (error) {
        throw new Failure('error', 'export-failed', errorMessage(error));
      }
    }
  };

  try {
    // A local data file is read once, for the bounds of every territory to export
    if (renderer.prepare) {
      const boxes: Box[] = [];
      for (const file of files) {
        try {
          if (await alreadyDone(file)) continue;
          const { bounds } = await readTerritory(file);
          boxes.push({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });
        } catch {
          // Rejected: reported when its turn comes
        }
      }
      await renderer.prepare(boxes, progress => options.onPrepareProgress?.(progress));
    }

    for (const [i, file] of files.entries()) {
      if (signal?.aborted) break;
      onProgress?.({ index: i, total: files.length, file });
      const started = Date.now();
      const row: BatchRow = { file, status: 'ok', message: '', outputs: [], sizesKB: [], durationMs: 0 };
      try {
        await exportTerritory(file, row);
      } catch (error) {
        row.status = error instanceof Failure ? error.status : 'error';
        row.reason = error instanceof Failure ? error.reason : 'export-failed';
        row.message = errorMessage(error);
      }
      row.durationMs = Date.now() - started;
      rows.push(row);
      onProgress?.({ index: i + 1, total: files.length, file, row });
    }
  } finally {
    await renderer.close?.();
  }
  return rows;
}

const STATUS_LABELS: Record<BatchStatus, string> = {
  ok: 'ok',
  warning: 'avertissement',
  skipped: 'ignoré',
  rejected: 'rejeté',
  error: 'erreur',
};

const SOURCE_LABELS: Record<DataSource, string> = { network: 'réseau', cache: 'cache', file: 'fichier' };

const ORIENTATION_LABELS: Record<string, string> = { portrait: 'portrait', landscape: 'paysage' };

// CSV field, quoted when it holds the separator, a quote or a line break
const csvField = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Report of a batch: semicolon-separated UTF-8 with BOM, as spreadsheets in French read it */
export function reportCsv(rows: BatchRow[]): string {
  const header = 'fichier;statut;motif;message;zones;page;orientation;zoom;donnees;sorties;taille_ko;duree_s';
  const lines = rows.map(row => [
    row.file,
    STATUS_LABELS[row.status],
    row.reason ?? '',
    row.message,
    row.zones?.toString() ?? '',
    row.page?.toUpperCase() ?? '',
    row.orientation ? ORIENTATION_LABELS[row.orientation] ?? row.orientation : '',
    row.zoom !== undefined ? String(Math.round(row.zoom * 100) / 100) : '',
    row.source ? SOURCE_LABELS[row.source] : '',
    row.outputs.join(' | '),
    row.sizesKB.map(size => size.toFixed(0)).join(' | '),
    (row.durationMs / 1000).toFixed(1),
  ].map(csvField).join(';'));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}

/** Name of the report, at the root of the output folder */
export const REPORT_FILE = 'rapport.csv';

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Counts of a batch by status, in French */
export function summarizeBatch(rows: BatchRow[]): string {
  const count = (...statuses: BatchStatus[]) => rows.filter(row => statuses.includes(row.status)).length;
  const warnings = count('warning');
  const exported = plural(count('ok', 'warning'), 'exporté') + (warnings ? ` (dont ${plural(warnings, 'avertissement')})` : '');
  return [exported, plural(count('skipped'), 'ignoré'), plural(count('rejected'), 'rejeté'), plural(count('error'), 'erreur')].join(', ');
}
