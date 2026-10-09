/**
 * GeoPDF georeferencing (Adobe / ISO 32000 extension): a /VP viewport with a
 * /Measure of subtype /GEO on the page, readable by Acrobat, Avenza Maps and GDAL.
 *
 * The exported map maps lat/lon linearly to pixels, which is exactly an
 * EPSG:4326 georeference defined by 4 control points.
 */

import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { GeoBox } from './kmlGenerator';

const PT_PER_MM = 72 / 25.4;

export interface PlacementMm {
  x: number; // from the left edge
  y: number; // from the top edge (jsPDF convention)
  width: number;
  height: number;
}

export interface Georeference {
  bbox: [number, number, number, number]; // [llx, lly, urx, ury] in points, origin bottom-left
  gpts: number[]; // lat,lon pairs
  lpts: number[]; // x,y pairs in [0,1] relative to bbox
}

/** Fit an image into a page with a margin, centered, preserving aspect ratio. */
export function computeImagePlacement(
  pageWidthMm: number,
  pageHeightMm: number,
  imageWidth: number,
  imageHeight: number,
  marginMm: number
): PlacementMm {
  const scale = Math.min(
    (pageWidthMm - marginMm * 2) / imageWidth,
    (pageHeightMm - marginMm * 2) / imageHeight
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (pageWidthMm - width) / 2,
    y: (pageHeightMm - height) / 2,
    width,
    height,
  };
}

/** Lat/lng extent of zones whose coordinates are [lat, lng] pairs. */
export function zonesBoundingBox(zones: { coordinates: number[][] }[]): GeoBox {
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const zone of zones) {
    for (const [lat, lng] of zone.coordinates) {
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      west = Math.min(west, lng);
    }
  }
  if (!Number.isFinite(north)) {
    throw new Error('Aucune coordonnée de zone pour le géoréférencement');
  }
  return { north, south, east, west };
}

/**
 * Georeference the part of the placed image covered by `zoneBox`.
 * `imageBox` is the geographic extent of the whole image (margin included).
 */
export function computeGeoreference(params: {
  page: { width: number; height: number }; // mm
  placement: PlacementMm;
  imageBox: GeoBox;
  zoneBox: GeoBox;
}): Georeference {
  const { page, placement, imageBox } = params;
  const zone: GeoBox = {
    north: Math.min(params.zoneBox.north, imageBox.north),
    south: Math.max(params.zoneBox.south, imageBox.south),
    east: Math.min(params.zoneBox.east, imageBox.east),
    west: Math.max(params.zoneBox.west, imageBox.west),
  };
  if (zone.north <= zone.south || zone.east <= zone.west) {
    throw new Error('La zone est en dehors de l\'image exportée');
  }

  const xMm = (lon: number) =>
    placement.x + ((lon - imageBox.west) / (imageBox.east - imageBox.west)) * placement.width;
  const yMm = (lat: number) =>
    placement.y + ((imageBox.north - lat) / (imageBox.north - imageBox.south)) * placement.height;

  return {
    bbox: [
      xMm(zone.west) * PT_PER_MM,
      (page.height - yMm(zone.south)) * PT_PER_MM,
      xMm(zone.east) * PT_PER_MM,
      (page.height - yMm(zone.north)) * PT_PER_MM,
    ],
    // SW, NW, NE, SE <-> (0,0), (0,1), (1,1), (1,0)
    gpts: [
      zone.south, zone.west,
      zone.north, zone.west,
      zone.north, zone.east,
      zone.south, zone.east,
    ],
    lpts: [0, 0, 0, 1, 1, 1, 1, 0],
  };
}

const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],' +
  'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

/** Add the georeference to the first page of a PDF. */
export async function applyGeoreference(pdf: Uint8Array | ArrayBuffer, geo: Georeference): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const ctx = doc.context;

  const measure = ctx.obj({
    Type: 'Measure',
    Subtype: 'GEO',
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    GPTS: geo.gpts,
    LPTS: geo.lpts,
    GCS: {
      Type: 'GEOGCS',
      EPSG: 4326,
      WKT: PDFString.of(WGS84_WKT),
    },
  });

  const viewport = ctx.obj({
    Type: 'Viewport',
    BBox: geo.bbox,
    Name: PDFString.of('Carte'),
    Measure: measure,
  });

  doc.getPage(0).node.set(PDFName.of('VP'), ctx.obj([viewport]));
  return doc.save();
}
