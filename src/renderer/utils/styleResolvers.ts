/**
 * Resolve optional style settings to the concrete colors used by the
 * SVG export and the Leaflet overlay, so both renderers stay consistent.
 */

import { FeatureStyle, LabelStyle, RenderStyle } from '../types';
import { deriveCasingColor } from './geometry';

// Label colors used before labels became configurable
export const DEFAULT_LABEL_STYLE: Readonly<LabelStyle> = {
  roadColor: '#333333',
  areaColor: '#2d5a27',
  waterColor: '#1a5276',
  forestColor: '#1e5631',
  houseNumberColor: '#000000',
  haloColor: '#ffffff',
};

/**
 * Outline color of a feature: an element override recolors the outline from the
 * override color, otherwise the explicit strokeColor wins over the derived one.
 */
export function resolveStrokeColor(featureStyle: FeatureStyle, overrideColor?: string): string {
  if (overrideColor) return deriveCasingColor(overrideColor);
  return featureStyle.strokeColor || deriveCasingColor(featureStyle.color);
}

/**
 * Road width once the width scale of its highway style is applied: the fill is
 * scaled, the casing keeps the same border around it. Invalid scales are ignored.
 */
export function scaleRoadWeight<T extends { fill: number; casing: number }>(weight: T, featureStyle: FeatureStyle): T {
  const scale = featureStyle.widthScale;
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return { ...weight };
  const fill = weight.fill * scale;
  return { ...weight, fill, casing: fill + (weight.casing - weight.fill) };
}

// Label colors end up in SVG CSS and in Leaflet HTML, and may come from imported
// rulesets: only plain hex, named or rgb()/rgba() colors are let through
const SAFE_COLOR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|rgba?\([\d\s.,%]+\))$/i;

export function resolveLabelStyle(style: RenderStyle): LabelStyle {
  const resolved: LabelStyle = { ...DEFAULT_LABEL_STYLE };
  for (const key of Object.keys(resolved) as (keyof LabelStyle)[]) {
    const color = style.labels?.[key];
    if (color && SAFE_COLOR.test(color)) resolved[key] = color;
  }
  return resolved;
}
