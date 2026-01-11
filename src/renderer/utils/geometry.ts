/**
 * Geometry utilities for map operations
 * Point-in-polygon tests, centroid calculations, and spline interpolation
 */

import L from 'leaflet';
import { ElementCategory } from '../types';

/**
 * Fast object fingerprint for shallow comparison (faster than JSON.stringify)
 * @param obj - Object to fingerprint
 * @returns String fingerprint
 */
export function objectFingerprint(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    parts.push(key + ':' + (typeof val === 'object' && val !== null ? objectFingerprint(val as Record<string, unknown>) : String(val)));
  }
  return parts.join('|');
}

/**
 * Catmull-Rom spline interpolation (passes through all control points)
 * Used for smooth polygon rounding
 * @param points - Control points
 * @param numPointsPerSegment - Number of interpolated points per segment
 * @returns Interpolated points
 */
export function catmullRomSpline(points: L.LatLng[], numPointsPerSegment: number = 10): L.LatLng[] {
  if (points.length < 2) return points;
  if (points.length === 2) {
    // Just interpolate linearly between 2 points
    const result: L.LatLng[] = [];
    for (let i = 0; i <= numPointsPerSegment; i++) {
      const t = i / numPointsPerSegment;
      const lat = points[0].lat + t * (points[1].lat - points[0].lat);
      const lng = points[0].lng + t * (points[1].lng - points[0].lng);
      result.push(L.latLng(lat, lng));
    }
    return result;
  }

  const result: L.LatLng[] = [];

  // For each segment between points
  for (let i = 0; i < points.length - 1; i++) {
    // Get 4 control points (p0, p1, p2, p3)
    // For endpoints, we mirror the points
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : points[points.length - 1];

    // Generate points along this segment
    for (let j = 0; j < numPointsPerSegment; j++) {
      const t = j / numPointsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom basis functions
      const lat = 0.5 * (
        (2 * p1.lat) +
        (-p0.lat + p2.lat) * t +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3
      );
      const lng = 0.5 * (
        (2 * p1.lng) +
        (-p0.lng + p2.lng) * t +
        (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
        (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3
      );

      result.push(L.latLng(lat, lng));
    }
  }

  // Add the last point
  result.push(points[points.length - 1]);

  return result;
}

/**
 * Ray-casting algorithm for point-in-polygon test
 * @param point - Point with lat/lon coordinates
 * @param polygon - Array of [lat, lng] pairs defining the polygon
 * @returns true if point is inside the polygon
 */
export function isPointInPolygon(
  point: { lat: number; lon: number },
  polygon: number[][]
): boolean {
  let inside = false;
  const x = point.lon;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1]; // lon
    const yi = polygon[i][0]; // lat
    const xj = polygon[j][1];
    const yj = polygon[j][0];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculate centroid of a way from its nodes
 * @param way - OSM way object with nodes array
 * @param nodes - Map of node ID to {lat, lon}
 * @returns Centroid coordinates or null if no valid nodes
 */
export function getWayCentroid(
  way: { nodes: number[] },
  nodes: Map<number, { lat: number; lon: number }>
): { lat: number; lon: number } | null {
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;

  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (node) {
      sumLat += node.lat;
      sumLon += node.lon;
      count++;
    }
  }

  if (count === 0) return null;
  return { lat: sumLat / count, lon: sumLon / count };
}

/**
 * Check if a way matches a specific category
 * @param way - OSM way object with tags
 * @param category - Element category to match
 * @returns true if way belongs to the category
 */
export function matchesCategory(
  way: { tags?: Record<string, string> },
  category: ElementCategory
): boolean {
  if (!way.tags) return false;

  switch (category) {
    case 'building':
      return !!way.tags.building;
    case 'highway':
      return !!way.tags.highway;
    case 'natural':
      return !!way.tags.natural ||
             way.tags.landuse === 'forest' ||
             way.tags.leisure === 'park' ||
             way.tags.leisure === 'garden';
    case 'waterway':
      return !!way.tags.waterway || way.tags.natural === 'water';
    default:
      return false;
  }
}

// Cache for buildNodeMap results (WeakMap allows GC when osmData is no longer referenced)
const nodeMapCache = new WeakMap<object, Map<number, { lat: number; lon: number }>>();

/**
 * Build a node map from OSM data elements (cached per osmData reference)
 * @param osmData - OSM data with elements array
 * @returns Map of node ID to {lat, lon}
 */
export function buildNodeMap(
  osmData: { elements: Array<{ type: string; id: number; lat?: number; lon?: number }> }
): Map<number, { lat: number; lon: number }> {
  // Return cached result if available
  const cached = nodeMapCache.get(osmData);
  if (cached) {
    return cached;
  }

  const nodes = new Map<number, { lat: number; lon: number }>();

  for (const el of osmData.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Cache the result
  nodeMapCache.set(osmData, nodes);

  return nodes;
}

// Cache for derived casing colors (with size limit to prevent memory leaks)
const casingColorCache = new Map<string, string>();
const MAX_CASING_CACHE_SIZE = 100;

/**
 * Darken a hex color by a fixed amount for road casing (memoized)
 * @param fillColor - Hex color string (e.g., "#RRGGBB")
 * @returns Darkened hex color
 */
export function deriveCasingColor(fillColor: string): string {
  const cached = casingColorCache.get(fillColor);
  if (cached) return cached;

  // Clear cache if it gets too large to prevent memory buildup
  if (casingColorCache.size >= MAX_CASING_CACHE_SIZE) {
    casingColorCache.clear();
  }

  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
  const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

  casingColorCache.set(fillColor, result);
  return result;
}
