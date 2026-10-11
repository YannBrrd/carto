/**
 * Path options for restyling an existing overlay layer in place,
 * kept consistent with what createOSMOverlay draws initially.
 */

import L from 'leaflet';
import { FeatureStyle, RenderStyle } from '../types';
import { resolveStrokeColor, scaleRoadWeight } from './styleResolvers';
import { getDashArray } from './lineStyles';

// Metadata createOSMOverlay attaches to each layer
export interface OverlayLayerMeta {
  wayCategory?: string;
  styleType?: string;
  isCasing?: boolean;
  roadWeight?: { fill: number; casing: number };  // Default road width, before the width scale
}

// Width and dash pattern of a road layer created with its default width
function roadLineOptions(
  highwayStyle: FeatureStyle,
  roadWeight: { fill: number; casing: number },
  part: 'fill' | 'casing'
): L.PathOptions {
  const weight = scaleRoadWeight(roadWeight, highwayStyle);
  const dashArray = getDashArray(highwayStyle.lineStyle, weight.fill);
  return {
    weight: weight[part],
    // An explicit undefined clears the dashes of a layer that was dashed before
    dashArray: dashArray ? dashArray.join(',') : undefined,
    lineCap: dashArray ? 'butt' : 'round',
  };
}

// Roads whose line style is none stay on the map, fully transparent
function roadOpacity(highwayStyle: FeatureStyle): number {
  return highwayStyle.lineStyle === 'none' ? 0 : highwayStyle.opacity;
}

function featureStyleOf(group: Record<string, FeatureStyle>, styleType: string): FeatureStyle | undefined {
  return Object.prototype.hasOwnProperty.call(group, styleType) ? group[styleType] : undefined;
}

export function getOverlayLayerStyle(
  layer: OverlayLayerMeta,
  style: RenderStyle,
  overrideColor?: string
): L.PathOptions | null {
  const { wayCategory, styleType, isCasing, roadWeight } = layer;
  if (!styleType) return null;

  // Casings carry no category or way id, so element overrides never reach them
  if (isCasing) {
    const highwayStyle = featureStyleOf(style.highway, styleType);
    if (!highwayStyle) return null;
    const options: L.PathOptions = { color: resolveStrokeColor(highwayStyle), opacity: roadOpacity(highwayStyle) };
    return roadWeight ? { ...options, ...roadLineOptions(highwayStyle, roadWeight, 'casing') } : options;
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
      const options: L.PathOptions = { color: overrideColor || highwayStyle.color, opacity: roadOpacity(highwayStyle) };
      return roadWeight ? { ...options, ...roadLineOptions(highwayStyle, roadWeight, 'fill') } : options;
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
