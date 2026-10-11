/**
 * Dash patterns of the Maperitive line styles, shared by the SVG export and the
 * map overlay. Lengths are multiples of the line width, so dashes keep their
 * proportions on wide and narrow roads; they are drawn with flat (butt) ends.
 */

import { LineStyle } from '../types';

const DASH_PATTERNS: Record<Exclude<LineStyle, 'solid' | 'none'>, number[]> = {
  dot: [1, 1],
  dash: [3, 2],
  dashlong: [6, 2],
  dashdot: [4, 1.5, 1, 1.5],
  dashdotdot: [4, 1.5, 1, 1.5, 1, 1.5],
};

const LINE_STYLES: readonly LineStyle[] = ['solid', 'dot', 'dash', 'dashlong', 'dashdot', 'dashdotdot', 'none'];

export function isLineStyle(value: unknown): value is LineStyle {
  return typeof value === 'string' && (LINE_STYLES as readonly string[]).includes(value);
}

/**
 * Dash lengths for a line of the given width, or null for a continuous line.
 * Unknown styles (e.g. from an imported preset) are drawn solid.
 */
export function getDashArray(lineStyle: LineStyle | undefined, width: number): number[] | null {
  if (!lineStyle || lineStyle === 'solid' || lineStyle === 'none' || !isLineStyle(lineStyle)) return null;
  return DASH_PATTERNS[lineStyle].map(length => length * width);
}
