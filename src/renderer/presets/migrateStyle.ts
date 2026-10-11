import { FeatureStyle, RailwayKey, RenderStyle } from '../types';
import { RAILWAY_TYPES } from '../utils/styleResolvers';

/**
 * Bring a style saved by an older version (custom presets) up to date,
 * so it renders as it did when it was saved.
 */
export function migrateStyle(style: RenderStyle): RenderStyle {
  // Add construction building style if missing (added in v1.7.9)
  if (style.building && !style.building.construction) {
    style.building.construction = { color: '#f0f0f0', opacity: 0.6, strokeColor: '#c0c0c0' };
  }
  // Footways used to be drawn with the path style
  if (style.highway && !style.highway.footway && style.highway.path) {
    style.highway.footway = { ...style.highway.path };
  }
  // Railways used to have a single style for every railway type
  const railway: unknown = style.railway;
  if (railway && typeof (railway as FeatureStyle).color === 'string') {
    style.railway = Object.fromEntries(
      RAILWAY_TYPES.map(type => [type, { ...(railway as FeatureStyle) }])
    ) as Record<RailwayKey, FeatureStyle>;
  }
  return style;
}
