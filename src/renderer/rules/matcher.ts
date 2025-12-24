/**
 * Tag matcher for OSM elements
 * Supports wildcards, regex, and built-in functions
 */

import {
  TagCondition,
  CompoundCondition,
  FeatureDefinition,
  OSMElement,
  GeometryType,
  TargetSelector,
} from './types';

/**
 * Check if an OSM element matches a tag condition
 */
export function matchTagCondition(
  element: OSMElement,
  condition: TagCondition
): boolean {
  const { key, operator, value, values, pattern, divisor } = condition;
  const tagValue = element.tags[key];

  switch (operator) {
    case 'equals':
      return tagValue === value;

    case 'not_equals':
      return tagValue !== value;

    case 'exists':
      return tagValue !== undefined;

    case 'not_exists':
      return tagValue === undefined;

    case 'matches':
      if (!pattern || tagValue === undefined) return false;
      return pattern.test(tagValue);

    case 'one_of':
      if (!values || tagValue === undefined) return false;
      return values.includes(tagValue);

    case 'is_multi':
      if (!divisor || tagValue === undefined) return false;
      const numValue = parseFloat(tagValue);
      if (isNaN(numValue)) return false;
      return numValue % divisor === 0;

    default:
      return false;
  }
}

/**
 * Check if an OSM element matches a compound condition (AND/OR)
 */
export function matchCompoundCondition(
  element: OSMElement,
  condition: CompoundCondition
): boolean {
  const { type, conditions } = condition;

  if (type === 'and') {
    return conditions.every((c) => matchCondition(element, c));
  } else {
    return conditions.some((c) => matchCondition(element, c));
  }
}

/**
 * Check if an OSM element matches any condition type
 */
export function matchCondition(
  element: OSMElement,
  condition: TagCondition | CompoundCondition
): boolean {
  if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
    return matchCompoundCondition(element, condition);
  }
  return matchTagCondition(element, condition as TagCondition);
}

/**
 * Get the geometry type of an OSM element
 */
export function getElementGeometryType(element: OSMElement): GeometryType {
  if (element.type === 'node') {
    return 'point';
  }

  if (element.type === 'way') {
    // Check if it's an area (closed way or has area tag)
    if (element.isArea) {
      return 'area';
    }
    // Some tags indicate area by default
    const areaTags = ['building', 'landuse', 'natural', 'leisure', 'amenity', 'shop'];
    for (const tag of areaTags) {
      if (element.tags[tag] && element.tags['area'] !== 'no') {
        return 'area';
      }
    }
    return 'line';
  }

  if (element.type === 'relation') {
    const relationType = element.tags['type'];
    if (relationType === 'multipolygon' || relationType === 'boundary') {
      return 'area';
    }
    if (relationType === 'route') {
      return 'line';
    }
    return 'area'; // Default for relations
  }

  return 'line';
}

/**
 * Check if an OSM element matches a feature definition
 */
export function matchFeature(
  element: OSMElement,
  feature: FeatureDefinition
): boolean {
  // Check geometry type
  const elementGeometry = getElementGeometryType(element);
  if (!feature.geometryTypes.includes(elementGeometry)) {
    return false;
  }

  // Check conditions
  return matchCondition(element, feature.conditions);
}

/**
 * Find all matching features for an OSM element
 */
export function findMatchingFeatures(
  element: OSMElement,
  features: FeatureDefinition[]
): FeatureDefinition[] {
  return features.filter((feature) => matchFeature(element, feature));
}

/**
 * Check if a feature name matches a pattern with wildcards
 * Supports: * at start, end, or both
 * Examples: "highway*", "*motorway*", "*link"
 */
export function matchFeaturePattern(featureName: string, pattern: string): boolean {
  // Exact match
  if (pattern === featureName) {
    return true;
  }

  // Convert pattern to regex
  // Escape special regex chars except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with .*
  const regexStr = `^${escaped.replace(/\*/g, '.*')}$`;
  const regex = new RegExp(regexStr, 'i');

  return regex.test(featureName);
}

/**
 * Check if a target selector matches a given feature name and geometry type
 */
export function matchTarget(
  selector: TargetSelector,
  featureName: string,
  geometryType: GeometryType
): boolean {
  // If targeting by geometry type
  if (selector.geometryType) {
    return selector.geometryType === geometryType;
  }

  // If targeting by feature pattern
  if (selector.featurePattern) {
    return matchFeaturePattern(featureName, selector.featurePattern);
  }

  return false;
}

/**
 * Parse a simple condition string like "highway=primary" or "amenity=*"
 */
export function parseSimpleCondition(conditionStr: string): TagCondition | null {
  // Handle NOT prefix
  const isNegated = conditionStr.startsWith('NOT ');
  const cleanStr = isNegated ? conditionStr.slice(4).trim() : conditionStr.trim();

  // Check for key=value pattern
  const equalsMatch = cleanStr.match(/^([^=]+)=(.+)$/);
  if (equalsMatch) {
    const key = equalsMatch[1].trim();
    const value = equalsMatch[2].trim();

    if (value === '*') {
      return {
        key,
        operator: isNegated ? 'not_exists' : 'exists',
      };
    }

    return {
      key,
      operator: isNegated ? 'not_equals' : 'equals',
      value,
    };
  }

  // Check for regex pattern (key : pattern)
  const regexMatch = cleanStr.match(/^([^:]+)\s*:\s*(.+)$/);
  if (regexMatch) {
    return {
      key: regexMatch[1].trim(),
      operator: 'matches',
      pattern: new RegExp(regexMatch[2].trim()),
    };
  }

  // Just a key (exists check)
  if (/^[\w-]+$/.test(cleanStr)) {
    return {
      key: cleanStr,
      operator: isNegated ? 'not_exists' : 'exists',
    };
  }

  return null;
}

/**
 * Parse @isOneOf function
 * Example: @isOneOf(highway, primary, secondary, tertiary)
 */
export function parseIsOneOf(funcStr: string): TagCondition | null {
  const match = funcStr.match(/@isOneOf\s*\(\s*([^,]+)\s*,\s*(.+)\s*\)/i);
  if (!match) return null;

  const key = match[1].trim();
  const valuesStr = match[2];
  const values = valuesStr.split(',').map((v) => v.trim());

  return {
    key,
    operator: 'one_of',
    values,
  };
}

/**
 * Parse @isMulti function
 * Example: @isMulti(elevation, 100)
 */
export function parseIsMulti(funcStr: string): TagCondition | null {
  const match = funcStr.match(/@isMulti\s*\(\s*([^,]+)\s*,\s*(\d+)\s*\)/i);
  if (!match) return null;

  return {
    key: match[1].trim(),
    operator: 'is_multi',
    divisor: parseInt(match[2], 10),
  };
}

/**
 * Parse a complex condition string with AND/OR
 * Examples:
 * - "highway=primary"
 * - "amenity=parking AND access=public"
 * - "landuse=forest OR natural=wood"
 * - "@isOneOf(highway, primary, secondary)"
 */
export function parseConditionString(
  conditionStr: string
): TagCondition | CompoundCondition | null {
  const trimmed = conditionStr.trim();

  // Check for @isOneOf
  if (trimmed.includes('@isOneOf')) {
    return parseIsOneOf(trimmed);
  }

  // Check for @isMulti
  if (trimmed.includes('@isMulti')) {
    return parseIsMulti(trimmed);
  }

  // Split by OR first (lower precedence)
  if (trimmed.includes(' OR ')) {
    const parts = trimmed.split(' OR ');
    const conditions: (TagCondition | CompoundCondition)[] = [];

    for (const part of parts) {
      const parsed = parseConditionString(part.trim());
      if (parsed) conditions.push(parsed);
    }

    if (conditions.length === 1) return conditions[0];
    if (conditions.length > 1) {
      return { type: 'or', conditions };
    }
    return null;
  }

  // Split by AND
  if (trimmed.includes(' AND ')) {
    const parts = trimmed.split(' AND ');
    const conditions: (TagCondition | CompoundCondition)[] = [];

    for (const part of parts) {
      const parsed = parseConditionString(part.trim());
      if (parsed) conditions.push(parsed);
    }

    if (conditions.length === 1) return conditions[0];
    if (conditions.length > 1) {
      return { type: 'and', conditions };
    }
    return null;
  }

  // Handle "or" (lowercase)
  if (trimmed.includes(' or ')) {
    const parts = trimmed.split(' or ');
    const conditions: (TagCondition | CompoundCondition)[] = [];

    for (const part of parts) {
      const parsed = parseConditionString(part.trim());
      if (parsed) conditions.push(parsed);
    }

    if (conditions.length === 1) return conditions[0];
    if (conditions.length > 1) {
      return { type: 'or', conditions };
    }
    return null;
  }

  // Simple condition
  return parseSimpleCondition(trimmed);
}
