import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bestUnderLimit, encodePngUnderLimit, encodeJpegUnderLimit, buildGeoPdf, dataUrlSizeKB } from './rasterExport';
import { ExportFrame } from './svgGenerator';

const frame: ExportFrame = {
  width: 1400,
  height: 1000,
  content: { x: 100, y: 100, width: 1200, height: 800 },
  bounds: { north: 48.858, south: 48.854, east: 2.356, west: 2.35 },
};

describe('dataUrlSizeKB', () => {
  it('gives the decoded size of the base64 payload', () => {
    // 4 base64 characters are 3 bytes
    expect(dataUrlSizeKB(`data:image/png;base64,${'A'.repeat(4096)}`)).toBeCloseTo(3, 1);
  });
});

describe('bestUnderLimit', () => {
  // A fake encoding whose size in KB is 1000 x the parameter
  const encoder = () => {
    const calls: number[] = [];
    const encode = (parameter: number) => { calls.push(parameter); return parameter; };
    return { calls, encode, sizeKB: (value: number) => value * 1000 };
  };

  it('keeps the highest setting when it fits, trying nothing else', async () => {
    const { calls, encode, sizeKB } = encoder();
    const result = await bestUnderLimit(encode, sizeKB, 0.25, 0.95, 2000);
    expect(result).toEqual({ data: 0.95, sizeKB: 950, overLimit: false });
    expect(calls).toEqual([0.95]);
  });

  it('gives the lowest setting, marked over the limit, when even it does not fit', async () => {
    const { calls, encode, sizeKB } = encoder();
    const result = await bestUnderLimit(encode, sizeKB, 0.25, 0.95, 100);
    expect(result).toEqual({ data: 0.25, sizeKB: 250, overLimit: true });
    expect(calls).toEqual([0.95, 0.25]);
  });

  it('finds by bisection the highest setting that fits, in at most eight encodings', async () => {
    const { calls, encode, sizeKB } = encoder();
    const steps: number[] = [];
    const result = await bestUnderLimit(encode, sizeKB, 0.25, 0.95, 500, step => steps.push(step));
    expect(result.overLimit).toBe(false);
    expect(result.sizeKB).toBeLessThanOrEqual(500);
    expect(result.data).toBeGreaterThan(0.48);
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(steps.length).toBeGreaterThan(0);
  });
});

describe('canvas encodings', () => {
  // jsdom draws nothing: the stubbed canvas encodes a payload whose size follows its area
  // (PNG) or the JPEG quality, and records what was asked
  let pngBytesPerPixel = 1;
  beforeEach(() => {
    pngBytesPerPixel = 1;
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
    });
    URL.createObjectURL = () => 'blob:svg';
    URL.revokeObjectURL = () => {};
    (HTMLCanvasElement.prototype as any).getContext = () => new Proxy({
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }, { get: (target: any, key) => target[key] ?? (() => {}) });
    (HTMLCanvasElement.prototype as any).toDataURL = function (this: HTMLCanvasElement, type: string, quality = 0.92) {
      const bytes = type === 'image/png'
        ? this.width * this.height * pngBytesPerPixel
        : this.width * this.height * quality;
      return `data:${type};base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"></svg>';
  const size = { width: 1000, height: 1000 };

  it('lowers the PNG scale until the image fits the limit, never under the minimum', async () => {
    // 1 byte per pixel: 1000 KB at scale 1, 250 KB at scale 0.5
    const result = await encodePngUnderLimit(svg, size, { minScale: 0.25, maxScale: 1, maxKB: 300 });
    expect(result.overLimit).toBe(false);
    expect(result.sizeKB).toBeLessThanOrEqual(300);
    expect(result.sizeKB).toBeGreaterThan(200);
  });

  it('keeps the PNG at its full scale when it fits', async () => {
    const result = await encodePngUnderLimit(svg, size, { minScale: 0.25, maxScale: 0.5, maxKB: 1000 });
    expect(result.sizeKB).toBeCloseTo(244, 0);
  });

  it('marks a PNG that does not fit even at the minimum scale, with fewer colors', async () => {
    pngBytesPerPixel = 100;
    const result = await encodePngUnderLimit(svg, size, { minScale: 0.25, maxScale: 1, maxKB: 10 });
    expect(result.overLimit).toBe(true);
    expect(result.data.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('lowers the JPEG quality until the image fits', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    // 950 KB at 0.95 quality: 500 KB needs about 0.5
    const result = await encodeJpegUnderLimit(canvas, { minQuality: 0.25, maxKB: 500 });
    expect(result.overLimit).toBe(false);
    expect(result.sizeKB).toBeLessThanOrEqual(500);
    expect(result.sizeKB).toBeGreaterThan(400);
  });

  describe('buildGeoPdf', () => {
    // MediaBox of the first page, in points
    const mediaBox = (buffer: ArrayBuffer) => {
      const text = new TextDecoder('latin1').decode(buffer);
      return text.match(/\/MediaBox \[([^\]]+)\]/)![1].trim().split(/\s+/).map(Number);
    };
    const canvas = () => {
      const c = document.createElement('canvas');
      c.width = 140;
      c.height = 100;
      return c;
    };

    it('lays the map on A4, turned like the image, by default (the application export)', () => {
      const box = mediaBox(buildGeoPdf(canvas(), frame, 0.9));
      expect(box[2]).toBeCloseTo(841.89, 1);
      expect(box[3]).toBeCloseTo(595.28, 1);
    });

    it('lays the map on the page format and orientation it is given', () => {
      const box = mediaBox(buildGeoPdf(canvas(), frame, 0.9, { format: 'a3', orientation: 'portrait', marginMm: 10 }));
      expect(box[2]).toBeCloseTo(841.89, 1);
      expect(box[3]).toBeCloseTo(1190.55, 1);
    });

    it('georeferences the page', () => {
      const text = new TextDecoder('latin1').decode(buildGeoPdf(canvas(), frame, 0.9));
      expect(text).toContain('/Subtype /GEO');
      expect(text).toContain('/GPTS [48.854 2.35 48.858 2.35 48.858 2.356 48.854 2.356]');
    });
  });
});
