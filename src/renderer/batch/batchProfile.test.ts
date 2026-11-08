import { describe, it, expect } from 'vitest';
import { parseBatchProfile, serializeBatchProfile, defaultBatchProfile, BatchProfile } from './batchProfile';
import { DEFAULT_PAGE_SETTINGS } from './pagePlan';
import { MAPS_STYLE, OSM_CARTO_STYLE } from '../presets/defaultPresets';
import { DEFAULT_EXPORT_OPTIONS } from '../hooks/usePreferences';
import { migrateStyle } from '../presets/migrateStyle';

function profileOf(json: unknown): BatchProfile {
  const result = parseBatchProfile(typeof json === 'string' ? json : JSON.stringify(json));
  if (!result.ok) throw new Error(`Refused: ${result.message}`);
  return result.profile;
}

function refusalOf(json: unknown): string {
  const result = parseBatchProfile(typeof json === 'string' ? json : JSON.stringify(json));
  if (result.ok) throw new Error('Accepted');
  return result.message;
}

describe('defaultBatchProfile', () => {
  it('exports PDF in the Maps style, with the export options and page settings of the application', () => {
    const profile = defaultBatchProfile();
    expect(profile.formats).toEqual(['pdf']);
    expect(profile.style.backgroundColor).toBe(MAPS_STYLE.backgroundColor);
    expect(profile.page).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(profile.export.maxExportSizeEnabled).toBe(DEFAULT_EXPORT_OPTIONS.maxExportSizeEnabled);
    expect(profile.export.maxExportSizeKB).toBe(DEFAULT_EXPORT_OPTIONS.maxExportSizeKB);
  });
});

describe('parseBatchProfile', () => {
  it('reads back a profile it wrote', () => {
    const profile: BatchProfile = {
      ...defaultBatchProfile(),
      // The application writes styles that are up to date
      style: migrateStyle(structuredClone(OSM_CARTO_STYLE)),
      formats: ['pdf', 'png', 'jpeg', 'svg'],
      page: { ...DEFAULT_PAGE_SETTINGS, formats: ['a3'], dpi: 150 },
    };
    profile.export.maxExportSizeKB = 2048;
    profile.export.showCompass = false;
    expect(profileOf(serializeBatchProfile(profile))).toEqual(profile);
  });

  it('completes a partial profile with the defaults', () => {
    const profile = profileOf({ formats: ['png'], export: { maxExportSizeKB: 500 }, page: { dpi: 200 } });
    const defaults = defaultBatchProfile();
    expect(profile.formats).toEqual(['png']);
    expect(profile.style).toEqual(defaults.style);
    expect(profile.export).toEqual({ ...defaults.export, maxExportSizeKB: 500 });
    expect(profile.page).toEqual({ ...defaults.page, dpi: 200 });
  });

  it('brings an older style up to date and keeps only real colors', () => {
    const style = structuredClone(MAPS_STYLE) as any;
    delete style.highway.footway;
    style.backgroundColor = 'rgb(255, 0, 0)';
    style.interiorColor = '</style><script>';
    const profile = profileOf({ style });
    expect(profile.style.highway.footway).toEqual(profile.style.highway.path);
    expect(profile.style.backgroundColor).toBe('#ff0000');
    expect(profile.style.interiorColor).toBe('#ffffff');
  });

  it('ignores fields it does not know', () => {
    const profile = profileOf({ formats: ['pdf'], colorOverrides: { 12: '#ff0000' }, export: { kmlAlongside: true } });
    expect(profile).not.toHaveProperty('colorOverrides');
    expect(profile.export).not.toHaveProperty('kmlAlongside');
  });

  describe('refusals, with a French message', () => {
    it('refuses text that is not a JSON object', () => {
      expect(refusalOf('{ not json')).toMatch(/JSON/);
      expect(refusalOf('[]')).toMatch(/\S/);
      expect(refusalOf('null')).toMatch(/\S/);
    });

    it('refuses formats it cannot export', () => {
      expect(refusalOf({ formats: [] })).toMatch(/format/i);
      expect(refusalOf({ formats: ['gif'] })).toContain('gif');
      expect(refusalOf({ formats: 'pdf' })).toMatch(/format/i);
    });

    it('refuses a style without its feature groups', () => {
      expect(refusalOf({ style: { backgroundColor: '#ffffff' } })).toMatch(/style/i);
      expect(refusalOf({ style: 'maps' })).toMatch(/style/i);
    });

    it('refuses export options of the wrong type or out of range', () => {
      expect(refusalOf({ export: { maxExportSizeKB: 'big' } })).toContain('maxExportSizeKB');
      expect(refusalOf({ export: { maxExportSizeKB: 0 } })).toContain('maxExportSizeKB');
      expect(refusalOf({ export: { minQualityPercent: 150 } })).toContain('minQualityPercent');
      expect(refusalOf({ export: { exteriorOverlayOpacity: 2 } })).toContain('exteriorOverlayOpacity');
      expect(refusalOf({ export: { showPOI: 'yes' } })).toContain('showPOI');
      expect(refusalOf({ export: { borderColor: 'nonsense' } })).toContain('borderColor');
    });

    it('refuses page settings that cannot give a page', () => {
      expect(refusalOf({ page: { formats: ['a5'] } })).toContain('a5');
      expect(refusalOf({ page: { formats: [] } })).toMatch(/\S/);
      expect(refusalOf({ page: { dpi: -1 } })).toContain('dpi');
      expect(refusalOf({ page: { minZoom: 18, maxZoom: 16 } })).toMatch(/zoom/i);
    });
  });
});
