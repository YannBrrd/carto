import { describe, it, expect, vi, afterEach } from 'vitest';
import { cartoTileUrl, effectiveCartoKey, hasBuiltInCartoKey, CARTO_API_KEY_URL } from './basemap';

describe('cartoTileUrl', () => {
  it('points at the CARTO raster basemap of the given style, with retina tiles', () => {
    expect(cartoTileUrl('voyager_nolabels', '')).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png'
    );
    expect(cartoTileUrl('voyager_only_labels', '')).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
    );
  });

  it('adds the API key as the key parameter, which removes the watermark', () => {
    expect(cartoTileUrl('voyager_nolabels', 'cb1_abc')).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png?key=cb1_abc'
    );
  });

  it('ignores the spaces around the key and leaves the URL alone without a key', () => {
    expect(cartoTileUrl('voyager_nolabels', '  cb1_abc \n')).toMatch(/\?key=cb1_abc$/);
    expect(cartoTileUrl('voyager_nolabels', '   ')).not.toContain('?');
  });

  it('encodes the key so that it cannot change the rest of the URL', () => {
    expect(cartoTileUrl('voyager_nolabels', 'a&b={z}#c')).toMatch(/\?key=a%26b%3D%7Bz%7D%23c$/);
  });

  it('uses the key the build provides when none is given, and none in the tests', () => {
    expect(cartoTileUrl('voyager_nolabels')).toBe(cartoTileUrl('voyager_nolabels', ''));
  });
});

describe('effectiveCartoKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the key the user saved, without the spaces around it', () => {
    expect(effectiveCartoKey('  mine ')).toBe('mine');
  });

  it('has no key when neither the user nor the build provides one', () => {
    expect(effectiveCartoKey('')).toBe('');
    expect(hasBuiltInCartoKey()).toBe(false);
  });

  it('falls back to the key of the build, which the user key overrides', async () => {
    vi.stubGlobal('__CARTO_API_KEY__', ' built ');
    vi.resetModules();
    const basemap = await import('./basemap');
    expect(basemap.hasBuiltInCartoKey()).toBe(true);
    expect(basemap.effectiveCartoKey('')).toBe('built');
    expect(basemap.effectiveCartoKey('mine')).toBe('mine');
  });
});

describe('CARTO_API_KEY_URL', () => {
  it('points to the page named on the map watermark', () => {
    expect(CARTO_API_KEY_URL).toBe('https://carto.com/basemaps/apikey');
  });
});
