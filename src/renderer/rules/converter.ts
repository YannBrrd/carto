/**
 * Converter utilities between Ruleset and legacy RenderStyle
 * Provides backwards compatibility during migration
 */

import { RenderStyle, FeatureStyle, LabelStyle, RailwayKey, TunnelStyle } from '../types';
import { Ruleset, RenderRule, PropertyAssignment } from './types';
import { resolveValue } from './interpolator';
import { DEFAULT_FONT_FAMILY, isValidFontFamily, type FontFamily } from '../constants/fonts';
import { getRoadWeight, getRailwayWeight } from '../utils/roadWeights';
import { isLineStyle } from '../utils/lineStyles';
import { DEFAULT_RAILWAY_STYLE, RAILWAY_TYPES, BUILDING_BORDER_WIDTH } from '../utils/styleResolvers';
import { sanitizeStyle } from '../utils/colors';

type HighwayKey = keyof RenderStyle['highway'];

// Railway rules: one per railway type, or one for every railway (which type rules override).
// Other railway features (platforms, stations) do not style the rails.
const RAILWAY_RULE_TYPES: Record<string, RailwayKey> = {
  railway_rail: 'rail',
  railway_light_rail: 'lightRail',
  railway_tram: 'tram',
  railway_subway: 'subway',
  railway_tunnel: 'tunnel',
};

function railwayRuleOf(pattern: string): { types: readonly RailwayKey[]; precedence: number } | undefined {
  const feature = Object.keys(RAILWAY_RULE_TYPES).find(name => pattern === name || pattern === `${name}*`);
  if (feature) return { types: [RAILWAY_RULE_TYPES[feature]], precedence: 1 };
  if (pattern === 'railway' || pattern === 'railway*') return { types: RAILWAY_TYPES, precedence: 0 };
  return undefined;
}

// Road rules for a highway style, and their precedence when several target it: the rule
// of a level wins over the rules of the roads drawn with its style (service roads,
// tracks, pedestrian streets...), which win over a rule targeting every road
const HIGHWAY_RULES: Array<{ key: HighwayKey; matches: (pattern: string) => boolean; precedence: number }> = [
  // Links (ramps) are drawn with the style of their road, narrower: listed first so the
  // road rules below do not take them for the road itself
  { key: 'motorway', matches: p => /^highway_(motorway|trunk)_link/.test(p), precedence: 0 },
  { key: 'primary', matches: p => p.startsWith('highway_primary_link'), precedence: 0 },
  { key: 'secondary', matches: p => p.startsWith('highway_secondary_link'), precedence: 0 },
  { key: 'tertiary', matches: p => p.startsWith('highway_tertiary_link'), precedence: 0 },
  { key: 'motorway', matches: p => p.startsWith('highway_motorway'), precedence: 1 },
  { key: 'motorway', matches: p => p.startsWith('highway_trunk'), precedence: 0 },
  { key: 'primary', matches: p => p.startsWith('highway_primary'), precedence: 1 },
  { key: 'secondary', matches: p => p.startsWith('highway_secondary'), precedence: 1 },
  { key: 'tertiary', matches: p => p.startsWith('highway_tertiary'), precedence: 1 },
  { key: 'residential', matches: p => p.includes('highway_residential'), precedence: 1 },
  { key: 'residential', matches: p => p.includes('highway_service'), precedence: 0 },
  { key: 'residential', matches: p => p.includes('highway_unclassified'), precedence: 0 },
  { key: 'residential', matches: p => p.includes('highway_living_street'), precedence: 0 },
  { key: 'path', matches: p => p.includes('highway_path'), precedence: 1 },
  { key: 'path', matches: p => p.includes('highway_track'), precedence: 0 },
  { key: 'path', matches: p => p.includes('highway_bridleway'), precedence: 0 },
  { key: 'footway', matches: p => p.includes('highway_footway'), precedence: 1 },
  { key: 'footway', matches: p => p.includes('highway_pedestrian'), precedence: 0 },
  { key: 'footway', matches: p => p.includes('highway_steps'), precedence: 0 },
  { key: 'cycleway', matches: p => p.includes('highway_cycleway'), precedence: 1 },
];

const HIGHWAY_KEYS: readonly HighwayKey[] = [
  'motorway', 'primary', 'secondary', 'tertiary', 'residential', 'path', 'footway', 'cycleway',
];

const GENERIC_PRECEDENCE = -1;

function highwayRuleOf(pattern: string): { keys: readonly HighwayKey[]; precedence: number } | undefined {
  if (pattern === 'highway' || pattern === 'highway*') return { keys: HIGHWAY_KEYS, precedence: GENERIC_PRECEDENCE };
  const rule = HIGHWAY_RULES.find(candidate => candidate.matches(pattern));
  return rule && { keys: [rule.key], precedence: rule.precedence };
}

type WaterwayKey = keyof RenderStyle['waterway'];

// Waterway rules, with the same precedence as road rules
const WATERWAY_RULES: Array<{ key: WaterwayKey; features: string[]; precedence: number }> = [
  { key: 'river', features: ['waterway_river'], precedence: 1 },
  { key: 'stream', features: ['waterway_stream'], precedence: 1 },
  { key: 'stream', features: ['waterway_brook'], precedence: 0 },
  { key: 'canal', features: ['waterway_canal'], precedence: 1 },
  { key: 'canal', features: ['waterway_drain', 'waterway_ditch'], precedence: 0 },
];

const WATERWAY_KEYS: readonly WaterwayKey[] = ['river', 'stream', 'canal', 'default'];

function waterwayRuleOf(pattern: string): { keys: readonly WaterwayKey[]; precedence: number } | undefined {
  if (pattern === 'waterway' || pattern === 'waterway*') return { keys: WATERWAY_KEYS, precedence: GENERIC_PRECEDENCE };
  // Exact feature names: waterway_river must not match waterway_riverbank (a water area)
  const rule = WATERWAY_RULES.find(candidate => candidate.features.some(name => pattern === name || pattern === `${name}*`));
  return rule && { keys: [rule.key], precedence: rule.precedence };
}

// First font of a CSS font family list that the app can embed
function fontFamilyOf(value: unknown): FontFamily | undefined {
  if (typeof value !== 'string') return undefined;
  const families = value.split(',').map(family => family.trim().replace(/^['"]|['"]$/g, ''));
  return families.find(isValidFontFamily);
}

// Bold or not from a CSS font weight (keyword or number)
function fontBoldOf(value: unknown): boolean | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 600;
  if (value === 'bold' || value === 'bolder') return true;
  if (value === 'normal' || value === 'lighter') return false;
  return undefined;
}

type FontSettings = RenderStyle['fontSize'];

// Label font a ruleset names: a font the app supports from its font family, bold from its font weight
function rulesetFonts(ruleset: Ruleset): Partial<Pick<FontSettings, 'fontFamily' | 'fontBold'>> {
  const fonts: Partial<Pick<FontSettings, 'fontFamily' | 'fontBold'>> = {};
  const fontFamily = fontFamilyOf(ruleset.properties['font-family']);
  if (fontFamily) fonts.fontFamily = fontFamily;
  const fontBold = fontBoldOf(ruleset.properties['font-weight']);
  if (fontBold !== undefined) fonts.fontBold = fontBold;
  return fonts;
}

/**
 * Style of a ruleset for the app: the user's saved font settings apply, except the font
 * and weight the ruleset names
 */
export function rulesetToStyleWithFonts(ruleset: Ruleset, saved: FontSettings | null, zoom: number = 16): RenderStyle {
  const style = rulesetToRenderStyle(ruleset, zoom);
  style.fontSize = { ...style.fontSize, ...(saved ?? {}), ...rulesetFonts(ruleset) };
  return style;
}

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
    fillOpacity: 0,  // No interior tint: the export keeps the feature colors
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
      fontFamily: rulesetFonts(ruleset).fontFamily ?? DEFAULT_FONT_FAMILY,
      fontBold: rulesetFonts(ruleset).fontBold ?? false,
    },
  };

  if (ruleset.properties['building-shadows'] === false) {
    defaultStyle.buildingShadows = false;
  }

  const haloColor = ruleset.properties['text-halo-color'];
  if (typeof haloColor === 'string') {
    defaultStyle.labels = { haloColor };
  }

  // Precedence of the rule that styled each road level, waterway, building and railway type so far
  const highwayPrecedence: Partial<Record<HighwayKey, number>> = {};
  const waterwayPrecedence: Partial<Record<WaterwayKey, number>> = {};
  const buildingPrecedence: Partial<Record<keyof RenderStyle['building'], number>> = {};
  const railwayPrecedence: Partial<Record<RailwayKey, number>> = {};
  const railways: Partial<Record<RailwayKey, FeatureStyle>> = {};

  // Extract styles from rules
  for (const rule of ruleset.rules) {
    const pattern = rule.target.featurePattern || '';

    // Get base properties
    const baseStyle = extractFeatureStyle(rule.properties, zoom);
    applyLabelColor(defaultStyle, pattern, rule.properties, zoom);

    // Apply to appropriate category
    const highwayRule = highwayRuleOf(pattern);
    const waterwayRule = waterwayRuleOf(pattern);
    if (pattern === 'highway_tunnel') {
      defaultStyle.highwayTunnel = extractTunnelStyle(rule.properties, zoom);
    } else if (pattern === 'waterway_tunnel') {
      defaultStyle.waterwayTunnel = extractTunnelStyle(rule.properties, zoom);
    } else if (highwayRule) {
      for (const key of highwayRule.keys) {
        if (highwayRule.precedence >= (highwayPrecedence[key] ?? -Infinity)) {
          highwayPrecedence[key] = highwayRule.precedence;
          applyToHighway(defaultStyle, key, baseStyle, rule, zoom);
        }
      }
    } else if (waterwayRule) {
      for (const key of waterwayRule.keys) {
        if (waterwayRule.precedence >= (waterwayPrecedence[key] ?? -Infinity)) {
          waterwayPrecedence[key] = waterwayRule.precedence;
          defaultStyle.waterway[key] = waterwayFeatureStyle(baseStyle, rule, zoom);
        }
      }
    } else if (pattern.startsWith('railway')) {
      const railwayRule = railwayRuleOf(pattern);
      for (const type of railwayRule?.types ?? []) {
        if (railwayRule!.precedence >= (railwayPrecedence[type] ?? -1)) {
          railwayPrecedence[type] = railwayRule!.precedence;
          railways[type] = lineFeatureStyle(baseStyle, rule, zoom, getRailwayWeight().fill);
        }
      }
    } else if (pattern.includes('building')) {
      applyToBuilding(defaultStyle, pattern, baseStyle, rule, zoom, buildingPrecedence);
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
    }
  }

  // Railway types without a rule of their own are drawn like trains
  if (Object.keys(railways).length > 0) {
    const rail = railways.rail ?? DEFAULT_RAILWAY_STYLE;
    defaultStyle.railway = Object.fromEntries(
      RAILWAY_TYPES.map(type => [type, { ...(railways[type] ?? rail) }])
    ) as Record<RailwayKey, FeatureStyle>;
  }

  // Rulesets may be imported: only real colors reach the renderers, as six-digit hex
  return sanitizeStyle(defaultStyle);
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
  // An area whose line style is none has no outline
  const outlined = !isArea || values.get('line-style') !== 'none';
  const strokeColor = isArea ? color('line-color') : color('border-color');
  if (strokeColor && outlined) {
    featureStyle.strokeColor = strokeColor;
  }
  // Lines: the casing may have its own opacity
  const casingOpacity = isArea ? undefined : number('border-opacity');
  if (casingOpacity !== undefined) {
    featureStyle.casingOpacity = casingOpacity;
  }
  return featureStyle;
}

/**
 * What a tunnel rule changes for ways underground: only the properties it sets
 */
function extractTunnelStyle(properties: PropertyAssignment[], zoom: number): TunnelStyle {
  const value = (property: string) => {
    const assignment = properties.find(prop => prop.property === property);
    return assignment ? resolveValue(assignment.value, zoom) : undefined;
  };
  const tunnelStyle: TunnelStyle = {};
  const color = value('line-color');
  if (typeof color === 'string') tunnelStyle.color = expandShortHex(color);
  const strokeColor = value('border-color');
  if (typeof strokeColor === 'string') tunnelStyle.strokeColor = expandShortHex(strokeColor);
  const opacity = value('line-opacity');
  if (typeof opacity === 'number') tunnelStyle.opacity = opacity;
  const lineStyle = value('line-style');
  if (isLineStyle(lineStyle)) tunnelStyle.lineStyle = lineStyle;
  const casingLineStyle = value('border-style');
  if (isLineStyle(casingLineStyle)) tunnelStyle.casingLineStyle = casingLineStyle;
  return tunnelStyle;
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
 * Apply style to building category: a rule for a building type wins over the generic
 * building rule, whatever their order
 */
function applyToBuilding(
  style: RenderStyle,
  pattern: string,
  baseStyle: FeatureStyle,
  rule: RenderRule,
  zoom: number,
  precedence: Partial<Record<keyof RenderStyle['building'], number>>
): void {
  const apply = (key: keyof RenderStyle['building'], featureStyle: FeatureStyle, rulePrecedence: number) => {
    if (rulePrecedence >= (precedence[key] ?? -Infinity)) {
      precedence[key] = rulePrecedence;
      style.building[key] = featureStyle;
    }
  };

  const type = buildingTypeOf(pattern);
  const ruleStyle = buildingFeatureStyle(baseStyle, rule.properties, zoom);
  if (type) {
    apply(type, ruleStyle, 1);
  } else {
    // Generic building rule: applies to every building type
    for (const key of [...BUILDING_TYPES, 'default'] as const) {
      apply(key, { ...ruleStyle }, 0);
    }
  }

  // Conditionals for specific building types override only the properties they set
  for (const cond of rule.conditionals) {
    const condType = cond.featurePattern ? buildingTypeOf(cond.featurePattern) : undefined;
    if (condType) {
      const properties = [...rule.properties, ...cond.properties];
      apply(condType, buildingFeatureStyle(extractFeatureStyle(properties, zoom), properties, zoom), 1);
    }
  }
}

// Style of a building: its line width scales the border, 1 px by default; a line style of
// none or a zero width hides it (the last value set wins)
function buildingFeatureStyle(baseStyle: FeatureStyle, properties: PropertyAssignment[], zoom: number): FeatureStyle {
  const buildingStyle: FeatureStyle = { ...baseStyle };
  const value = (property: string) => {
    const assignment = [...properties].reverse().find(prop => prop.property === property);
    return assignment ? resolveValue(assignment.value, zoom) : undefined;
  };
  const width = value('line-width');
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    buildingStyle.widthScale = width / BUILDING_BORDER_WIDTH;
  }
  if (value('line-style') === 'none' || width === 0) {
    buildingStyle.casingLineStyle = 'none';
  }
  return buildingStyle;
}

// Style of a waterway: its colors and line style (waterway widths are fixed)
function waterwayFeatureStyle(baseStyle: FeatureStyle, rule: RenderRule, zoom: number): FeatureStyle {
  const waterwayStyle: FeatureStyle = { ...baseStyle };
  const assignment = rule.properties.find(prop => prop.property === 'line-style');
  const dashes = assignment ? resolveValue(assignment.value, zoom) : undefined;
  if (isLineStyle(dashes)) waterwayStyle.lineStyle = dashes;
  return waterwayStyle;
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
