/**
 * Rule Engine Module
 * Maperitive-compatible rules for map styling
 */

// Types
export * from './types';

// Core modules
export { parseRuleset, serializeRuleset } from './parser';
export {
  parseZoomDependentValue,
  interpolateValue,
  resolveValue,
  isZoomDependent,
  parseColorWithBlend,
} from './interpolator';
export {
  matchTagCondition,
  matchCompoundCondition,
  matchCondition,
  matchFeature,
  findMatchingFeatures,
  matchFeaturePattern,
  matchTarget,
  parseSimpleCondition,
  parseIsOneOf,
  parseIsMulti,
  parseConditionString,
  getElementGeometryType,
} from './matcher';
export {
  evaluateRules,
  getTextContent,
  shouldDraw,
  styleToSvgProperties,
  styleToLeafletOptions,
} from './evaluator';

// Default rulesets
export {
  COMMON_FEATURES,
  GOOGLE_MAPS_RULESET,
  OSM_CARTO_RULESET,
  getDefaultRuleset,
  getBuiltInRulesets,
} from './defaultRules';

// Converter for backwards compatibility
export {
  rulesetToRenderStyle,
  renderStyleToRuleset,
} from './converter';
