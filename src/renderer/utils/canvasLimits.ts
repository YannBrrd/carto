/**
 * Limits of the canvases Chromium can draw and encode. Above them, drawing silently does
 * nothing and toDataURL answers "data:,".
 */

export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_435_456;

/** Largest scale, at most the one asked for, at which a width x height image fits a canvas */
export function clampCanvasScale(scale: number, width: number, height: number): number {
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  return Math.min(scale, bySide, byArea);
}

/** Whether a canvas encoded an image of the requested type */
export function isEncodedImage(dataUrl: string, type: 'png' | 'jpeg'): boolean {
  const prefix = `data:image/${type};base64,`;
  return dataUrl.startsWith(prefix) && dataUrl.length > prefix.length;
}
