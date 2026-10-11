/**
 * Converter utilities between Ruleset and legacy RenderStyle
 * Provides backwards compatibility during migration
 */

import { RenderStyle, FeatureStyle, LabelStyle } from '../types';
import { Ruleset, RenderRule, PropertyAssignment } from './types';
import { resolveValue } from './interpolator';
import { DEFAULT_FONT_FAMILY } from '../constants/fonts';
import { getRoadWeight, getRailwayWeight } from '../utils/roadWeights';
import { isLineStyle } from '../utils/lineStyles';

type HighwayKey = keyof RenderStyle['highway'];

// Road rules for a highway style, and their precedence when several target it:
// the residential, path and footway rules win over the service, track and pedestrian rules
const HIGHWAY_RULES: Array<{ key: HighwayKey; matches: (pattern: string) => boolean; precedence: number }> = [
  { key: 'motorway', matches: p => p.startsWith('highway_motorway'), precedence: 1 },
  { key: 'primary', matches: p => p.startsWith('highway_primary'), precedence: 1 },
  { key: 'secondary', matches: p => p.startsWith('highway_secondary'), precedence: 1 },
  { key: 'tertiary', matches: p => p.startsWith('highway_tertiary'), precedence: 1 },
  { key: 'residential', matches: p => p.includes('highway_residential'), precedence: 1 },
  { key: 'residential', matches: p => p.includes('highway_service'), precedence: 0 },
  { key: 'path', matches: p => p.includes('highway_path'), precedence: 1 },
  { key: 'path', matches: p => p.includes('highway_track'), precedence: 0 },
  { key: 'footway', matches: p => p.includes('highway_footway'), precedence: 1 },
  { key: 'footway', matches: p => p.includes('highway_pedestrian'), precedence: 0 },
  { key: 'cycleway', matches: p => p.includes('highway_cycleway'), precedence: 1 },
];

/**
 * Convert a Ruleset to the legacy RenderStyle format
 * This allows the rule engine to work with existing svgGenerator and osmOverlay
 */
export function rulesetToRenderStyle(ruleset: Ruleset, zoom: number = 16): RenderStyle {
  // Default style as fallback
  const defaultStyle: RenderStyle = {
    backgroundColor: (ruleset.properties['map-background-color'] as string)
      || (ruleset.properties['background-color'] as string) || '#f5f5f5',
    interiorColor: '#ffffff',
    exteriorGrayscale: true,
    borderColor: (ruleset.properties['border-color'] as string) || '#dadce0',
    borderWidth: (ruleset.properties['border-width'] as number) || 1,
    strokeOpacity: 0.8,
    fillOpacity: 0.1,
    highway: {
      motorway: { color: '#9ca3af', opacity: 1 },
      primary: { color: '#d1d5db', opacity: 1 },
      secondary: { color: '#e5e7eb', opacity: 1 },
      tertiary: { color: '#f3f4f6', opacity: 1 },
      residential: { color: '#ffffff', opacity: 1 },
      path: { color: '#d5d8db', opacity: 0.7 },
      footway: { color: '#d5d8db', opacity: 0.7 },
      cycleway: { color: '#4a80f5', opacity: 0.8 },
    },
    building: {
      residential: { color: '#e8e8e8', opacity: 1 },
      commercial: { color: '#e0e0e0', opacity: 1 },
      industrial: { color: '#d8d8d8', opacity: 1 },
      religious: { color: '#d4c4a8', opacity: 1 },
      construction: { color: '#f0f0f0', opacity: 0.6 },
      default: { color: '#e8e8e8', opacity: 1 },
    },
    buildingStrokeEnabled: true,
    landuse: {
      residential: { color: '#f5f5f5', opacity: 0.5 },
      commercial: { color: '#f0f0f0', opacity: 0.5 },
      industrial: { color: '#e8e8e8', opacity: 0.5 },
      farmland: { color: '#e8f5e9', opacity: 0.7 },
      forest: { color: '#c3ecb2', opacity: 1 },
    },
    natural: {
      water: { color: '#aadaff', opacity: 1 },
      wood: { color: '#c3ecb2', opacity: 1 },
      grassland: { color: '#bbdaa4', opacity: 0.8 },
      beach: { color: '#fff2af', opacity: 1 },
    },
    waterway: {
      river: { color: '#aadaff', opacity: 1 },
      stream: { color: '#aadaff', opacity: 0.8 },
      canal: { color: '#9bbff4', opacity: 1 },
      default: { color: '#aadaff', opacity: 1 },
    },
    fontSize: {
      roads: 1,
      areas: 1,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontBold: false,
    },
  };

  const haloColor = ruleset.properties['text-halo-color'];
  if (typeof haloColor === 'string') {
    defaultStyle.labels = { haloColor };
  }

  // Precedence of the rule that styled each highway level (and the railways) so far
  const highwayPrecedence: Partial<Record<HighwayKey, number>> = {};
  let railwayPrecedence = -1;

  // Extract styles from rules
  for (const rule of ruleset.rules) {
    const pattern = rule.target.featurePattern || '';

    // Get base properties
    const baseStyle = extractFeatureStyle(rule.properties, zoom);
    applyLabelColor(defaultStyle, pattern, rule.properties, zoom);

    // Apply to appropriate category
    const highwayRule = HIGHWAY_RULES.find(candidate => candidate.matches(pattern));
    if (highwayRule) {
      const { key, precedence } = highwayRule;
      if (precedence >= (highwayPrecedence[key] ?? -1)) {
        highwayPrecedence[key] = precedence;
        applyToHighway(defaultStyle, key, baseStyle, rule, zoom);
      }
    } else if (pattern.startsWith('railway')) {
      // Rail rules win over light rail, tram and other railway rules
      const precedence = pattern.startsWith('railway_rail') ? 1 : 0;
      if (precedence >= railwayPrecedence) {
        railwayPrecedence = precedence;
        defaultStyle.railway = lineFeatureStyle(baseStyle, rule, zoom, getRailwayWeight().fill);
      }
    } else if (pattern.includes('building')) {
      applyToBuilding(defaultStyle, pattern, baseStyle, rule, zoom);
    } else if (pattern.includes('natural_water')) {
      defaultStyle.natural.water = baseStyle;
    } else if (pattern.includes('natural_wood')) {
      // The wood feature also matches landuse=forest, drawn with the forest landuse style
      defaultStyle.natural.wood = baseStyle;
      defaultStyle.landuse.forest = { ...baseStyle };
    } else if (pattern.includes('natural_grassland')) {
      defaultStyle.natural.grassland = baseStyle;
    } else if (pattern.includes('natural_beach')) {
      defaultStyle.natural.beach = baseStyle;
    } else if (pattern.includes('landuse_residential')) {
      defaultStyle.landuse.residential = baseStyle;
    } else if (pattern.includes('landuse_commercial')) {
      defaultStyle.landuse.commercial = baseStyle;
    } else if (pattern.includes('landuse_industrial')) {
      defaultStyle.landuse.industrial = baseStyle;
    } else if (pattern.includes('landuse_farmland')) {
      defaultStyle.landuse.farmland = baseStyle;
    } else if (pattern.includes('waterway_river')) {
      defaultStyle.waterway.river = baseStyle;
    } else if (pattern.includes('waterway_stream')) {
      defaultStyle.waterway.stream = baseStyle;
    } else if (pattern.includes('waterway_canal')) {
      defaultStyle.waterway.canal = baseStyle;
    } else if (pattern === 'waterway*') {
      for (const key of ['river', 'stream', 'canal', 'default'] as const) {
        defaultStyle.waterway[key] = { ...baseStyle };
      }
    }
  }

  return defaultStyle;
}

/**
 * Label colors come from the text-color of the rules drawing the labelled features
 */
function applyLabelColor(
  style: RenderStyle,
  pattern: string,
  properties: PropertyAssignment[],
  zoom: number
): void {
  const textColor = properties.find(prop => prop.property === 'text-color');
  if (!textColor) return;
  const color = resolveValue(textColor.value, zoom);
  if (typeof color !== 'string') return;

  let key: keyof LabelStyle | undefined;
  if (pattern.startsWith('highway')) key = 'roadColor';
  else if (pattern.startsWith('natural_water') || pattern.startsWith('waterway')) key = 'waterColor';
  else if (pattern.startsWith('natural_wood')) key = 'forestColor';
  else if (pattern.startsWith('natural_') || pattern.startsWith('landuse')) key = 'areaColor';
  if (key) {
    style.labels = { ...style.labels, [key]: expandShortHex(color) };
  }
}

// '#abc' -> '#aabbcc': color inputs and casing derivation only read six-digit hex
function expandShortHex(color: string): string {
  const match = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return match ? `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`.toLowerCase() : color;
}

/**
 * Extract FeatureStyle from property assignments.
 * Areas are filled and outlined by their line; lines are drawn over a border (casing).
 */
function extractFeatureStyle(properties: PropertyAssignment[], zoom: number): FeatureStyle {
  const values = new Map<string, unknown>();
  for (const prop of properties) {
    values.set(prop.property, resolveValue(prop.value, zoom));
  }
  const color = (key: string): string | undefined => {
    const value = values.get(key);
    return typeof value === 'string' ? expandShortHex(value) : undefined;
  };
  const number = (key: string): number | undefined => {
    const value = values.get(key);
    return typeof value === 'number' ? value : undefined;
  };

  const isArea = color('fill-color') !== undefined;
  const featureStyle: FeatureStyle = {
    color: (isArea ? color('fill-color') : color('line-color')) ?? '#888888',
    opacity: (isArea ? number('fill-opacity') : number('line-opacity')) ?? 1,
  };
  const strokeColor = isArea ? color('line-color') : color('border-color');
  if (strokeColor) {
    featureStyle.strokeColor = strokeColor;
  }
  return featureStyle;
}

/**
 * Apply style to highway category. The line width of the rule sets the road width,
 * as a scale of the default width of that road level; its line style sets the dashes.
 */
function applyToHighway(
  style: RenderStyle,
  key: HighwayKey,
  baseStyle: FeatureStyle,
  rule: RenderRule,
  zoom: number
): void {
  style.highway[key] = lineFeatureStyle(baseStyle, rule, zoom, getRoadWeight(key).fill);
}

/**
 * Style of a line drawn over a casing (road, railway): line-width gives the width
 * scale against the default width, line-style the dashes, border-style the casing dashes.
 */
function lineFeatureStyle(baseStyle: FeatureStyle, rule: RenderRule, zoom: number, defaultWidth: number): FeatureStyle {
  const lineStyle: FeatureStyle = { ...baseStyle };
  const value = (property: string) => {
    const assignment = rule.properties.find(prop => prop.property === property);
    return assignment ? resolveValue(assignment.value, zoom) : undefined;
  };
  const width = value('line-width');
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    lineStyle.widthScale = width / defaultWidth;
  }
  const dashes = value('line-style');
  if (isLineStyle(dashes)) {
    lineStyle.lineStyle = dashes;
  }
  const casingDashes = value('border-style');
  if (isLineStyle(casingDashes)) {
    lineStyle.casingLineStyle = casingDashes;
  }
  return lineStyle;
}

const BUILDING_TYPES = ['residential', 'commercial', 'industrial', 'religious', 'construction'] as const;

// Building style key named in a feature pattern such as 'building_religious'
function buildingTypeOf(pattern: string): keyof RenderStyle['building'] | undefined {
  return BUILDING_TYPES.find(type => pattern.includes(type));
}

/**
 * Apply style to building category
 */
function applyToBuilding(
  style: RenderStyle,
  pattern: string,
  baseStyle: FeatureStyle,
  rule: RenderRule,
  zoom: number
): void {
  const type = buildingTypeOf(pattern);
  if (type) {
    style.building[type] = baseStyle;
  } else {
    // Generic building rule: applies to every building type
    for (const key of [...BUILDING_TYPES, 'default'] as const) {
      style.building[key] = { ...baseStyle };
    }
  }

  // Conditionals for specific building types override only the properties they set
  for (const cond of rule.conditionals) {
    const condType = cond.featurePattern ? buildingTypeOf(cond.featurePattern) : undefined;
    if (condType) {
      style.building[condType] = extractFeatureStyle([...rule.properties, ...cond.properties], zoom);
    }
  }
}

/**
 * Convert legacy RenderStyle to a basic Ruleset
 * Useful for importing old presets into the rule engine
 */
export function renderStyleToRuleset(style: RenderStyle, name: string = 'Converted Style'): Ruleset {
  // This is a simplified conversion - full implementation would be more comprehensive
  const { COMMON_FEATURES, MAPS_RULESET } = require('./defaultRules');

  // Clone the Maps ruleset and update colors
  const ruleset: Ruleset = {
    ...MAPS_RULESET,
    name,
    features: [...COMMON_FEATURES],
    rules: MAPS_RULESET.rules.map((rule: RenderRule) => {
      const newRule = { ...rule, properties: [...rule.properties] };
      const pattern = rule.target.featurePattern || '';

      // Update colors based on legacy style
      if (pattern.includes('highway_motorway')) {
        updateRuleColors(newRule, style.highway.motorway);
      } else if (pattern.includes('highway_primary')) {
        updateRuleColors(newRule, style.highway.primary);
      } else if (pattern.includes('highway_secondary')) {
        updateRuleColors(newRule, style.highway.secondary);
      } else if (pattern.includes('highway_tertiary')) {
        updateRuleColors(newRule, style.highway.tertiary);
      } else if (pattern.includes('highway_residential')) {
        updateRuleColors(newRule, style.highway.residential);
      } else if (pattern.includes('highway_cycleway')) {
        updateRuleColors(newRule, style.highway.cycleway);
      } else if (pattern.includes('highway_path')) {
        updateRuleColors(newRule, style.highway.path);
      } else if (pattern.includes('highway_footway')) {
        updateRuleColors(newRule, style.highway.footway);
      } else if (pattern.includes('natural_water')) {
        updateRuleColors(newRule, style.natural.water);
      } else if (pattern.includes('natural_wood')) {
        updateRuleColors(newRule, style.natural.wood);
      } else if (pattern.includes('natural_grassland')) {
        updateRuleColors(newRule, style.natural.grassland);
      } else if (pattern.includes('natural_beach')) {
        updateRuleColors(newRule, style.natural.beach);
      } else if (pattern.includes('building')) {
        updateRuleColors(newRule, style.building.default);
      } else if (pattern.includes('waterway')) {
        updateRuleColors(newRule, style.waterway.default);
      } else if (pattern.includes('landuse_residential')) {
        updateRuleColors(newRule, style.landuse.residential);
      } else if (pattern.includes('landuse_commercial')) {
        updateRuleColors(newRule, style.landuse.commercial);
      } else if (pattern.includes('landuse_industrial')) {
        updateRuleColors(newRule, style.landuse.industrial);
      } else if (pattern.includes('landuse_farmland')) {
        updateRuleColors(newRule, style.landuse.farmland);
      }

      return newRule;
    }),
  };

  return ruleset;
}

/**
 * Update rule colors from FeatureStyle
 */
function updateRuleColors(rule: RenderRule, featureStyle: FeatureStyle): void {
  for (let i = 0; i < rule.properties.length; i++) {
    const prop = rule.properties[i];
    if (prop.property === 'line-color' || prop.property === 'fill-color') {
      rule.properties[i] = { ...prop, value: featureStyle.color };
    }
    if (prop.property === 'line-opacity' || prop.property === 'fill-opacity') {
      rule.properties[i] = { ...prop, value: featureStyle.opacity };
    }
  }
}
