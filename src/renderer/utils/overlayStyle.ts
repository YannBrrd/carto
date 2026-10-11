/**
 * Path options for restyling an existing overlay layer in place,
 * kept consistent with what createOSMOverlay draws initially.
 */

import L from 'leaflet';
import { FeatureStyle, RenderStyle } from '../types';
import { resolveStrokeColor, resolveRailwayStyle, scaleRoadWeight } from './styleResolvers';
import { getDashArray, getCasingDashArray, isCasingHidden } from './lineStyles';

// Metadata createOSMOverlay attaches to each layer
export interface OverlayLayerMeta {
  wayCategory?: string;
  styleType?: string;
  isCasing?: boolean;
  roadWeight?: { fill: number; casing: number };  // Default road or railway width, before the width scale
  railway?: boolean;  // Railway rail base (casing) or ties
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
  const { wayCategory, styleType, isCasing, roadWeight, railway } = layer;

  if (railway && roadWeight) {
    const railwayStyle = resolveRailwayStyle(style);
    const part = isCasing ? 'casing' : 'fill';
    return {
      color: isCasing ? resolveStrokeColor(railwayStyle) : railwayStyle.color,
      ...lineLayerStyle(railwayStyle, roadWeight, part),
    };
  }

  if (!styleType) return null;

  // Casings carry no category or way id, so element overrides never reach them
  if (isCasing) {
    const highwayStyle = featureStyleOf(style.highway, styleType);
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
      const highwayStyle = featureStyleOf(style.highway, styleType);
      if (!highwayStyle) return null;
      const color = overrideColor || highwayStyle.color;
      return roadWeight
        ? { color, ...lineLayerStyle(highwayStyle, roadWeight, 'fill') }
        : { color, opacity: roadOpacity(highwayStyle, 'fill') };
    }
    case 'waterway': {
      const waterwayStyle = featureStyleOf(style.waterway, styleType);
      return waterwayStyle ? { color: overrideColor || waterwayStyle.color, opacity: waterwayStyle.opacity } : null;
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
