/**
 * Data and rendering of the batch export: Overpass data of the territory bounds, and each
 * format drawn at the size of its page, under the size limit, with the encodings of the
 * application (rasterExport).
 */

import L from 'leaflet';
import { buildOverpassQuery, fetchFromOverpass, OSM_FILTER, OsmFilter } from '../utils/osmData';
import {
  svgToCanvas, encodeCanvas, releaseCanvas, dataUrlSizeKB, bestUnderLimit, encodePngUnderLimit, encodeJpegUnderLimit,
  buildGeoPdf, Encoded,
} from '../utils/rasterExport';
import { BatchFormat, BatchProfile } from './batchProfile';
import { AcceptedPlan, BatchData, BatchRenderer, Box, FetchedData, PrepareProgress } from './batchRunner';

// A page covers more ground than a screen: the server may run the query longer
const SERVER_TIMEOUT_S = 90;
const CLIENT_TIMEOUT_MS = 100_000;

// Quality without size limit, as the application
const FULL_QUALITY = 0.92;

async function renderFormat(format: BatchFormat, svg: string, plan: AcceptedPlan, profile: BatchProfile): Promise<Encoded<BatchData>> {
  const { maxExportSizeEnabled, maxExportSizeKB } = profile.export;
  const minQuality = profile.export.minQualityPercent / 100;
  const dimensions = { width: plan.frame.width, height: plan.frame.height };

  if (format === 'svg') {
    const sizeKB = new Blob([svg]).size / 1024;
    return { data: { text: svg }, sizeKB, overLimit: maxExportSizeEnabled && sizeKB > maxExportSizeKB };
  }

  if (format === 'png') {
    if (maxExportSizeEnabled) {
      const encoded = await encodePngUnderLimit(svg, dimensions, {
        minScale: plan.rasterScale * minQuality, maxScale: plan.rasterScale, maxKB: maxExportSizeKB,
      });
      return { ...encoded, data: { dataUrl: encoded.data } };
    }
    const canvas = await svgToCanvas(svg, plan.rasterScale, dimensions);
    try {
      const dataUrl = encodeCanvas(canvas, 'png');
      return { data: { dataUrl }, sizeKB: dataUrlSizeKB(dataUrl), overLimit: false };
    } finally {
      releaseCanvas(canvas);
    }
  }

  // JPEG and PDF: one canvas at the size of the page, encoded at the best quality that fits
  const canvas = await svgToCanvas(svg, plan.rasterScale, dimensions);
  try {
    if (format === 'jpeg') {
      if (maxExportSizeEnabled) {
        const encoded = await encodeJpegUnderLimit(canvas, { minQuality, maxKB: maxExportSizeKB });
        return { ...encoded, data: { dataUrl: encoded.data } };
      }
      const dataUrl = encodeCanvas(canvas, 'jpeg', FULL_QUALITY);
      return { data: { dataUrl }, sizeKB: dataUrlSizeKB(dataUrl), overLimit: false };
    }

    const page = { format: plan.format, orientation: plan.orientation, marginMm: profile.page.marginMm };
    const pdfOf = (quality: number) => buildGeoPdf(canvas, plan.frame, quality, page);
    const sizeKB = (buffer: ArrayBuffer) => buffer.byteLength / 1024;
    const encoded = maxExportSizeEnabled
      ? await bestUnderLimit(pdfOf, sizeKB, minQuality, 0.95, maxExportSizeKB)
      : (() => { const bytes = pdfOf(FULL_QUALITY); return { data: bytes, sizeKB: sizeKB(bytes), overLimit: false }; })();
    return { ...encoded, data: { bytes: encoded.data } };
  } finally {
    releaseCanvas(canvas);
  }
}

/** Disk cache of the Overpass answers, in the main process */
export interface CacheApi {
  cacheGet(query: string): Promise<string | null>;
  cachePut(query: string, answer: string): Promise<void>;
}

const boxOf = (bounds: L.LatLngBounds): Box =>
  ({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });

// Cached answer of a query, or null when there is none or it cannot be read
async function cachedAnswer(cache: CacheApi, query: string): Promise<unknown | null> {
  try {
    const text = await cache.cacheGet(query);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Batch data from Overpass, through the disk cache when there is one; `refresh` downloads
 * again and replaces what the cache holds
 */
export function createBatchRenderer(options: { cache?: CacheApi; refresh?: boolean } = {}): BatchRenderer {
  const { cache, refresh = false } = options;
  return {
    async fetchData(bounds: L.LatLngBounds): Promise<FetchedData> {
      const query = buildOverpassQuery(boxOf(bounds), SERVER_TIMEOUT_S);
      if (cache && !refresh) {
        const data = await cachedAnswer(cache, query);
        if (data !== null) return { data, source: 'cache' };
      }
      const data = await fetchFromOverpass(query, { timeoutMs: CLIENT_TIMEOUT_MS });
      // A cache that cannot be written only costs a download next time
      await cache?.cachePut(query, JSON.stringify(data)).catch(() => {});
      return { data, source: 'network' };
    },
    render: renderFormat,
  };
}

/** OSM PBF file read in the main process */
export interface OsmFileApi {
  osmOpen(file: string, boxes: Box[], filter: OsmFilter): Promise<{ nodes: number; ways: number; relations: number }>;
  osmQuery(box: Box): Promise<{ elements: unknown[] }>;
  osmClose(): Promise<void>;
  onOsmProgress(callback: (progress: PrepareProgress) => void): () => void;
}

/** Batch data from a local OSM PBF extract, read once for the bounds of every territory */
export function createOsmFileRenderer(api: OsmFileApi, file: string): BatchRenderer {
  return {
    offline: true,
    async prepare(boxes, onProgress) {
      const unsubscribe = api.onOsmProgress(onProgress);
      try {
        await api.osmOpen(file, boxes, OSM_FILTER);
      } finally {
        unsubscribe();
      }
    },
    async fetchData(bounds) {
      return { data: await api.osmQuery(boxOf(bounds)), source: 'file' };
    },
    close: () => api.osmClose(),
    render: renderFormat,
  };
}

/** Where the data of a batch comes from: an OSM file, else Overpass through the disk cache */
export interface DataChoice {
  osmFile?: string;
  refresh: boolean;
}

export function rendererFor(choice: DataChoice, api: CacheApi & OsmFileApi): BatchRenderer {
  return choice.osmFile ? createOsmFileRenderer(api, choice.osmFile) : createBatchRenderer({ cache: api, refresh: choice.refresh });
}

const PREPARE_PHASES: Record<string, [number, string]> = {
  relations: [1, 'relations'],
  nodes: [2, 'nœuds'],
  ways: [3, 'voies'],
  'missing-nodes': [4, 'nœuds hors des territoires'],
};

/** Progress of the reading of an OSM file, in French */
export function describePrepare(progress: PrepareProgress): string {
  const [step, label] = PREPARE_PHASES[progress.phase] ?? [0, progress.phase];
  return `Lecture du fichier OSM (${step}/4, ${label}) : ${Math.round(progress.fraction * 100)} %`;
}
