import { describe, it, expect } from 'vitest';
import { cartoTileUrl } from './basemap';

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
