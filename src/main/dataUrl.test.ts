import { describe, it, expect } from 'vitest';
import { decodeDataUrl } from './dataUrl';

const PNG_PREFIX = /^data:image\/png;base64,/;
// 1 x 1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('decodeDataUrl', () => {
  it('decodes the bytes of an image of the expected type', () => {
    const bytes = decodeDataUrl(PNG, PNG_PREFIX)!;
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('refuses what a canvas too large to encode gives', () => {
    expect(decodeDataUrl('data:,', PNG_PREFIX)).toBeNull();
  });

  it('refuses an image of another type and an empty image', () => {
    expect(decodeDataUrl('data:image/jpeg;base64,/9j/4AAQ', PNG_PREFIX)).toBeNull();
    expect(decodeDataUrl('data:image/png;base64,', PNG_PREFIX)).toBeNull();
  });
});
