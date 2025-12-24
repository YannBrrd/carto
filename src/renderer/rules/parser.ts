/**
 * Parser for Maperitive .mrules files
 * Converts .mrules text to Ruleset AST
 */

import {
  Ruleset,
  FeatureDefinition,
  RenderRule,
  PropertyAssignment,
  ConditionalBlock,
  MapProperties,
  GeometryType,
  TagCondition,
  CompoundCondition,
  TargetSelector,
  DrawCommand,
  PropertyValue,
  ZoomDependentValue,
} from './types';
import { parseConditionString } from './matcher';
import { parseZoomDependentValue, parseColorWithBlend } from './interpolator';

interface ParseContext {
  lines: string[];
  currentLine: number;
  indent: number;
}

/**
 * Get the indentation level of a line (number of tabs)
 */
function getIndent(line: string): number {
  let indent = 0;
  for (const char of line) {
    if (char === '\t') indent++;
    else break;
  }
  return indent;
}

/**
 * Remove comments and trim a line
 */
function cleanLine(line: string): string {
  // Remove comments (// style)
  const commentIndex = line.indexOf('//');
  if (commentIndex >= 0) {
    line = line.substring(0, commentIndex);
  }
  return line.trimEnd();
}

/**
 * Parse the features section
 */
function parseFeatures(ctx: ParseContext): FeatureDefinition[] {
  const features: FeatureDefinition[] = [];
  const baseIndent = ctx.indent;

  // Move past the "features" line
  ctx.currentLine++;

  // Current geometry types being defined
  let currentGeometryTypes: GeometryType[] = [];

  while (ctx.currentLine < ctx.lines.length) {
    const line = ctx.lines[ctx.currentLine];
    const cleanedLine = cleanLine(line);
    const indent = getIndent(line);

    // End of features section
    if (indent <= baseIndent && cleanedLine.length > 0) {
      break;
    }

    // Skip empty lines
    if (cleanedLine.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const content = cleanedLine.trim();

    // Check for geometry type declaration (points, areas, lines, or combinations)
    if (content === 'points' || content === 'areas' || content === 'lines' ||
        content === 'points, areas' || content === 'areas, points' ||
        content.includes('points') || content.includes('areas') || content.includes('lines')) {
      currentGeometryTypes = parseGeometryTypes(content);
      ctx.currentLine++;
      continue;
    }

    // Parse feature definition: "name : condition"
    const colonIndex = content.indexOf(':');
    if (colonIndex > 0) {
      const name = content.substring(0, colonIndex).trim();
      const conditionStr = content.substring(colonIndex + 1).trim();

      // Handle special syntax like "node[@isOneOf(...)] area[@isOneOf(...)]"
      const condition = parseFeatureCondition(conditionStr);

      if (condition) {
        features.push({
          name,
          geometryTypes: currentGeometryTypes.length > 0 ? [...currentGeometryTypes] : ['line', 'area', 'point'],
          conditions: condition,
        });
      }
    }

    ctx.currentLine++;
  }

  return features;
}

/**
 * Parse geometry types from a declaration line
 */
function parseGeometryTypes(line: string): GeometryType[] {
  const types: GeometryType[] = [];
  const lower = line.toLowerCase();

  if (lower.includes('point')) types.push('point');
  if (lower.includes('area')) types.push('area');
  if (lower.includes('line')) types.push('line');

  return types;
}

/**
 * Parse a feature condition string
 * Handles complex syntax like: "node[@isOneOf(amenity, ...)] area[@isOneOf(...)]"
 */
function parseFeatureCondition(conditionStr: string): TagCondition | CompoundCondition | null {
  // Handle node/area prefix syntax
  const nodeAreaMatch = conditionStr.match(/^(node|area)\[(.+?)\]\s*(node|area)?\[?(.+?)?\]?$/);
  if (nodeAreaMatch) {
    const conditions: (TagCondition | CompoundCondition)[] = [];

    const first = parseConditionString(nodeAreaMatch[2]);
    if (first) conditions.push(first);

    if (nodeAreaMatch[4]) {
      const second = parseConditionString(nodeAreaMatch[4]);
      if (second) conditions.push(second);
    }

    if (conditions.length === 1) return conditions[0];
    if (conditions.length > 1) return { type: 'or', conditions };
  }

  // Standard condition
  return parseConditionString(conditionStr);
}

/**
 * Parse the properties section (global map properties)
 */
function parseProperties(ctx: ParseContext): MapProperties {
  const properties: MapProperties = {};
  const baseIndent = ctx.indent;

  // Move past the "properties" line
  ctx.currentLine++;

  while (ctx.currentLine < ctx.lines.length) {
    const line = ctx.lines[ctx.currentLine];
    const cleanedLine = cleanLine(line);
    const indent = getIndent(line);

    // End of properties section
    if (indent <= baseIndent && cleanedLine.length > 0) {
      break;
    }

    // Skip empty lines
    if (cleanedLine.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    // Parse property: "key : value"
    const content = cleanedLine.trim();
    const colonIndex = content.indexOf(':');
    if (colonIndex > 0) {
      const key = content.substring(0, colonIndex).trim();
      const valueStr = content.substring(colonIndex + 1).trim();
      properties[key] = parsePropertyValue(valueStr);
    }

    ctx.currentLine++;
  }

  return properties;
}

/**
 * Parse a property value (handles zoom-dependent, colors, etc.)
 */
function parsePropertyValue(valueStr: string): PropertyValue {
  // Try zoom-dependent value
  const zoomValue = parseZoomDependentValue(valueStr);
  if (zoomValue) {
    return zoomValue;
  }

  // Try color with blend
  if (valueStr.includes('%') && (valueStr.includes('black') || valueStr.includes('white'))) {
    const colorBlend = parseColorWithBlend(valueStr);
    if (colorBlend.blend) {
      return {
        type: 'color',
        base: colorBlend.base,
        blend: colorBlend.blend,
        blendAmount: colorBlend.blendAmount,
      };
    }
  }

  // Try number
  const numValue = parseFloat(valueStr);
  if (!isNaN(numValue) && /^-?\d+(\.\d+)?$/.test(valueStr)) {
    return numValue;
  }

  // Boolean
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;

  // String value
  return valueStr;
}

/**
 * Parse the rules section
 */
function parseRules(ctx: ParseContext): RenderRule[] {
  const rules: RenderRule[] = [];
  const baseIndent = ctx.indent;

  // Move past the "rules" line
  ctx.currentLine++;

  while (ctx.currentLine < ctx.lines.length) {
    const line = ctx.lines[ctx.currentLine];
    const cleanedLine = cleanLine(line);
    const indent = getIndent(line);

    // End of rules section
    if (indent <= baseIndent && cleanedLine.length > 0) {
      break;
    }

    // Skip empty lines
    if (cleanedLine.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const content = cleanedLine.trim();

    // Parse target declaration
    if (content.startsWith('target')) {
      const rule = parseTargetRule(ctx);
      if (rule) {
        rules.push(rule);
      }
    } else {
      ctx.currentLine++;
    }
  }

  return rules;
}

/**
 * Parse a target rule block
 */
function parseTargetRule(ctx: ParseContext): RenderRule | null {
  const line = ctx.lines[ctx.currentLine];
  const cleanedLine = cleanLine(line);
  const content = cleanedLine.trim();
  const baseIndent = getIndent(line);

  // Parse target selector: "target : featureName" or "target : $featuretype(point)"
  const colonIndex = content.indexOf(':');
  if (colonIndex < 0) {
    ctx.currentLine++;
    return null;
  }

  const selectorStr = content.substring(colonIndex + 1).trim();
  const target = parseTargetSelector(selectorStr);

  const rule: RenderRule = {
    target,
    properties: [],
    draws: [],
    conditionals: [],
  };

  ctx.currentLine++;

  // Parse rule contents
  while (ctx.currentLine < ctx.lines.length) {
    const currentLine = ctx.lines[ctx.currentLine];
    const currentCleaned = cleanLine(currentLine);
    const currentIndent = getIndent(currentLine);

    // End of this target block
    if (currentIndent <= baseIndent && currentCleaned.length > 0) {
      break;
    }

    // Skip empty lines
    if (currentCleaned.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const currentContent = currentCleaned.trim();

    // Parse define block
    if (currentContent === 'define') {
      const props = parseDefineBlock(ctx, currentIndent);
      rule.properties.push(...props);
    }
    // Parse if/elseif/else block
    else if (currentContent.startsWith('if') || currentContent.startsWith('elseif') || currentContent === 'else') {
      const conditional = parseConditionalBlock(ctx, currentIndent);
      if (conditional) {
        rule.conditionals.push(conditional);
      }
    }
    // Parse for block
    else if (currentContent.startsWith('for')) {
      const forBlock = parseForBlock(ctx, currentIndent);
      if (forBlock) {
        rule.conditionals.push(forBlock);
      }
    }
    // Parse draw command
    else if (currentContent.startsWith('draw')) {
      const drawCmd = parseDrawCommand(currentContent);
      if (drawCmd) {
        rule.draws.push(drawCmd);
      }
      ctx.currentLine++;
    }
    else {
      ctx.currentLine++;
    }
  }

  return rule;
}

/**
 * Parse target selector
 */
function parseTargetSelector(selectorStr: string): TargetSelector {
  // Check for $featuretype syntax
  const featureTypeMatch = selectorStr.match(/\$featuretype\s*\(\s*(\w+)\s*\)/);
  if (featureTypeMatch) {
    return { geometryType: featureTypeMatch[1] as GeometryType };
  }

  // Feature pattern
  return { featurePattern: selectorStr };
}

/**
 * Parse a define block and return property assignments
 */
function parseDefineBlock(ctx: ParseContext, baseIndent: number): PropertyAssignment[] {
  const properties: PropertyAssignment[] = [];

  // Move past the "define" line
  ctx.currentLine++;

  while (ctx.currentLine < ctx.lines.length) {
    const line = ctx.lines[ctx.currentLine];
    const cleanedLine = cleanLine(line);
    const indent = getIndent(line);

    // End of define block
    if (indent <= baseIndent && cleanedLine.length > 0) {
      break;
    }

    // Skip empty lines
    if (cleanedLine.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const content = cleanedLine.trim();

    // Parse property: "key : value"
    const colonIndex = content.indexOf(':');
    if (colonIndex > 0) {
      const key = content.substring(0, colonIndex).trim();
      const valueStr = content.substring(colonIndex + 1).trim();
      properties.push({
        property: key,
        value: parsePropertyValue(valueStr),
      });
    }

    ctx.currentLine++;
  }

  return properties;
}

/**
 * Parse an if/elseif/else conditional block
 */
function parseConditionalBlock(ctx: ParseContext, baseIndent: number): ConditionalBlock | null {
  const line = ctx.lines[ctx.currentLine];
  const cleanedLine = cleanLine(line);
  const content = cleanedLine.trim();

  let type: 'if' | 'elseif' | 'else';
  let featurePattern: string | undefined;
  let tagCondition: TagCondition | CompoundCondition | undefined;

  if (content.startsWith('elseif')) {
    type = 'elseif';
    const condStr = content.substring(6).trim().replace(/^:/, '').trim();
    featurePattern = condStr;
  } else if (content.startsWith('if')) {
    type = 'if';
    const condStr = content.substring(2).trim().replace(/^:/, '').trim();
    featurePattern = condStr;
  } else if (content === 'else') {
    type = 'else';
  } else {
    ctx.currentLine++;
    return null;
  }

  const block: ConditionalBlock = {
    type,
    featurePattern,
    tagCondition,
    properties: [],
    draws: [],
    children: [],
    stop: false,
  };

  ctx.currentLine++;

  // Parse block contents
  while (ctx.currentLine < ctx.lines.length) {
    const currentLine = ctx.lines[ctx.currentLine];
    const currentCleaned = cleanLine(currentLine);
    const currentIndent = getIndent(currentLine);

    // End of this block (same or lower indent, or next if/elseif/else at same level)
    if (currentIndent <= baseIndent && currentCleaned.length > 0) {
      break;
    }

    // Check if we hit a sibling elseif/else (need to check indent properly)
    if (currentIndent === baseIndent + 1) {
      const trimmed = currentCleaned.trim();
      if (trimmed.startsWith('elseif') || trimmed === 'else') {
        // This is a sibling, not a child
        break;
      }
    }

    // Skip empty lines
    if (currentCleaned.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const currentContent = currentCleaned.trim();

    // Parse define block
    if (currentContent === 'define') {
      const props = parseDefineBlock(ctx, currentIndent);
      block.properties.push(...props);
    }
    // Parse nested if/elseif/else
    else if (currentContent.startsWith('if') || currentContent.startsWith('elseif') || currentContent === 'else') {
      const nested = parseConditionalBlock(ctx, currentIndent);
      if (nested) {
        block.children.push(nested);
      }
    }
    // Parse for block
    else if (currentContent.startsWith('for')) {
      const forBlock = parseForBlock(ctx, currentIndent);
      if (forBlock) {
        block.children.push(forBlock);
      }
    }
    // Parse draw command
    else if (currentContent.startsWith('draw')) {
      const drawCmd = parseDrawCommand(currentContent);
      if (drawCmd) {
        block.draws.push(drawCmd);
      }
      ctx.currentLine++;
    }
    // Parse stop
    else if (currentContent === 'stop') {
      block.stop = true;
      ctx.currentLine++;
    }
    else {
      ctx.currentLine++;
    }
  }

  return block;
}

/**
 * Parse a for block (condition-based sub-styling)
 */
function parseForBlock(ctx: ParseContext, baseIndent: number): ConditionalBlock | null {
  const line = ctx.lines[ctx.currentLine];
  const cleanedLine = cleanLine(line);
  const content = cleanedLine.trim();

  // Parse "for : condition"
  const colonIndex = content.indexOf(':');
  const condStr = colonIndex > 0 ? content.substring(colonIndex + 1).trim() : content.substring(3).trim();

  // Parse the condition - it can be a tag condition or geometry filter
  let tagCondition: TagCondition | CompoundCondition | undefined;
  let featurePattern: string | undefined;

  // Check for geometry filter (e.g., "for : area", "for : not area")
  if (condStr === 'area' || condStr === 'line' || condStr === 'point') {
    featurePattern = condStr;
  } else if (condStr.startsWith('not ')) {
    featurePattern = condStr;
  } else {
    tagCondition = parseConditionString(condStr) || undefined;
  }

  const block: ConditionalBlock = {
    type: 'for',
    featurePattern,
    tagCondition,
    properties: [],
    draws: [],
    children: [],
    stop: false,
  };

  ctx.currentLine++;

  // Parse block contents
  while (ctx.currentLine < ctx.lines.length) {
    const currentLine = ctx.lines[ctx.currentLine];
    const currentCleaned = cleanLine(currentLine);
    const currentIndent = getIndent(currentLine);

    // End of this block
    if (currentIndent <= baseIndent && currentCleaned.length > 0) {
      break;
    }

    // Skip empty lines
    if (currentCleaned.trim().length === 0) {
      ctx.currentLine++;
      continue;
    }

    const currentContent = currentCleaned.trim();

    // Parse define block
    if (currentContent === 'define') {
      const props = parseDefineBlock(ctx, currentIndent);
      block.properties.push(...props);
    }
    // Parse draw command
    else if (currentContent.startsWith('draw')) {
      const drawCmd = parseDrawCommand(currentContent);
      if (drawCmd) {
        block.draws.push(drawCmd);
      }
      ctx.currentLine++;
    }
    // Parse stop
    else if (currentContent === 'stop') {
      block.stop = true;
      ctx.currentLine++;
    }
    else {
      ctx.currentLine++;
    }
  }

  return block;
}

/**
 * Parse a draw command
 */
function parseDrawCommand(content: string): DrawCommand | null {
  // Parse "draw : type" or "draw:type"
  const colonIndex = content.indexOf(':');
  if (colonIndex < 0) return null;

  const drawType = content.substring(colonIndex + 1).trim().toLowerCase();

  const validDrawTypes: DrawCommand[] = ['line', 'fill', 'text', 'icon', 'shape', 'shield', 'contour'];
  if (validDrawTypes.includes(drawType as DrawCommand)) {
    return drawType as DrawCommand;
  }

  return null;
}

/**
 * Main parser function - parse a complete .mrules file
 */
export function parseRuleset(content: string, name: string = 'Parsed Ruleset'): Ruleset {
  const lines = content.split('\n');
  const ctx: ParseContext = {
    lines,
    currentLine: 0,
    indent: 0,
  };

  const ruleset: Ruleset = {
    name,
    features: [],
    properties: {},
    rules: [],
  };

  while (ctx.currentLine < lines.length) {
    const line = lines[ctx.currentLine];
    const cleanedLine = cleanLine(line);
    const content = cleanedLine.trim();

    if (content === 'features') {
      ctx.indent = getIndent(line);
      ruleset.features = parseFeatures(ctx);
    } else if (content === 'properties') {
      ctx.indent = getIndent(line);
      ruleset.properties = parseProperties(ctx);
    } else if (content === 'rules') {
      ctx.indent = getIndent(line);
      ruleset.rules = parseRules(ctx);
    } else {
      ctx.currentLine++;
    }
  }

  return ruleset;
}

/**
 * Serialize a ruleset back to .mrules format
 */
export function serializeRuleset(ruleset: Ruleset): string {
  const lines: string[] = [];

  // Features section
  if (ruleset.features.length > 0) {
    lines.push('features');

    // Group by geometry type
    const byGeometry = new Map<string, FeatureDefinition[]>();
    for (const feature of ruleset.features) {
      const key = feature.geometryTypes.sort().join(', ');
      if (!byGeometry.has(key)) {
        byGeometry.set(key, []);
      }
      byGeometry.get(key)!.push(feature);
    }

    for (const [geoTypes, features] of byGeometry) {
      lines.push(`\t${geoTypes}`);
      for (const feature of features) {
        const condStr = serializeCondition(feature.conditions);
        lines.push(`\t\t${feature.name} : ${condStr}`);
      }
    }
    lines.push('');
  }

  // Properties section
  if (Object.keys(ruleset.properties).length > 0) {
    lines.push('properties');
    for (const [key, value] of Object.entries(ruleset.properties)) {
      if (value !== undefined) {
        lines.push(`\t${key}\t: ${serializeValue(value)}`);
      }
    }
    lines.push('');
  }

  // Rules section
  if (ruleset.rules.length > 0) {
    lines.push('rules');
    for (const rule of ruleset.rules) {
      lines.push(...serializeRule(rule, 1));
      lines.push('');
    }
  }

  return lines.join('\n');
}

function serializeCondition(condition: TagCondition | CompoundCondition): string {
  if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
    const separator = condition.type === 'and' ? ' AND ' : ' OR ';
    return condition.conditions.map(c => serializeCondition(c)).join(separator);
  }

  const tc = condition as TagCondition;
  switch (tc.operator) {
    case 'equals':
      return `${tc.key}=${tc.value}`;
    case 'not_equals':
      return `NOT ${tc.key}=${tc.value}`;
    case 'exists':
      return `${tc.key}=*`;
    case 'not_exists':
      return `NOT ${tc.key}`;
    case 'one_of':
      return `@isOneOf(${tc.key}, ${tc.values?.join(', ')})`;
    case 'is_multi':
      return `@isMulti(${tc.key}, ${tc.divisor})`;
    default:
      return tc.key;
  }
}

function serializeValue(value: PropertyValue): string {
  if (typeof value === 'object' && value !== null) {
    if ('type' in value && value.type === 'zoom-dependent') {
      return (value as ZoomDependentValue).stops.map(s => `${s.zoom}:${s.value}`).join(';');
    }
    if ('type' in value && value.type === 'color') {
      const cv = value as { base: string; blend?: string; blendAmount?: number };
      if (cv.blend) {
        return `${cv.base} ${cv.blend} ${cv.blendAmount}%`;
      }
      return cv.base;
    }
  }
  return String(value);
}

function serializeRule(rule: RenderRule, indent: number): string[] {
  const lines: string[] = [];
  const tabs = '\t'.repeat(indent);

  // Target line
  const targetStr = rule.target.geometryType
    ? `$featuretype(${rule.target.geometryType})`
    : rule.target.featurePattern || '';
  lines.push(`${tabs}target : ${targetStr}`);

  // Properties (define block)
  if (rule.properties.length > 0) {
    lines.push(`${tabs}\tdefine`);
    for (const prop of rule.properties) {
      lines.push(`${tabs}\t\t${prop.property} : ${serializeValue(prop.value)}`);
    }
  }

  // Draws
  for (const draw of rule.draws) {
    lines.push(`${tabs}\tdraw : ${draw}`);
  }

  // Conditionals
  for (const cond of rule.conditionals) {
    lines.push(...serializeConditional(cond, indent + 1));
  }

  return lines;
}

function serializeConditional(block: ConditionalBlock, indent: number): string[] {
  const lines: string[] = [];
  const tabs = '\t'.repeat(indent);

  // Block header
  let header = block.type;
  if (block.type !== 'else' && block.featurePattern) {
    header += ` : ${block.featurePattern}`;
  } else if (block.type !== 'else' && block.tagCondition) {
    header += ` : ${serializeCondition(block.tagCondition)}`;
  }
  lines.push(`${tabs}${header}`);

  // Properties
  if (block.properties.length > 0) {
    lines.push(`${tabs}\tdefine`);
    for (const prop of block.properties) {
      lines.push(`${tabs}\t\t${prop.property} : ${serializeValue(prop.value)}`);
    }
  }

  // Draws
  for (const draw of block.draws) {
    lines.push(`${tabs}\tdraw : ${draw}`);
  }

  // Stop
  if (block.stop) {
    lines.push(`${tabs}\tstop`);
  }

  // Children
  for (const child of block.children) {
    lines.push(...serializeConditional(child, indent + 1));
  }

  return lines;
}
