/**
 * Resolve optional style settings to the concrete colors used by the
 * SVG export and the Leaflet overlay, so both renderers stay consistent.
 */

import { FeatureStyle, LabelStyle, RailwayKey, RenderStyle } from '../types';
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

// Railway look used before railways became configurable: white ties over a gray rail
export const DEFAULT_RAILWAY_STYLE: Readonly<FeatureStyle> = {
  color: '#ffffff',
  opacity: 1,
  strokeColor: '#8c8c8c',
  lineStyle: 'dash',
  casingLineStyle: 'solid',
};

export const RAILWAY_TYPES: readonly RailwayKey[] = ['rail', 'lightRail', 'tram', 'subway', 'tunnel'];

// Railway styles from bottom to top
export const RAILWAY_DRAW_ORDER: readonly RailwayKey[] = ['tunnel', 'subway', 'tram', 'lightRail', 'rail'];

// Tunnels through a building or under an avalanche shelter stay above ground
const ABOVE_GROUND_TUNNELS = ['no', 'building_passage', 'avalanche_protector'];

// A way below ground: in a tunnel, or explicitly located underground (layer alone is not enough: cuttings)
export function isUnderground(tags: Record<string, string | undefined>): boolean {
  const tunnel = tags.tunnel;
  return (tunnel !== undefined && !ABOVE_GROUND_TUNNELS.includes(tunnel)) || tags.location === 'underground';
}

// Railway style of an OSM railway way: tunnel when underground, otherwise its type;
// trains for any other railway (narrow gauge, funicular...)
export function getRailwayStyleKey(tags: Record<string, string | undefined>): RailwayKey {
  if (isUnderground(tags)) return 'tunnel';
  switch (tags.railway) {
    case 'light_rail': return 'lightRail';
    case 'tram': return 'tram';
    case 'subway': return 'subway';
    default: return 'rail';
  }
}

// Style of a railway type; the historical look when the style (or an imported one) lacks it.
// Styles saved before underground railways had a style draw them like trains.
export function resolveRailwayStyle(style: RenderStyle, type: RailwayKey): FeatureStyle {
  const railwayStyle = style.railway?.[type] ?? (type === 'tunnel' ? style.railway?.rail : undefined);
  return { ...(railwayStyle ?? DEFAULT_RAILWAY_STYLE) };
}

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
