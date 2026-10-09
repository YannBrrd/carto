import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildKmz, dataUrlToBytes, KMZ_IMAGE_PATH } from './kmzPackager';

describe('dataUrlToBytes', () => {
  it('decodes a base64 data URL', () => {
    // "Hello" => SGVsbG8=
    const bytes = dataUrlToBytes('data:image/png;base64,SGVsbG8=');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it('throws on a malformed data URL', () => {
    expect(() => dataUrlToBytes('not a data url')).toThrow();
  });
});

describe('buildKmz', () => {
  const kml = '<kml>doc</kml>';
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

  it('zips doc.kml first, plus the image at the declared path', () => {
    const kmz = buildKmz(kml, png);
    const files = unzipSync(kmz);
    expect(Object.keys(files)[0]).toBe('doc.kml');
    expect(strFromU8(files['doc.kml'])).toBe(kml);
    expect(Array.from(files[KMZ_IMAGE_PATH])).toEqual(Array.from(png));
  });

  it('exposes an image path that is relative and inside the archive', () => {
    expect(KMZ_IMAGE_PATH).toBe('files/carte.png');
  });

  it('omits the image when none is given', () => {
    const files = unzipSync(buildKmz(kml));
    expect(Object.keys(files)).toEqual(['doc.kml']);
  });
});
