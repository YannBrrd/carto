import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { planPage, printableArea, DEFAULT_PAGE_SETTINGS, PageSettings } from './pagePlan';
import { exportFrame, projectionAtZoom } from '../utils/svgGenerator';

// Bounds of width x height kilometers around Paris city hall
const LAT = 48.8566;
const LNG = 2.3522;
const KM_LAT = 1 / 111.2;
const KM_LNG = 1 / (111.2 * Math.cos((LAT * Math.PI) / 180));
const box = (widthKm: number, heightKm: number) => L.latLngBounds(
  [LAT - (heightKm / 2) * KM_LAT, LNG - (widthKm / 2) * KM_LNG],
  [LAT + (heightKm / 2) * KM_LAT, LNG + (widthKm / 2) * KM_LNG],
);

function accepted(bounds: L.LatLngBounds, settings: PageSettings = DEFAULT_PAGE_SETTINGS) {
  const plan = planPage(bounds, settings);
  if (!plan.ok) throw new Error(`Rejected: ${plan.message}`);
  return plan;
}

describe('printableArea', () => {
  it('gives the page inside its margin in pixels at the resolution, portrait', () => {
    // A4 at 300 dpi, 10 mm margins: 190 x 277 mm
    expect(printableArea('a4', 300, 10)).toEqual({ width: 2244, height: 3272 });
    expect(printableArea('a3', 300, 10)).toEqual({ width: 3272, height: 4724 });
    expect(printableArea('a4', 150, 10)).toEqual({ width: 1122, height: 1636 });
  });
});

describe('planPage', () => {
  it('puts a small territory on A4 at the default settings (A4 then A3, 300 dpi, zoom 15 at least)', () => {
    expect(DEFAULT_PAGE_SETTINGS).toMatchObject({ formats: ['a4', 'a3'], dpi: 300, minZoom: 15 });
    const plan = accepted(box(1, 1));
    expect(plan.format).toBe('a4');
    expect(plan.zoom).toBeGreaterThanOrEqual(15);
  });

  it('fills the printable area, keeping the proportions of the map', () => {
    const plan = accepted(box(1, 1.2));
    const area = printableArea(plan.format, 300, DEFAULT_PAGE_SETTINGS.marginMm);
    expect(plan.imageWidth).toBeLessThanOrEqual(area.width);
    expect(plan.imageHeight).toBeLessThanOrEqual(area.height);
    expect(plan.imageWidth >= area.width - 1 || plan.imageHeight >= area.height - 1).toBe(true);
    expect(plan.imageWidth / plan.imageHeight).toBeCloseTo(plan.frame.width / plan.frame.height, 2);
    expect(plan.imageWidth).toBe(Math.round(plan.frame.width * plan.rasterScale));
  });

  it('draws the map at the zoom it chose', () => {
    const bounds = box(1, 1);
    const plan = accepted(bounds);
    expect(plan.frame).toEqual(exportFrame(bounds, projectionAtZoom(plan.zoom)));
  });

  it('turns the page for a wide territory and keeps it upright for a tall one', () => {
    const wide = accepted(box(3, 1));
    expect(wide.orientation).toBe('landscape');
    expect(wide.imageWidth).toBeGreaterThan(wide.imageHeight);
    expect(accepted(box(1, 3)).orientation).toBe('portrait');
  });

  it('uses A3 when the territory is not readable on A4', () => {
    // 4 km square: under zoom 15 on A4, readable on A3
    expect(planPage(box(4, 4), { ...DEFAULT_PAGE_SETTINGS, formats: ['a4'] }).ok).toBe(false);
    const plan = accepted(box(4, 4));
    expect(plan.format).toBe('a3');
    expect(plan.zoom).toBeGreaterThanOrEqual(15);
  });

  it('rejects a territory too large for every format, naming the last one', () => {
    const plan = planPage(box(10, 10));
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('too-large');
      expect(plan.message).toContain('A3');
      expect(plan.message).toContain('15');
    }
  });

  it('does not zoom past the maximum on a tiny territory, and still fills the page', () => {
    const plan = accepted(box(0.05, 0.05));
    expect(plan.zoom).toBe(DEFAULT_PAGE_SETTINGS.maxZoom);
    expect(plan.rasterScale).toBeGreaterThan(1);
    const area = printableArea('a4', 300, DEFAULT_PAGE_SETTINGS.marginMm);
    expect(Math.max(plan.imageWidth - area.width, plan.imageHeight - area.height)).toBeGreaterThanOrEqual(-1);
  });

  it('follows the resolution', () => {
    const at300 = accepted(box(1, 1));
    const at150 = accepted(box(1, 1), { ...DEFAULT_PAGE_SETTINGS, dpi: 150 });
    expect(at150.imageWidth).toBeCloseTo(at300.imageWidth / 2, -1);
  });

  it('refuses settings that cannot give a page', () => {
    expect(() => planPage(box(1, 1), { ...DEFAULT_PAGE_SETTINGS, formats: [] })).toThrow();
    expect(() => planPage(box(1, 1), { ...DEFAULT_PAGE_SETTINGS, dpi: 0 })).toThrow();
    expect(() => planPage(box(1, 1), { ...DEFAULT_PAGE_SETTINGS, marginMm: 150 })).toThrow();
    expect(() => planPage(box(1, 1), { ...DEFAULT_PAGE_SETTINGS, minZoom: 18, maxZoom: 16 })).toThrow();
  });
});
