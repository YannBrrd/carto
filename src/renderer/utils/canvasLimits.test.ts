import { describe, it, expect } from 'vitest';
import { clampCanvasScale, isEncodedImage, MAX_CANVAS_SIDE, MAX_CANVAS_AREA } from './canvasLimits';

describe('clampCanvasScale', () => {
  it('keeps the scale of an image that fits', () => {
    expect(clampCanvasScale(3, 2000, 1500)).toBe(3);
  });

  it('lowers the scale so that no side exceeds the browser limit', () => {
    const scale = clampCanvasScale(3, 10000, 2000);
    expect(10000 * scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(10000 * scale).toBeGreaterThan(MAX_CANVAS_SIDE - 1);
  });

  it('lowers the scale so that the area stays within the browser limit', () => {
    const scale = clampCanvasScale(2, 12000, 12000);
    expect(12000 * scale).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(12000 * scale * 12000 * scale).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });
});

describe('isEncodedImage', () => {
  it('accepts an image of the requested type', () => {
    expect(isEncodedImage('data:image/png;base64,iVBORw0KGgo=', 'png')).toBe(true);
    expect(isEncodedImage('data:image/jpeg;base64,/9j/4AAQ', 'jpeg')).toBe(true);
  });

  it('refuses what a canvas too large to encode gives, and another type', () => {
    expect(isEncodedImage('data:,', 'png')).toBe(false);
    expect(isEncodedImage('data:image/png;base64,', 'png')).toBe(false);
    expect(isEncodedImage('data:image/png;base64,iVBORw0KGgo=', 'jpeg')).toBe(false);
  });
});
