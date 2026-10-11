/**
 * Path options for restyling an existing overlay layer in place,
 * kept consistent with what createOSMOverlay draws initially.
 */

import L from 'leaflet';
import { FeatureStyle, RailwayKey, RenderStyle } from '../types';
import {
  resolveStrokeColor, resolveRailwayStyle, scaleRoadWeight, applyTunnelStyle, areaPaint, AreaPaint, casingOpacityOf,
} from './styleResolvers';
import { getDashArray, getCasingDashArray, isCasingHidden } from './lineStyles';

// Metadata createOSMOverlay attaches to each layer
export interface OverlayLayerMeta {
  wayCategory?: string;
  styleType?: string;
  isCasing?: boolean;
  roadWeight?: { fill: number; casing: number };  // Default road or railway width, before the width scale
  railwayType?: RailwayKey;  // Railway rail base (casing) or ties, by railway type
  underground?: boolean;     // Road in a tunnel or underground waterway: drawn with the tunnel style
  waterwayWidth?: number;    // Waterway line width
}

// Width, dashes, line ends and opacity of a waterway layer
export function waterwayLayerStyle(waterwayStyle: FeatureStyle, width: number): L.PathOptions {
  const dashArray = getDashArray(waterwayStyle.lineStyle, width);
  return {
    weight: width,
    dashArray: dashArray ? dashArray.join(',') : undefined,
    lineCap: dashArray ? 'butt' : 'round',
    opacity: waterwayStyle.lineStyle === 'none' ? 0 : waterwayStyle.opacity,
  };
}

/**
 * Width, dashes, line ends and opacity of a road or railway layer (its casing or
 * its fill), from its default width. Shared by createOSMOverlay and in-place restyles.
 */
export function lineLayerStyle(
  featureStyle: FeatureStyle,
  baseWeight: { fill: number; casing: number },
  part: 'fill' | 'casing'
): L.PathOptions {
  const weight = scaleRoadWeight(baseWeight, featureStyle);
  const dashArray = part === 'casing'
    ? getCasingDashArray(featureStyle, weight.fill)
    : getDashArray(featureStyle.lineStyle, weight.fill);
  // Hidden lines stay on the map, fully transparent
  const hidden = part === 'casing' ? isCasingHidden(featureStyle) : featureStyle.lineStyle === 'none';
  return {
    weight: weight[part],
    // An explicit undefined clears the dashes of a layer that was dashed before
    dashArray: dashArray ? dashArray.join(',') : undefined,
    lineCap: dashArray ? 'butt' : 'round',
    opacity: hidden ? 0 : part === 'casing' ? casingOpacityOf(featureStyle) : featureStyle.opacity,
  };
}

// Path options of a filled area; areas without an outline keep a transparent zero-width stroke
export function areaPathOptions(paint: AreaPaint): L.PathOptions {
  return {
    fillColor: paint.fill,
    fillOpacity: paint.fillOpacity,
    color: paint.stroke ?? paint.fill,
    weight: paint.stroke ? paint.strokeWidth : 0,
    opacity: paint.stroke ? paint.strokeOpacity : 0,
    // An explicit undefined clears the dashes of a layer that was dashed before
    dashArray: paint.dashArray ? paint.dashArray.join(',') : undefined,
    lineCap: paint.dashArray ? 'butt' : 'round',
  };
}

// Opacity of a layer restyled without its default width (layers created before widths were kept)
function roadOpacity(featureStyle: FeatureStyle, part: 'fill' | 'casing'): number {
  const hidden = part === 'casing' ? isCasingHidden(featureStyle) : featureStyle.lineStyle === 'none';
  return hidden ? 0 : part === 'casing' ? casingOpacityOf(featureStyle) : featureStyle.opacity;
}

function featureStyleOf(group: Record<string, FeatureStyle>, styleType: string): FeatureStyle | undefined {
  return Object.prototype.hasOwnProperty.call(group, styleType) ? group[styleType] : undefined;
}

export function getOverlayLayerStyle(
  layer: OverlayLayerMeta,
  style: RenderStyle,
  overrideColor?: string
): L.PathOptions | null {
  const { wayCategory, styleType, isCasing, roadWeight, railwayType, underground, waterwayWidth } = layer;
  // Roads in tunnels and underground waterways keep their tunnel style
  const highwayStyleOf = (type: string) => {
    const highwayStyle = featureStyleOf(style.highway, type);
    return highwayStyle && underground ? applyTunnelStyle(highwayStyle, style.highwayTunnel) : highwayStyle;
  };

  if (railwayType && roadWeight) {
    const railwayStyle = resolveRailwayStyle(style, railwayType);
    const part = isCasing ? 'casing' : 'fill';
    return {
      color: isCasing ? resolveStrokeColor(railwayStyle) : railwayStyle.color,
      ...lineLayerStyle(railwayStyle, roadWeight, part),
    };
  }

  if (!styleType) return null;

  // Casings of overridden roads are derived from the override color, like the SVG export
  if (isCasing) {
    const highwayStyle = highwayStyleOf(styleType);
    if (!highwayStyle) return null;
    const color = resolveStrokeColor(highwayStyle, overrideColor);
    return roadWeight
      ? { color, ...lineLayerStyle(highwayStyle, roadWeight, 'casing') }
      : { color, opacity: roadOpacity(highwayStyle, 'casing') };
  }

  switch (wayCategory) {
    case 'building':
    case 'natural':
    case 'landuse': {
      const paint = areaPaint(style, wayCategory, styleType, overrideColor);
      return paint ? areaPathOptions(paint) : null;
    }
    case 'highway': {
      const highwayStyle = highwayStyleOf(styleType);
      if (!highwayStyle) return null;
      const color = overrideColor || highwayStyle.color;
      return roadWeight
        ? { color, ...lineLayerStyle(highwayStyle, roadWeight, 'fill') }
        : { color, opacity: roadOpacity(highwayStyle, 'fill') };
    }
    case 'waterway': {
      const surfaceStyle = featureStyleOf(style.waterway, styleType);
      if (!surfaceStyle) return null;
      const waterwayStyle = underground ? applyTunnelStyle(surfaceStyle, style.waterwayTunnel) : surfaceStyle;
      const color = overrideColor || waterwayStyle.color;
      return waterwayWidth
        ? { color, ...waterwayLayerStyle(waterwayStyle, waterwayWidth) }
        : { color, opacity: waterwayStyle.lineStyle === 'none' ? 0 : waterwayStyle.opacity };
    }
    default:
      return null;
  }
}
