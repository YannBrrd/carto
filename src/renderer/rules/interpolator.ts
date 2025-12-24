/**
 * Zoom-dependent value interpolation
 * Handles values like "7:1;12:4;14:8" which define values at different zoom levels
 */

import { ZoomDependentValue, PropertyValue } from './types';

/**
 * Parse a zoom-dependent value string into a ZoomDependentValue object
 * Format: "zoom1:value1;zoom2:value2;..."
 * Example: "7:1;12:4;14:8"
 */
export function parseZoomDependentValue(value: string): ZoomDependentValue | null {
  // Check if it matches zoom-dependent pattern
  if (!value.includes(':') || !value.includes(';')) {
    // Single zoom:value pair is also valid
    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (match) {
      return {
        type: 'zoom-dependent',
        stops: [{ zoom: parseFloat(match[1]), value: parseFloat(match[2]) }],
      };
    }
    return null;
  }

  const parts = value.split(';');
  const stops: { zoom: number; value: number }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) {
      return null; // Invalid format
    }

    stops.push({
      zoom: parseFloat(match[1]),
      value: parseFloat(match[2]),
    });
  }

  if (stops.length === 0) {
    return null;
  }

  // Sort by zoom level
  stops.sort((a, b) => a.zoom - b.zoom);

  return {
    type: 'zoom-dependent',
    stops,
  };
}

/**
 * Check if a property value is zoom-dependent
 */
export function isZoomDependent(value: PropertyValue): value is ZoomDependentValue {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'zoom-dependent';
}

/**
 * Interpolate a zoom-dependent value for a specific zoom level
 * Uses linear interpolation between stops
 */
export function interpolateValue(zoomValue: ZoomDependentValue, currentZoom: number): number {
  const { stops } = zoomValue;

  if (stops.length === 0) {
    return 0;
  }

  if (stops.length === 1) {
    return stops[0].value;
  }

  // Clamp to range
  if (currentZoom <= stops[0].zoom) {
    return stops[0].value;
  }

  if (currentZoom >= stops[stops.length - 1].zoom) {
    return stops[stops.length - 1].value;
  }

  // Find the two stops to interpolate between
  for (let i = 0; i < stops.length - 1; i++) {
    const lower = stops[i];
    const upper = stops[i + 1];

    if (currentZoom >= lower.zoom && currentZoom <= upper.zoom) {
      // Linear interpolation
      const t = (currentZoom - lower.zoom) / (upper.zoom - lower.zoom);
      return lower.value + t * (upper.value - lower.value);
    }
  }

  // Fallback (shouldn't reach here)
  return stops[stops.length - 1].value;
}

/**
 * Resolve a property value to a concrete value at a given zoom level
 * Handles both static and zoom-dependent values
 */
export function resolveValue(value: PropertyValue, currentZoom: number): string | number | boolean {
  if (isZoomDependent(value)) {
    return interpolateValue(value, currentZoom);
  }

  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'color') {
    // Color with optional blend
    return resolveColor(value.base, value.blend, value.blendAmount);
  }

  return value;
}

/**
 * Blend two colors together
 * Format in .mrules: "#FF0000 black 50%" or "#FF0000 white 20%"
 */
function resolveColor(base: string, blend?: string, amount?: number): string {
  if (!blend || amount === undefined) {
    return base;
  }

  const baseRgb = parseColor(base);
  const blendRgb = parseColor(blend);

  if (!baseRgb || !blendRgb) {
    return base;
  }

  const t = amount / 100;
  const r = Math.round(baseRgb.r + t * (blendRgb.r - baseRgb.r));
  const g = Math.round(baseRgb.g + t * (blendRgb.g - baseRgb.g));
  const b = Math.round(baseRgb.b + t * (blendRgb.b - baseRgb.b));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Parse a color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Named colors
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    orange: { r: 255, g: 165, b: 0 },
    purple: { r: 128, g: 0, b: 128 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    beige: { r: 245, g: 245, b: 220 },
    lightblue: { r: 173, g: 216, b: 230 },
  };

  const lowerColor = color.toLowerCase();
  if (namedColors[lowerColor]) {
    return namedColors[lowerColor];
  }

  // Hex color
  const hexMatch = color.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // Short hex color
  const shortHexMatch = color.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
    };
  }

  return null;
}

/**
 * Parse a color value that may include blend syntax
 * Example: "#849BBD black 20%" -> { base: "#849BBD", blend: "black", blendAmount: 20 }
 */
export function parseColorWithBlend(value: string): { base: string; blend?: string; blendAmount?: number } {
  const blendMatch = value.match(/^(.+?)\s+(black|white|[#\w]+)\s+(\d+)%$/);
  if (blendMatch) {
    return {
      base: blendMatch[1].trim(),
      blend: blendMatch[2],
      blendAmount: parseInt(blendMatch[3], 10),
    };
  }

  return { base: value };
}
