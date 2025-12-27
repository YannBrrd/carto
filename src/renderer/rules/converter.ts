/**
 * Converter utilities between Ruleset and legacy RenderStyle
 * Provides backwards compatibility during migration
 */

import { RenderStyle, FeatureStyle } from '../types';
import { Ruleset, RenderRule, PropertyAssignment } from './types';
import { resolveValue } from './interpolator';

/**
 * Convert a Ruleset to the legacy RenderStyle format
 * This allows the rule engine to work with existing svgGenerator and osmOverlay
 */
export function rulesetToRenderStyle(ruleset: Ruleset, zoom: number = 16): RenderStyle {
  // Default style as fallback
  const defaultStyle: RenderStyle = {
    backgroundColor: (ruleset.properties['background-color'] as string) || '#f5f5f5',
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
      cycleway: { color: '#4a80f5', opacity: 0.8 },
    },
    building: {
      residential: { color: '#e8e8e8', opacity: 1 },
      commercial: { color: '#e0e0e0', opacity: 1 },
      industrial: { color: '#d8d8d8', opacity: 1 },
      religious: { color: '#d4c4a8', opacity: 1 },
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
    },
  };

  // Extract styles from rules
  for (const rule of ruleset.rules) {
    const pattern = rule.target.featurePattern || '';

    // Get base properties
    const baseStyle = extractFeatureStyle(rule.properties, zoom);

    // Apply to appropriate category
    if (pattern.startsWith('highway_motorway')) {
      applyToHighway(defaultStyle, 'motorway', baseStyle, rule, zoom);
    } else if (pattern.startsWith('highway_primary')) {
      applyToHighway(defaultStyle, 'primary', baseStyle, rule, zoom);
    } else if (pattern.startsWith('highway_secondary')) {
      applyToHighway(defaultStyle, 'secondary', baseStyle, rule, zoom);
    } else if (pattern.startsWith('highway_tertiary')) {
      applyToHighway(defaultStyle, 'tertiary', baseStyle, rule, zoom);
    } else if (pattern.includes('highway_residential') || pattern.includes('highway_service')) {
      applyToHighway(defaultStyle, 'residential', baseStyle, rule, zoom);
    } else if (pattern.includes('highway_path') || pattern.includes('highway_footway')) {
      applyToHighway(defaultStyle, 'path', baseStyle, rule, zoom);
    } else if (pattern.includes('highway_cycleway')) {
      applyToHighway(defaultStyle, 'cycleway', baseStyle, rule, zoom);
    } else if (pattern.includes('building')) {
      applyToBuilding(defaultStyle, pattern, baseStyle, rule, zoom);
    } else if (pattern.includes('natural_water')) {
      defaultStyle.natural.water = baseStyle;
    } else if (pattern.includes('natural_wood')) {
      defaultStyle.natural.wood = baseStyle;
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
    }
  }

  return defaultStyle;
}

/**
 * Extract FeatureStyle from property assignments
 */
function extractFeatureStyle(properties: PropertyAssignment[], zoom: number): FeatureStyle {
  let color = '#888888';
  let opacity = 1;

  for (const prop of properties) {
    if (prop.property === 'line-color' || prop.property === 'fill-color') {
      const resolved = resolveValue(prop.value, zoom);
      if (typeof resolved === 'string') {
        color = resolved;
      }
    }
    if (prop.property === 'line-opacity' || prop.property === 'fill-opacity') {
      const resolved = resolveValue(prop.value, zoom);
      if (typeof resolved === 'number') {
        opacity = resolved;
      }
    }
  }

  return { color, opacity };
}

/**
 * Apply style to highway category
 */
function applyToHighway(
  style: RenderStyle,
  key: keyof RenderStyle['highway'],
  baseStyle: FeatureStyle,
  rule: RenderRule,
  zoom: number
): void {
  style.highway[key] = baseStyle;
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
  // Check if this is a generic building rule (no specific subtype)
  const isGenericBuilding = pattern === 'building' ||
    pattern.match(/^building\s*$/) ||
    !pattern.match(/residential|commercial|industrial|religious/);

  if (isGenericBuilding) {
    // Apply to ALL building types
    style.building.residential = baseStyle;
    style.building.commercial = baseStyle;
    style.building.industrial = baseStyle;
    style.building.religious = baseStyle;
    style.building.default = baseStyle;
  } else if (pattern.includes('residential')) {
    style.building.residential = baseStyle;
  } else if (pattern.includes('commercial')) {
    style.building.commercial = baseStyle;
  } else if (pattern.includes('industrial')) {
    style.building.industrial = baseStyle;
  } else if (pattern.includes('religious')) {
    style.building.religious = baseStyle;
  } else {
    style.building.default = baseStyle;
  }

  // Check conditionals for specific building types
  for (const cond of rule.conditionals) {
    if (cond.featurePattern) {
      const condStyle = extractFeatureStyle(cond.properties, zoom);
      if (cond.featurePattern.includes('residential')) {
        style.building.residential = { ...baseStyle, ...condStyle };
      } else if (cond.featurePattern.includes('commercial')) {
        style.building.commercial = { ...baseStyle, ...condStyle };
      } else if (cond.featurePattern.includes('industrial')) {
        style.building.industrial = { ...baseStyle, ...condStyle };
      } else if (cond.featurePattern.includes('religious')) {
        style.building.religious = { ...baseStyle, ...condStyle };
      }
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
      } else if (pattern.includes('highway_path') || pattern.includes('highway_footway')) {
        updateRuleColors(newRule, style.highway.path);
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
