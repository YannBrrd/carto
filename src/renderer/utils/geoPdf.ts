/**
 * GeoPDF: georeferencing of the PDF export (ISO 32000-2 geospatial features). The page gets
 * a viewport over the selected bounds whose measure dictionary maps its corners to their
 * WGS 84 coordinates. Inside the bounds, the export is linear in latitude and longitude
 * (exportFrame), which is how readers interpolate between the points.
 */

import { jsPDF } from 'jspdf';
import { ExportFrame } from './svgGenerator';

/** Image on the page, in millimeters from the top-left corner */
export interface PdfPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MM_TO_PT = 72 / 25.4;

const WGS84_WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
  + 'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

/** Largest placement of an image centered on the page, inside the margin, keeping its proportions */
export function placeImage(pageWidth: number, pageHeight: number, imageWidth: number, imageHeight: number, margin: number): PdfPlacement {
  const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

// PDF number: fixed notation, no trailing zeros
function pdfNumber(value: number, digits: number): string {
  const text = value.toFixed(digits).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

/**
 * Viewport dictionary of the selected bounds, for a page of the given height in millimeters
 * on which the export image is placed as given
 */
export function geoViewport(frame: ExportFrame, placement: PdfPlacement, pageHeight: number): string {
  const scale = placement.width / frame.width;
  const { content, bounds } = frame;
  const left = (placement.x + content.x * scale) * MM_TO_PT;
  const right = (placement.x + (content.x + content.width) * scale) * MM_TO_PT;
  const top = (pageHeight - (placement.y + content.y * scale)) * MM_TO_PT;
  const bottom = (pageHeight - (placement.y + (content.y + content.height) * scale)) * MM_TO_PT;

  const bbox = [left, bottom, right, top].map(value => pdfNumber(value, 4)).join(' ');
  const [south, west, north, east] = [bounds.south, bounds.west, bounds.north, bounds.east].map(value => pdfNumber(value, 9));
  // Lower-left, upper-left, upper-right, lower-right corners of the viewport, as latitude longitude
  const gpts = [south, west, north, west, north, east, south, east].join(' ');

  return '<</Type /Viewport /Name (Carte) '
    + `/BBox [${bbox}] `
    + '/Measure <</Type /Measure /Subtype /GEO '
    + '/Bounds [0 0 0 1 1 1 1 0] '
    + `/GPTS [${gpts}] `
    + '/LPTS [0 0 0 1 1 1 1 0] '
    + `/GCS <</Type /GEOGCS /EPSG 4326 /WKT (${WGS84_WKT})>> `
    + '/PDU [/M /SQM /DEG]>>>>';
}

/** Adds the viewport to the first page of the PDF when it is written */
export function addGeoViewport(pdf: jsPDF, viewport: string): void {
  // jsPDF publishes putPage while the page dictionary is open; write() is not in its typings
  const internal = pdf.internal as typeof pdf.internal & { write: (...lines: string[]) => void };
  internal.events.subscribe('putPage', (data: { pageNumber: number }) => {
    if (data.pageNumber === 1) internal.write(`/VP [${viewport}]`);
  });
}
