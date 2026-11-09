/**
 * Data and rendering of the batch export: Overpass data of the territory bounds, and each
 * format drawn at the size of its page, under the size limit, with the encodings of the
 * application (rasterExport).
 */

import L from 'leaflet';
import { buildOverpassQuery, fetchFromOverpass } from '../utils/osmData';
import {
  svgToCanvas, encodeCanvas, releaseCanvas, dataUrlSizeKB, bestUnderLimit, encodePngUnderLimit, encodeJpegUnderLimit,
  buildGeoPdf, Encoded,
} from '../utils/rasterExport';
import { BatchFormat, BatchProfile } from './batchProfile';
import { AcceptedPlan, BatchData, BatchRenderer } from './batchRunner';

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

export function createBatchRenderer(): BatchRenderer {
  return {
    fetchData: (bounds: L.LatLngBounds) => fetchFromOverpass(
      buildOverpassQuery({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }, SERVER_TIMEOUT_S),
      { timeoutMs: CLIENT_TIMEOUT_MS },
    ),
    render: renderFormat,
  };
}
