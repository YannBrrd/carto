/**
 * Rule evaluator - applies rules to OSM elements
 * Takes an OSM element and ruleset, returns evaluated style properties
 */

import {
  Ruleset,
  RenderRule,
  ConditionalBlock,
  PropertyAssignment,
  EvaluatedStyle,
  OSMElement,
  DrawCommand,
  GeometryType,
  TagCondition,
  CompoundCondition,
} from './types';
import {
  findMatchingFeatures,
  matchFeaturePattern,
  matchCondition,
  getElementGeometryType,
} from './matcher';
import { resolveValue, isZoomDependent } from './interpolator';

/**
 * Evaluate all matching rules for an OSM element and return the computed style
 */
export function evaluateRules(
  element: OSMElement,
  ruleset: Ruleset,
  zoom: number
): EvaluatedStyle | null {
  // Find all feature definitions that match this element
  const matchingFeatures = findMatchingFeatures(element, ruleset.features);

  if (matchingFeatures.length === 0) {
    return null;
  }

  const elementGeometry = getElementGeometryType(element);

  // Collect all applicable rules
  const applicableRules: RenderRule[] = [];

  for (const feature of matchingFeatures) {
    // Find rules that target this feature
    for (const rule of ruleset.rules) {
      if (matchRuleTarget(rule, feature.name, elementGeometry)) {
        applicableRules.push(rule);
      }
    }
  }

  if (applicableRules.length === 0) {
    return null;
  }

  // Initialize style with global properties
  const style: EvaluatedStyle = {
    draws: [],
  };

  // Apply global properties
  for (const [key, value] of Object.entries(ruleset.properties)) {
    if (value !== undefined) {
      (style as Record<string, unknown>)[key] = resolveValue(value, zoom);
    }
  }

  // Apply each matching rule
  for (const rule of applicableRules) {
    applyRule(rule, element, matchingFeatures.map(f => f.name), elementGeometry, zoom, style);
  }

  // Check zoom constraints
  if (style['min-zoom'] !== undefined && zoom < (style['min-zoom'] as number)) {
    return null;
  }
  if (style['max-zoom'] !== undefined && zoom > (style['max-zoom'] as number)) {
    return null;
  }

  // If no draw commands, return null
  if (style.draws.length === 0) {
    return null;
  }

  return style;
}

/**
 * Check if a rule's target matches the given feature name and geometry type
 */
function matchRuleTarget(
  rule: RenderRule,
  featureName: string,
  geometryType: GeometryType
): boolean {
  const { target } = rule;

  // Target by geometry type
  if (target.geometryType) {
    return target.geometryType === geometryType;
  }

  // Target by feature pattern
  if (target.featurePattern) {
    return matchFeaturePattern(featureName, target.featurePattern);
  }

  return false;
}

/**
 * Apply a single rule to the style
 */
function applyRule(
  rule: RenderRule,
  element: OSMElement,
  matchingFeatureNames: string[],
  geometryType: GeometryType,
  zoom: number,
  style: EvaluatedStyle
): boolean {
  // Apply top-level properties
  applyProperties(rule.properties, zoom, style);

  // Add top-level draw commands
  for (const draw of rule.draws) {
    if (!style.draws.includes(draw)) {
      style.draws.push(draw);
    }
  }

  // Process conditionals
  let shouldStop = false;
  for (const conditional of rule.conditionals) {
    const result = processConditional(
      conditional,
      element,
      matchingFeatureNames,
      geometryType,
      zoom,
      style
    );
    if (result.stop) {
      shouldStop = true;
      break;
    }
  }

  return shouldStop;
}

/**
 * Process a conditional block (if/elseif/else/for)
 */
function processConditional(
  block: ConditionalBlock,
  element: OSMElement,
  matchingFeatureNames: string[],
  geometryType: GeometryType,
  zoom: number,
  style: EvaluatedStyle
): { matched: boolean; stop: boolean } {
  // Check if condition matches
  const matches = evaluateBlockCondition(block, element, matchingFeatureNames, geometryType);

  if (!matches) {
    return { matched: false, stop: false };
  }

  // Apply properties
  applyProperties(block.properties, zoom, style);

  // Add draw commands
  for (const draw of block.draws) {
    if (!style.draws.includes(draw)) {
      style.draws.push(draw);
    }
  }

  // Check for stop
  if (block.stop) {
    return { matched: true, stop: true };
  }

  // Process children (nested conditionals)
  let childMatched = false;
  for (const child of block.children) {
    // For if/elseif/else chains, only execute the first matching one
    if (child.type === 'if') {
      childMatched = false;
    }

    if (child.type === 'else' && childMatched) {
      continue;
    }

    if (child.type === 'elseif' && childMatched) {
      continue;
    }

    const result = processConditional(child, element, matchingFeatureNames, geometryType, zoom, style);

    if (result.matched) {
      childMatched = true;
    }

    if (result.stop) {
      return { matched: true, stop: true };
    }
  }

  return { matched: true, stop: false };
}

/**
 * Evaluate if a conditional block's condition matches
 */
function evaluateBlockCondition(
  block: ConditionalBlock,
  element: OSMElement,
  matchingFeatureNames: string[],
  geometryType: GeometryType
): boolean {
  // 'else' always matches if we get here
  if (block.type === 'else') {
    return true;
  }

  // Check feature pattern
  if (block.featurePattern) {
    // Handle geometry type checks in 'for' blocks
    if (block.type === 'for') {
      if (block.featurePattern === 'area') {
        return geometryType === 'area';
      }
      if (block.featurePattern === 'line') {
        return geometryType === 'line';
      }
      if (block.featurePattern === 'point') {
        return geometryType === 'point';
      }
      if (block.featurePattern === 'not area') {
        return geometryType !== 'area';
      }
      if (block.featurePattern === 'not line') {
        return geometryType !== 'line';
      }
      if (block.featurePattern === 'not point') {
        return geometryType !== 'point';
      }
    }

    // Check if pattern matches any of the matching feature names
    for (const name of matchingFeatureNames) {
      if (matchFeaturePattern(name, block.featurePattern)) {
        return true;
      }
    }
    return false;
  }

  // Check tag condition
  if (block.tagCondition) {
    return matchCondition(element, block.tagCondition);
  }

  // No condition specified - return false for if/elseif/for
  // (else case was already handled at the start of this function)
  return false;
}

/**
 * Apply property assignments to a style object
 */
function applyProperties(
  properties: PropertyAssignment[],
  zoom: number,
  style: EvaluatedStyle
): void {
  for (const prop of properties) {
    const resolvedValue = resolveValue(prop.value, zoom);
    (style as Record<string, unknown>)[prop.property] = resolvedValue;
  }
}

/**
 * Get the text content for an element (for text rendering)
 */
export function getTextContent(element: OSMElement, style: EvaluatedStyle): string | null {
  // Check for explicit text property
  if (style.text) {
    return resolveTextExpression(style.text as string, element);
  }

  // Default to name tag
  return element.tags['name'] || null;
}

/**
 * Resolve a text expression like "@if(name, name @if(ele, '\n(' ele ')'), ele)"
 * For now, just handle simple cases
 */
function resolveTextExpression(expression: string, element: OSMElement): string {
  // Check for @if syntax
  if (expression.startsWith('@if')) {
    // Simple parsing of @if(condition, trueValue, falseValue)
    // This is a simplified implementation
    const match = expression.match(/@if\s*\(\s*(\w+)\s*,\s*(.+)\s*\)/);
    if (match) {
      const tagName = match[1];
      if (element.tags[tagName]) {
        // Return the tag value for now
        return element.tags[tagName];
      }
    }
    return '';
  }

  // Check for simple tag reference
  if (expression === 'name') {
    return element.tags['name'] || '';
  }
  if (expression === 'ref') {
    return element.tags['ref'] || '';
  }
  if (expression === 'ele') {
    return element.tags['ele'] || '';
  }

  // Check for tag reference pattern
  const tagMatch = expression.match(/^(\w+)$/);
  if (tagMatch && element.tags[tagMatch[1]]) {
    return element.tags[tagMatch[1]];
  }

  // Return as literal string
  return expression.replace(/^["']|["']$/g, '');
}

/**
 * Helper function to check if a style should render a specific draw type
 */
export function shouldDraw(style: EvaluatedStyle, drawType: DrawCommand): boolean {
  return style.draws.includes(drawType);
}

/**
 * Convert EvaluatedStyle to CSS-like properties for SVG rendering
 */
export function styleToSvgProperties(style: EvaluatedStyle): Record<string, string> {
  const result: Record<string, string> = {};

  // Line properties
  if (style['line-color']) {
    result['stroke'] = style['line-color'];
  }
  if (style['line-width'] !== undefined) {
    result['stroke-width'] = String(style['line-width']);
  }
  if (style['line-opacity'] !== undefined) {
    result['stroke-opacity'] = String(style['line-opacity']);
  }
  if (style['line-style']) {
    switch (style['line-style']) {
      case 'dash':
        result['stroke-dasharray'] = '5,5';
        break;
      case 'dashlong':
        result['stroke-dasharray'] = '10,5';
        break;
      case 'dot':
        result['stroke-dasharray'] = '2,2';
        break;
      case 'dashdot':
        result['stroke-dasharray'] = '10,5,2,5';
        break;
      case 'dashdotdot':
        result['stroke-dasharray'] = '10,5,2,5,2,5';
        break;
      case 'none':
        result['stroke'] = 'none';
        break;
    }
  }
  if (style['line-join']) {
    result['stroke-linejoin'] = style['line-join'];
  }
  if (style['line-start-cap'] || style['line-end-cap']) {
    result['stroke-linecap'] = style['line-end-cap'] || style['line-start-cap'] || 'butt';
  }

  // Fill properties
  if (style['fill-color']) {
    result['fill'] = style['fill-color'];
  }
  if (style['fill-opacity'] !== undefined) {
    result['fill-opacity'] = String(style['fill-opacity']);
  }

  // Text properties
  if (style['font-size'] !== undefined) {
    result['font-size'] = `${style['font-size']}px`;
  }
  if (style['font-weight']) {
    result['font-weight'] = style['font-weight'];
  }
  if (style['font-family']) {
    result['font-family'] = style['font-family'];
  }
  if (style['text-color']) {
    result['fill'] = style['text-color'];
  }

  return result;
}

/**
 * Convert EvaluatedStyle to Leaflet path options for map preview
 */
export function styleToLeafletOptions(style: EvaluatedStyle): L.PathOptions {
  const options: L.PathOptions = {};

  // Line/stroke properties
  if (style['line-color']) {
    options.color = style['line-color'];
  }
  if (style['line-width'] !== undefined) {
    options.weight = style['line-width'];
  }
  if (style['line-opacity'] !== undefined) {
    options.opacity = style['line-opacity'];
  }
  if (style['line-style'] === 'dash') {
    options.dashArray = '5,5';
  } else if (style['line-style'] === 'dot') {
    options.dashArray = '2,2';
  } else if (style['line-style'] === 'none') {
    options.stroke = false;
  }
  if (style['line-join']) {
    options.lineJoin = style['line-join'];
  }
  if (style['line-start-cap'] || style['line-end-cap']) {
    options.lineCap = style['line-end-cap'] || style['line-start-cap'];
  }

  // Fill properties
  if (style['fill-color']) {
    options.fillColor = style['fill-color'];
  }
  if (style['fill-opacity'] !== undefined) {
    options.fillOpacity = style['fill-opacity'];
  }

  return options;
}
