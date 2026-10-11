/**
 * Path options for restyling an existing overlay layer in place,
 * kept consistent with what createOSMOverlay draws initially.
 */

import L from 'leaflet';
import { FeatureStyle, RenderStyle } from '../types';
import { resolveStrokeColor, scaleRoadWeight } from './styleResolvers';

// Metadata createOSMOverlay attaches to each layer
export interface OverlayLayerMeta {
  wayCategory?: string;
  styleType?: string;
  isCasing?: boolean;
  roadWeight?: { fill: number; casing: number };  // Default road width, before the width scale
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
    const options: L.PathOptions = { color: resolveStrokeColor(highwayStyle), opacity: highwayStyle.opacity };
    if (roadWeight) options.weight = scaleRoadWeight(roadWeight, highwayStyle).casing;
    return options;
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
      const options: L.PathOptions = { color: overrideColor || highwayStyle.color, opacity: highwayStyle.opacity };
      if (roadWeight) options.weight = scaleRoadWeight(roadWeight, highwayStyle).fill;
      return options;
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
