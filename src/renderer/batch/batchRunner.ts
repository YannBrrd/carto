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

export interface BatchRenderer {
  fetchData(bounds: L.LatLngBounds): Promise<unknown>;
  render(format: BatchFormat, svg: string, plan: AcceptedPlan, profile: BatchProfile): Promise<Encoded<BatchData>>;
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
  let downloads = 0;

  // Data of a territory, tried again once after a pause (Overpass answers 429 and 504)
  const fetchData = async (bounds: L.LatLngBounds) => {
    if (downloads++ > 0) await sleep(pauseMs);
    try {
      return await renderer.fetchData(bounds);
    } catch {
      await sleep(retryDelayMs);
      try {
        return await renderer.fetchData(bounds);
      } catch (error) {
        throw new Failure('error', 'data-unavailable', `Données OSM indisponibles : ${errorMessage(error)}`);
      }
    }
  };

  const exportTerritory = async (file: string, row: BatchRow) => {
    const outputs = profile.formats.map(format => outputPath(file, format));
    if (!overwrite && (await Promise.all(outputs.map(path => io.exists(path)))).every(Boolean)) {
      row.status = 'skipped';
      row.message = 'Déjà exporté.';
      return;
    }

    const territory = readTerritoryKml(await io.readText(file));
    if (!territory.ok) throw new Failure('rejected', territory.reason, territory.message);
    row.zones = territory.zones.length;

    const bounds = calculateContextBounds(territory.zones, null, false) as L.LatLngBounds;
    const plan = planPage(bounds, profile.page);
    if (!plan.ok) throw new Failure('rejected', plan.reason, plan.message);
    Object.assign(row, { page: plan.format, orientation: plan.orientation, zoom: plan.zoom });

    const data = await fetchData(bounds);
    let svg: string;
    try {
      svg = generateSVG(data, territory.zones, bounds, profile.style, projectionAtZoom(plan.zoom), profile.export);
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
  return rows;
}

const STATUS_LABELS: Record<BatchStatus, string> = {
  ok: 'ok',
  warning: 'avertissement',
  skipped: 'ignoré',
  rejected: 'rejeté',
  error: 'erreur',
};

const ORIENTATION_LABELS: Record<string, string> = { portrait: 'portrait', landscape: 'paysage' };

// CSV field, quoted when it holds the separator, a quote or a line break
const csvField = (value: string) => (/[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Report of a batch: semicolon-separated UTF-8 with BOM, as spreadsheets in French read it */
export function reportCsv(rows: BatchRow[]): string {
  const header = 'fichier;statut;motif;message;zones;page;orientation;zoom;sorties;taille_ko;duree_s';
  const lines = rows.map(row => [
    row.file,
    STATUS_LABELS[row.status],
    row.reason ?? '',
    row.message,
    row.zones?.toString() ?? '',
    row.page?.toUpperCase() ?? '',
    row.orientation ? ORIENTATION_LABELS[row.orientation] ?? row.orientation : '',
    row.zoom !== undefined ? String(Math.round(row.zoom * 100) / 100) : '',
    row.outputs.join(' | '),
    row.sizesKB.map(size => size.toFixed(0)).join(' | '),
    (row.durationMs / 1000).toFixed(1),
  ].map(csvField).join(';'));
  return `﻿${[header, ...lines].join('\r\n')}\r\n`;
}
