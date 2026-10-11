/**
 * Path options for restyling an existing overlay layer in place,
 * kept consistent with what createOSMOverlay draws initially.
 */

import L from 'leaflet';
import { FeatureStyle, RailwayKey, RenderStyle } from '../types';
import { resolveStrokeColor, resolveRailwayStyle, scaleRoadWeight, applyTunnelStyle } from './styleResolvers';
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
    opacity: hidden ? 0 : featureStyle.opacity,
  };
}

// Opacity of a layer restyled without its default width (layers created before widths were kept)
function roadOpacity(featureStyle: FeatureStyle, part: 'fill' | 'casing'): number {
  const hidden = part === 'casing' ? isCasingHidden(featureStyle) : featureStyle.lineStyle === 'none';
  return hidden ? 0 : featureStyle.opacity;
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

  // Casings carry no category or way id, so element overrides never reach them
  if (isCasing) {
    const highwayStyle = highwayStyleOf(styleType);
    if (!highwayStyle) return null;
    const color = resolveStrokeColor(highwayStyle);
    return roadWeight
      ? { color, ...lineLayerStyle(highwayStyle, roadWeight, 'casing') }
      : { color, opacity: roadOpacity(highwayStyle, 'casing') };
  }

  switch (wayCategory) {
    case 'building': {
      const buildingStyle = featureStyleOf(style.building, styleType);
      if (!buildingStyle) return null;
      const strokeEnabled = style.buildingStrokeEnabled !== false;
      return {
        fillColor: overrideColor || buildingStyle.color,
        color: resolveStrokeColor(buildingStyle, overrideColor),
        fillOpacity: buildingStyle.opacity,
        opacity: strokeEnabled ? buildingStyle.opacity : 0,
      };
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
    case 'natural': {
      const naturalStyle = featureStyleOf(style.natural, styleType);
      return naturalStyle ? { fillColor: overrideColor || naturalStyle.color, fillOpacity: naturalStyle.opacity } : null;
    }
    case 'landuse': {
      const landuseStyle = featureStyleOf(style.landuse, styleType);
      return landuseStyle
        ? { color: landuseStyle.color, fillColor: landuseStyle.color, fillOpacity: landuseStyle.opacity }
        : null;
    }
    default:
      return null;
  }
}
