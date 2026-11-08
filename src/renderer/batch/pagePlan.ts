/**
 * Page of a territory in the batch export: the first format of the list on which the map
 * is readable, that is drawn at least at the minimum zoom, in the orientation that draws it
 * largest. The map fills the printable area at the resolution of the page.
 */

import L from 'leaflet';
import { exportFrame, projectionAtZoom, ExportFrame } from '../utils/svgGenerator';

export type PageFormat = 'a4' | 'a3';
export type PageOrientation = 'portrait' | 'landscape';

/** Portrait width and height in millimeters */
export const PAGE_SIZES_MM: Record<PageFormat, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
};

export interface PageSettings {
  /** Formats tried in order */
  formats: PageFormat[];
  dpi: number;
  marginMm: number;
  /** Below it, the map is not readable */
  minZoom: number;
  /** Above it, the map is enlarged rather than drawn closer */
  maxZoom: number;
}

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  formats: ['a4', 'a3'],
  dpi: 300,
  marginMm: 10,
  minZoom: 15,
  maxZoom: 19,
};

export type PagePlan =
  | {
    ok: true;
    format: PageFormat;
    orientation: PageOrientation;
    zoom: number;
    frame: ExportFrame;
    /** Scale from SVG units to image pixels */
    rasterScale: number;
    imageWidth: number;
    imageHeight: number;
  }
  | { ok: false; reason: 'too-large'; message: string };

const MM_PER_INCH = 25.4;

/** Printable area of a portrait page, in pixels at the resolution */
export function printableArea(format: PageFormat, dpi: number, marginMm: number): { width: number; height: number } {
  const page = PAGE_SIZES_MM[format];
  const toPixels = (mm: number) => Math.round(((mm - marginMm * 2) / MM_PER_INCH) * dpi);
  return { width: toPixels(page.width), height: toPixels(page.height) };
}

function checkSettings(settings: PageSettings): void {
  const { formats, dpi, marginMm, minZoom, maxZoom } = settings;
  const smallestSide = Math.min(...formats.map(format => PAGE_SIZES_MM[format]?.width ?? NaN));
  if (formats.length === 0 || !Number.isFinite(smallestSide)) throw new Error('No page format');
  if (!(dpi > 0) || !Number.isFinite(dpi)) throw new Error(`Invalid resolution: ${dpi}`);
  if (!(marginMm >= 0) || marginMm * 2 >= smallestSide) throw new Error(`Invalid margin: ${marginMm}`);
  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom) || minZoom > maxZoom) {
    throw new Error(`Invalid zoom range: ${minZoom}-${maxZoom}`);
  }
}

// The frame is a fixed margin around content that doubles at each zoom level
const REFERENCE_ZOOM = 20;

export function planPage(bounds: L.LatLngBounds, settings: PageSettings = DEFAULT_PAGE_SETTINGS): PagePlan {
  checkSettings(settings);
  const reference = exportFrame(bounds, projectionAtZoom(REFERENCE_ZOOM));
  const marginX = reference.width - reference.content.width;
  const marginY = reference.height - reference.content.height;

  // Zoom at which the frame just fits an area
  const fittingZoom = (width: number, height: number) => REFERENCE_ZOOM + Math.log2(Math.min(
    (width - marginX) / reference.content.width,
    (height - marginY) / reference.content.height,
  ));

  for (const format of settings.formats) {
    const portrait = printableArea(format, settings.dpi, settings.marginMm);
    const candidates = [
      { orientation: 'portrait' as const, area: portrait },
      { orientation: 'landscape' as const, area: { width: portrait.height, height: portrait.width } },
    ].map(candidate => ({ ...candidate, zoom: fittingZoom(candidate.area.width, candidate.area.height) }));
    const best = candidates[0].zoom >= candidates[1].zoom ? candidates[0] : candidates[1];
    if (!(best.zoom >= settings.minZoom)) continue;

    const zoom = Math.min(best.zoom, settings.maxZoom);
    const frame = exportFrame(bounds, projectionAtZoom(zoom));
    const rasterScale = Math.min(best.area.width / frame.width, best.area.height / frame.height);
    return {
      ok: true,
      format,
      orientation: best.orientation,
      zoom,
      frame,
      rasterScale,
      imageWidth: Math.round(frame.width * rasterScale),
      imageHeight: Math.round(frame.height * rasterScale),
    };
  }

  const largest = settings.formats[settings.formats.length - 1].toUpperCase();
  return {
    ok: false,
    reason: 'too-large',
    message: `Territoire trop grand pour être lisible en ${largest} (zoom ${settings.minZoom} minimum).`,
  };
}
