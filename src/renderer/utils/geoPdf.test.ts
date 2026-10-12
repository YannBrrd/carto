import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { placeImage, geoViewport, addGeoViewport, PdfPlacement } from './geoPdf';
import { ExportFrame } from './svgGenerator';

const MM_TO_PT = 72 / 25.4;

// 1400 x 1000 SVG: 1200 x 800 of content around Paris city hall in a 100-unit margin
const frame: ExportFrame = {
  width: 1400,
  height: 1000,
  content: { x: 100, y: 100, width: 1200, height: 800 },
  bounds: { north: 48.858, south: 48.854, east: 2.356, west: 2.35 },
};

// A4 landscape
const PAGE = { width: 297, height: 210 };

const numbers = (text: string) => text.trim().split(/\s+/).map(Number);

function entry(dictionary: string, key: string): number[] {
  const match = dictionary.match(new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`No /${key} array`);
  return numbers(match[1]);
}

// Latitude and longitude a GeoPDF reader gives a point of the page, in points from the
// bottom-left corner: linear interpolation of GPTS over LPTS, inside the viewport BBox
function readerLatLon(dictionary: string, xPt: number, yPt: number): { lat: number; lon: number } {
  const [x1, y1, x2, y2] = entry(dictionary, 'BBox');
  const lpts = entry(dictionary, 'LPTS');
  const gpts = entry(dictionary, 'GPTS');
  expect(lpts).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
  const u = (xPt - x1) / (x2 - x1);
  const v = (yPt - y1) / (y2 - y1);
  // Corners in LPTS order: lower-left, upper-left, upper-right, lower-right
  const [southLat, westLon, northLat, , , eastLon] = gpts;
  expect(gpts).toEqual([southLat, westLon, northLat, westLon, northLat, eastLon, southLat, eastLon]);
  return { lat: southLat + v * (northLat - southLat), lon: westLon + u * (eastLon - westLon) };
}

// Point of the page, in points from the bottom-left corner, where the image shows an SVG position
function pagePoint(placement: PdfPlacement, svgX: number, svgY: number): { x: number; y: number } {
  const scale = placement.width / frame.width;
  return {
    x: (placement.x + svgX * scale) * MM_TO_PT,
    y: (PAGE.height - (placement.y + svgY * scale)) * MM_TO_PT,
  };
}

describe('placeImage', () => {
  it('centers the image on the page, inside the margins, keeping its proportions', () => {
    const placement = placeImage(PAGE.width, PAGE.height, frame.width, frame.height, 10);
    expect(placement.width / placement.height).toBeCloseTo(frame.width / frame.height);
    expect(placement.x).toBeGreaterThanOrEqual(10);
    expect(placement.y).toBeGreaterThanOrEqual(10);
    expect(placement.x + placement.width).toBeLessThanOrEqual(PAGE.width - 10 + 1e-9);
    expect(placement.y + placement.height).toBeLessThanOrEqual(PAGE.height - 10 + 1e-9);
    expect(placement.x * 2 + placement.width).toBeCloseTo(PAGE.width);
    expect(placement.y * 2 + placement.height).toBeCloseTo(PAGE.height);
    // Limited by the height: 190 mm high
    expect(placement.height).toBeCloseTo(190);
  });
});

describe('geoViewport', () => {
  const placement = placeImage(PAGE.width, PAGE.height, frame.width, frame.height, 10);
  const dictionary = geoViewport(frame, placement, PAGE.height);

  it('is a viewport with a geographic measure in WGS 84', () => {
    expect(dictionary).toMatch(/^<<\/Type \/Viewport/);
    expect(dictionary).toContain('/Measure <</Type /Measure /Subtype /GEO');
    expect(dictionary).toContain('/GCS <</Type /GEOGCS /EPSG 4326 /WKT (GEOGCS["WGS 84"');
    expect(entry(dictionary, 'Bounds')).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
  });

  it('covers the selected bounds on the page', () => {
    const [x1, y1, x2, y2] = entry(dictionary, 'BBox');
    const topLeft = pagePoint(placement, frame.content.x, frame.content.y);
    const bottomRight = pagePoint(placement, frame.content.x + frame.content.width, frame.content.y + frame.content.height);
    expect(x1).toBeCloseTo(topLeft.x, 3);
    expect(y2).toBeCloseTo(topLeft.y, 3);
    expect(x2).toBeCloseTo(bottomRight.x, 3);
    expect(y1).toBeCloseTo(bottomRight.y, 3);
  });

  it('gives back the coordinates of any point of the map', () => {
    for (const [lat, lon] of [[48.856, 2.351], [48.8575, 2.355], [48.854, 2.35], [48.858, 2.356]]) {
      const { content, bounds } = frame;
      const svgX = content.x + ((lon - bounds.west) / (bounds.east - bounds.west)) * content.width;
      const svgY = content.y + ((bounds.north - lat) / (bounds.north - bounds.south)) * content.height;
      const point = pagePoint(placement, svgX, svgY);
      const read = readerLatLon(dictionary, point.x, point.y);
      // 1e-7 degree is about 1 cm
      expect(read.lat).toBeCloseTo(lat, 7);
      expect(read.lon).toBeCloseTo(lon, 7);
    }
  });

  it('never writes numbers in exponent notation, which PDF does not read', () => {
    const nearOrigin: ExportFrame = { ...frame, bounds: { north: 0.0000002, south: -0.0000001, east: 0.0000003, west: -0.0000001 } };
    expect(geoViewport(nearOrigin, placement, PAGE.height)).not.toMatch(/\de[-+]?\d/i);
  });
});

describe('addGeoViewport', () => {
  it('adds the viewport to the page dictionary of the PDF', () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
    const placement = placeImage(pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), frame.width, frame.height, 10);
    pdf.rect(placement.x, placement.y, placement.width, placement.height);
    const dictionary = geoViewport(frame, placement, pdf.internal.pageSize.getHeight());
    addGeoViewport(pdf, dictionary);

    const output = pdf.output();
    const page = output.match(/<<\/Type \/Page\n[\s\S]*?\nendobj/)![0];
    expect(page).toContain(`/VP [${dictionary}]`);
    expect(page.indexOf('/VP')).toBeLessThan(page.indexOf('/Contents'));
    expect(output.match(/\/VP \[/g)).toHaveLength(1);
  });

  it('keeps the cross-reference table valid', () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
    const placement = placeImage(297, 210, frame.width, frame.height, 10);
    addGeoViewport(pdf, geoViewport(frame, placement, 210));
    const output = pdf.output();
    const xrefStart = Number(output.match(/startxref\n(\d+)/)![1]);
    expect(output.slice(xrefStart, xrefStart + 4)).toBe('xref');
    const offsets = output.slice(xrefStart).match(/^(\d{10}) 00000 n ?$/gm)!.map(line => Number(line.slice(0, 10)));
    for (const [index, offset] of offsets.entries()) {
      expect(output.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    }
  });
});
