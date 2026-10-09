import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber } from 'pdf-lib';
import {
  computeImagePlacement,
  zonesBoundingBox,
  computeGeoreference,
  applyGeoreference,
} from './pdfGeoref';

const PT_PER_MM = 72 / 25.4;

describe('computeImagePlacement', () => {
  it('fits a landscape image to the width and centers it vertically', () => {
    // A4 landscape 297x210, margin 10 => available 277x190; image 2:1
    const p = computeImagePlacement(297, 210, 2000, 1000, 10);
    expect(p.width).toBeCloseTo(277, 6);
    expect(p.height).toBeCloseTo(138.5, 6);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo((210 - 138.5) / 2, 6);
  });

  it('fits a tall image to the height and centers it horizontally', () => {
    const p = computeImagePlacement(210, 297, 1000, 2000, 10);
    expect(p.height).toBeCloseTo(277, 6);
    expect(p.width).toBeCloseTo(138.5, 6);
    expect(p.y).toBeCloseTo(10, 6);
    expect(p.x).toBeCloseTo((210 - 138.5) / 2, 6);
  });
});

describe('zonesBoundingBox', () => {
  it('computes the lat/lng extent of all zones ([lat, lng] pairs)', () => {
    const box = zonesBoundingBox([
      { coordinates: [[48.0, 2.0], [48.2, 2.1], [48.1, 2.3]] },
      { coordinates: [[47.9, 2.2], [48.0, 2.5]] },
    ]);
    expect(box).toEqual({ north: 48.2, south: 47.9, east: 2.5, west: 2.0 });
  });

  it('throws when there is no coordinate', () => {
    expect(() => zonesBoundingBox([])).toThrow();
    expect(() => zonesBoundingBox([{ coordinates: [] }])).toThrow();
  });
});

describe('computeGeoreference', () => {
  const page = { width: 297, height: 210 };
  const placement = { x: 10, y: 10, width: 277, height: 190 };
  const imageBox = { north: 10, south: 0, east: 20, west: 0 };
  const zoneBox = { north: 7.5, south: 2.5, east: 15, west: 5 };

  it('maps the zone box to a PDF-space BBox (points, origin bottom-left)', () => {
    const g = computeGeoreference({ page, placement, imageBox, zoneBox });
    const [llx, lly, urx, ury] = g.bbox;
    expect(llx).toBeCloseTo((10 + 0.25 * 277) * PT_PER_MM, 4);
    expect(urx).toBeCloseTo((10 + 0.75 * 277) * PT_PER_MM, 4);
    // top-based y: north 7.5 => 10 + 0.25*190 ; south 2.5 => 10 + 0.75*190
    expect(ury).toBeCloseTo((210 - (10 + 0.25 * 190)) * PT_PER_MM, 4);
    expect(lly).toBeCloseTo((210 - (10 + 0.75 * 190)) * PT_PER_MM, 4);
  });

  it('emits GPTS as lat/lon pairs (SW, NW, NE, SE) matching unit-square LPTS', () => {
    const g = computeGeoreference({ page, placement, imageBox, zoneBox });
    expect(g.gpts).toEqual([2.5, 5, 7.5, 5, 7.5, 15, 2.5, 15]);
    expect(g.lpts).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
  });

  it('clamps a zone box that exceeds the image box', () => {
    const g = computeGeoreference({
      page,
      placement,
      imageBox,
      zoneBox: { north: 50, south: -50, east: 99, west: -99 },
    });
    expect(g.gpts).toEqual([0, 0, 10, 0, 10, 20, 0, 20]);
    expect(g.bbox[0]).toBeCloseTo(10 * PT_PER_MM, 4);
  });

  it('throws when the zone box does not intersect the image box', () => {
    expect(() =>
      computeGeoreference({ page, placement, imageBox, zoneBox: { north: 90, south: 80, east: 90, west: 80 } })
    ).toThrow();
  });
});

describe('applyGeoreference', () => {
  async function blankPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([842, 595]);
    return doc.save();
  }

  it('adds a /VP viewport with a /GEO measure to the first page', async () => {
    const geo = {
      bbox: [100, 50, 700, 500] as [number, number, number, number],
      gpts: [2.5, 5, 7.5, 5, 7.5, 15, 2.5, 15],
      lpts: [0, 0, 0, 1, 1, 1, 1, 0],
    };
    const out = await applyGeoreference(await blankPdf(), geo);

    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);
    const vp = page.node.lookup(PDFName.of('VP'), PDFArray);
    expect(vp.size()).toBe(1);

    const viewport = vp.lookup(0, PDFDict);
    const bbox = viewport.lookup(PDFName.of('BBox'), PDFArray);
    expect(bbox.asArray().map((n) => (n as PDFNumber).asNumber())).toEqual([100, 50, 700, 500]);

    const measure = viewport.lookup(PDFName.of('Measure'), PDFDict);
    expect(measure.get(PDFName.of('Subtype'))).toBe(PDFName.of('GEO'));
    const gpts = measure.lookup(PDFName.of('GPTS'), PDFArray);
    expect(gpts.asArray().map((n) => (n as PDFNumber).asNumber())).toEqual(geo.gpts);
    const lpts = measure.lookup(PDFName.of('LPTS'), PDFArray);
    expect(lpts.size()).toBe(8);

    const gcs = measure.lookup(PDFName.of('GCS'), PDFDict);
    expect(gcs.lookup(PDFName.of('EPSG'), PDFNumber).asNumber()).toBe(4326);
  });

  it('keeps the original page count and returns a valid PDF', async () => {
    const out = await applyGeoreference(await blankPdf(), {
      bbox: [0, 0, 10, 10],
      gpts: [0, 0, 1, 0, 1, 1, 0, 1],
      lpts: [0, 0, 0, 1, 1, 1, 1, 0],
    });
    expect(new TextDecoder().decode(out.slice(0, 5))).toBe('%PDF-');
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});

describe('applyGeoreference on a jsPDF document', () => {
  it('georeferences a PDF produced by jsPDF (the app\'s generator)', async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
    pdf.text('carte', 20, 20);
    const out = await applyGeoreference(new Uint8Array(pdf.output('arraybuffer')), {
      bbox: [30, 30, 500, 400],
      gpts: [0, 0, 1, 0, 1, 1, 0, 1],
      lpts: [0, 0, 0, 1, 1, 1, 1, 0],
    });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.lookup(PDFName.of('VP'), PDFArray).size()).toBe(1);
  });
});
