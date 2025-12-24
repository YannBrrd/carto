/**
 * Maperitive-compatible rule engine types
 */

// Geometry types for features
export type GeometryType = 'point' | 'line' | 'area';

// Tag matching operators
export type ConditionOperator =
  | 'equals'      // key=value
  | 'not_equals'  // NOT key=value
  | 'exists'      // key (any value)
  | 'not_exists'  // NOT key
  | 'matches'     // regex match
  | 'one_of'      // @isOneOf(key, val1, val2, ...)
  | 'is_multi';   // @isMulti(key, divisor)

// Tag condition for matching OSM elements
export interface TagCondition {
  key: string;
  operator: ConditionOperator;
  value?: string;           // For equals, not_equals
  values?: string[];        // For one_of
  pattern?: RegExp;         // For matches
  divisor?: number;         // For is_multi
}

// Compound condition (AND/OR groups)
export interface CompoundCondition {
  type: 'and' | 'or';
  conditions: (TagCondition | CompoundCondition)[];
}

// Feature definition (target: highway, building, etc.)
export interface FeatureDefinition {
  name: string;
  geometryTypes: GeometryType[];  // Which geometry types this applies to
  conditions: TagCondition | CompoundCondition;
}

// Zoom-dependent value with interpolation stops
export interface ZoomDependentValue {
  type: 'zoom-dependent';
  stops: { zoom: number; value: number }[];
}

// Color with optional blend
export interface ColorValue {
  type: 'color';
  base: string;           // Hex color or named color
  blend?: string;         // Optional color to blend with
  blendAmount?: number;   // Blend percentage (0-100)
}

// Property value types
export type PropertyValue =
  | string
  | number
  | boolean
  | ZoomDependentValue
  | ColorValue;

// Draw command types
export type DrawCommand =
  | 'line'
  | 'fill'
  | 'text'
  | 'icon'
  | 'shape'
  | 'shield'
  | 'contour';

// Property assignment in define block
export interface PropertyAssignment {
  property: string;
  value: PropertyValue;
}

// Conditional block (if/elseif/else/for)
export interface ConditionalBlock {
  type: 'if' | 'elseif' | 'else' | 'for';
  // For 'if', 'elseif', 'for': condition to match
  // Uses feature name pattern (e.g., "*motorway*") or tag condition
  featurePattern?: string;           // e.g., "*motorway*", "place*"
  tagCondition?: TagCondition | CompoundCondition;  // e.g., "tunnel=yes"
  // Properties defined in this block
  properties: PropertyAssignment[];
  // Draw commands in this block
  draws: DrawCommand[];
  // Nested conditionals
  children: ConditionalBlock[];
  // Stop processing further rules
  stop?: boolean;
}

// Target selector types
export interface TargetSelector {
  // Feature name pattern (supports wildcards)
  featurePattern?: string;      // e.g., "highway*", "*motorway*"
  // Or target by geometry type
  geometryType?: GeometryType;  // e.g., $featuretype(point)
}

// Rendering rule
export interface RenderRule {
  target: TargetSelector;
  // Default properties for this target
  properties: PropertyAssignment[];
  // Draw commands at top level
  draws: DrawCommand[];
  // Conditional blocks
  conditionals: ConditionalBlock[];
}

// Global map properties
export interface MapProperties {
  'map-background-color'?: string;
  'map-background-opacity'?: number;
  'map-sea-color'?: string;
  'font-weight'?: string;
  'font-family'?: string;
  'font-size'?: number | ZoomDependentValue;
  'font-style'?: string;
  'font-stretch'?: number;
  'text-max-width'?: number;
  'text-halo-width'?: string | number;
  'text-halo-opacity'?: number;
  'text-halo-color'?: string;
  'text-align-horizontal'?: 'left' | 'center' | 'right' | 'near' | 'far';
  'text-align-vertical'?: 'top' | 'center' | 'bottom' | 'near' | 'far';
  'text-color'?: string | ColorValue;
  'text-offset-vertical'?: string | number;
  'text-offset-horizontal'?: string | number;
  [key: string]: PropertyValue | undefined;
}

// Complete ruleset
export interface Ruleset {
  name: string;
  features: FeatureDefinition[];
  properties: MapProperties;
  rules: RenderRule[];
}

// Evaluated style result (after rule evaluation)
export interface EvaluatedStyle {
  // Allow dynamic property access
  [key: string]: unknown;

  // Line properties
  'line-color'?: string;
  'line-width'?: number;
  'line-style'?: 'solid' | 'dash' | 'dashlong' | 'dot' | 'dashdot' | 'dashdotdot' | 'none';
  'line-opacity'?: number;
  'line-join'?: 'round' | 'miter' | 'bevel';
  'line-start-cap'?: 'round' | 'butt' | 'square';
  'line-end-cap'?: 'round' | 'butt' | 'square';

  // Border properties (for roads)
  'border-style'?: 'solid' | 'dash' | 'dot' | 'none';
  'border-color'?: string;
  'border-width'?: number | string;  // Can be percentage
  'border-opacity'?: number;

  // Fill properties
  'fill-color'?: string;
  'fill-opacity'?: number;
  'fill-hatch'?: string;
  'fill-hatch-color'?: string;

  // Text properties
  'text'?: string;
  'text-color'?: string;
  'text-halo-width'?: number | string;
  'text-halo-opacity'?: number;
  'text-halo-color'?: string;
  'font-size'?: number;
  'font-weight'?: string;
  'font-family'?: string;
  'font-style'?: string;
  'text-align-horizontal'?: string;
  'text-align-vertical'?: string;
  'text-offset-vertical'?: number | string;
  'text-offset-horizontal'?: number | string;
  'text-max-width'?: number;

  // Icon properties
  'icon-image'?: string;
  'icon-width'?: number;

  // Shape properties
  'shape'?: 'square' | 'circle' | 'triangle' | 'custom';
  'shape-size'?: number;
  'shape-def'?: string;
  'shape-spacing'?: number;
  'shape-aspect'?: number;

  // Shield properties
  'shield-padding-left'?: number;
  'shield-padding-right'?: number;
  'shield-padding-top'?: number;
  'shield-padding-bottom'?: number;
  'shield-resize-mode'?: string;

  // Zoom constraints
  'min-zoom'?: number;
  'max-zoom'?: number;

  // Placement
  'placement-value'?: number;

  // Misc
  'curved'?: boolean;
  'angle'?: number;

  // Draw commands that should be executed
  draws: DrawCommand[];
}

// OSM element representation for rule matching
export interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  // Geometry info
  geometry?: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  // For ways: is it an area or line?
  isArea?: boolean;
}
