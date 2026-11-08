/**
 * Raster exports shared by the application and the batch export: SVG to canvas, PNG, JPEG
 * and georeferenced PDF, and the search of the best encoding under a size limit.
 */

import { jsPDF } from 'jspdf';
import { ExportFrame } from './svgGenerator';
import { placeImage, geoViewport, addGeoViewport } from './geoPdf';
import { clampCanvasScale, isEncodedImage } from './canvasLimits';

/** An encoding, its size, and whether it is still over the size limit */
export interface Encoded<T> {
  data: T;
  sizeKB: number;
  overLimit: boolean;
}

/** Decoded size of a base64 data URL, in KB */
export function dataUrlSizeKB(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return (base64.length * 3) / 4 / 1024;
}

/** Release the memory of a canvas (helps the GC with large canvases) */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Data URL of a canvas, or an error when the browser could not encode it (an oversized
 * canvas gives "data:," which the main process would otherwise write as a file)
 */
export function encodeCanvas(canvas: HTMLCanvasElement, type: 'png' | 'jpeg', quality?: number): string {
  const dataUrl = canvas.toDataURL(`image/${type}`, quality);
  if (!isEncodedImage(dataUrl, type)) {
    throw new Error('Image trop grande pour être exportée. Réduisez la zone ou le zoom.');
  }
  return dataUrl;
}

// SVG dimensions, when the caller does not know them
function parseSvgDimensions(svgContent: string): { width: number; height: number } {
  const svgElement = new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement;
  return {
    width: parseFloat(svgElement.getAttribute('width') || '800'),
    height: parseFloat(svgElement.getAttribute('height') || '600'),
  };
}

/** Canvas of an SVG at a scale, lowered to the browser canvas limits */
export async function svgToCanvas(
  svgContent: string,
  scale: number = 2,
  dimensions?: { width: number; height: number }
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const { width, height } = dimensions || parseSvgDimensions(svgContent);
    // A canvas above the browser limits draws nothing: the scale is lowered to fit
    scale = clampCanvasScale(scale, width, height);

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseCanvas(canvas);
      reject(new Error('Impossible de créer le contexte canvas'));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' }));

    img.onload = async () => {
      // Fonts must be loaded before drawing (race on Mac at high DPI), 2 s at most
      try {
        await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 2000))]);
      } catch (error) {
        console.warn('Font loading check failed, proceeding with render:', error);
      }
      try {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      } catch (error) {
        releaseCanvas(canvas);
        reject(error instanceof Error ? error : new Error('Erreur lors du rendu de l\'image'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      releaseCanvas(canvas);
      reject(new Error('Erreur lors du chargement de l\'image SVG'));
    };

    img.src = url;
  });
}

/** Fewer colors (posterization), to reduce the size of a PNG */
export function quantizeCanvas(canvas: HTMLCanvasElement, levels: number = 32): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const step = 256 / levels;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

const BISECTION_STEPS = 6;
const EPSILON = 0.01;

/**
 * Encoding at the highest setting (scale or quality) of [low, high] that fits the limit:
 * the highest when it fits, the lowest, marked over the limit, when even it does not fit,
 * else found by bisection
 */
export async function bestUnderLimit<T>(
  encode: (setting: number) => T | Promise<T>,
  sizeKB: (data: T) => number,
  low: number,
  high: number,
  maxKB: number,
  onStep?: (step: number, steps: number) => void
): Promise<Encoded<T>> {
  const highest = await encode(high);
  const highestSize = sizeKB(highest);
  if (highestSize <= maxKB) return { data: highest, sizeKB: highestSize, overLimit: false };

  const lowest = await encode(low);
  const lowestSize = sizeKB(lowest);
  if (lowestSize > maxKB) return { data: lowest, sizeKB: lowestSize, overLimit: true };

  let best: Encoded<T> = { data: lowest, sizeKB: lowestSize, overLimit: false };
  for (let i = 0; i < BISECTION_STEPS && high - low > EPSILON; i++) {
    onStep?.(i + 1, BISECTION_STEPS);
    const middle = (low + high) / 2;
    const data = await encode(middle);
    const size = sizeKB(data);
    if (size <= maxKB) {
      best = { data, sizeKB: size, overLimit: false };
      low = middle;
    } else {
      high = middle;
    }
  }
  return best;
}

export interface PngLimit {
  minScale: number;
  maxScale: number;
  maxKB: number;
}

/**
 * PNG of an SVG at the largest scale that fits the limit; when even the minimum scale does
 * not fit, with fewer and fewer colors, marked over the limit if it still does not fit
 */
export async function encodePngUnderLimit(
  svg: string,
  dimensions: { width: number; height: number },
  limit: PngLimit,
  onStep?: (step: number, steps: number) => void
): Promise<Encoded<string>> {
  const render = async (scale: number, levels?: number) => {
    const canvas = await svgToCanvas(svg, scale, dimensions);
    try {
      if (levels) quantizeCanvas(canvas, levels);
      return encodeCanvas(canvas, 'png');
    } finally {
      releaseCanvas(canvas);
    }
  };

  const full = await render(limit.maxScale);
  const fullSize = dataUrlSizeKB(full);
  if (fullSize <= limit.maxKB) return { data: full, sizeKB: fullSize, overLimit: false };

  // The size follows the area: start the search near the scale that should fit
  const estimated = limit.maxScale * Math.sqrt(limit.maxKB / fullSize) * 0.9;
  const high = Math.min(limit.maxScale, Math.max(estimated * 1.5, limit.minScale));
  const result = await bestUnderLimit(render, dataUrlSizeKB, limit.minScale, high, limit.maxKB, onStep);
  if (!result.overLimit) return result;

  let best = result;
  for (const levels of [64, 32, 16, 8]) {
    const data = await render(limit.minScale, levels);
    const size = dataUrlSizeKB(data);
    if (size <= limit.maxKB) return { data, sizeKB: size, overLimit: false };
    if (size < best.sizeKB) best = { data, sizeKB: size, overLimit: true };
  }
  return best;
}

/** JPEG of a canvas at the highest quality (0.95 at most) that fits the limit */
export function encodeJpegUnderLimit(
  canvas: HTMLCanvasElement,
  limit: { minQuality: number; maxKB: number },
  onStep?: (step: number, steps: number) => void
): Promise<Encoded<string>> {
  return bestUnderLimit(quality => encodeCanvas(canvas, 'jpeg', quality), dataUrlSizeKB, limit.minQuality, 0.95, limit.maxKB, onStep);
}

export interface PdfPage {
  format: 'a4' | 'a3';
  orientation: 'portrait' | 'landscape';
  marginMm: number;
}

/**
 * Georeferenced PDF of a canvas drawn from an export frame, as JPEG of the given quality.
 * Without a page, an A4 page turned like the image, with a 10 mm margin (the application).
 */
export function buildGeoPdf(canvas: HTMLCanvasElement, frame: ExportFrame, jpegQuality: number, page?: PdfPage): ArrayBuffer {
  const pdf = new jsPDF({
    orientation: page?.orientation ?? (frame.width > frame.height ? 'landscape' : 'portrait'),
    unit: 'mm',
    format: page?.format ?? 'a4',
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const placement = placeImage(pageWidth, pageHeight, frame.width, frame.height, page?.marginMm ?? 10);
  pdf.addImage(encodeCanvas(canvas, 'jpeg', jpegQuality), 'JPEG', placement.x, placement.y, placement.width, placement.height);
  // GeoPDF: the selected bounds carry their WGS 84 coordinates
  addGeoViewport(pdf, geoViewport(frame, placement, pageHeight));
  return pdf.output('arraybuffer');
}
