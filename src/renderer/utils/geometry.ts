/**
 * Geometry utilities for map operations
 * Point-in-polygon tests, centroid calculations, and spline interpolation
 */

import L from 'leaflet';
import { normalizeColor } from './colors';

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

/**
 * Resolved multipolygon with outer rings and inner rings (holes)
 */
export interface ResolvedMultipolygon {
  id: number;
  tags: Record<string, string>;
  outer: [number, number][][];  // Array of outer rings, each ring is [lat, lon][]
  inner: [number, number][][];  // Array of inner rings (holes)
}

/**
 * Join the node lists of member ways into closed rings: ways meet at their end
 * nodes, in either direction. Ways that cannot be closed into a ring (members
 * missing from the data) are dropped.
 * @param ways - Node ids of each way
 * @returns Node ids of each ring, first node repeated at the end
 */
export function assembleRings(ways: number[][]): number[][] {
  const open = ways.filter(nodes => nodes.length >= 2);
  const used = new Array<boolean>(open.length).fill(false);
  const rings: number[][] = [];

  for (let start = 0; start < open.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const ring = [...open[start]];

    // Extend the ring from its last node until it is closed or no way continues it
    while (ring[0] !== ring[ring.length - 1]) {
      const last = ring[ring.length - 1];
      const next = open.findIndex((nodes, i) => !used[i] && (nodes[0] === last || nodes[nodes.length - 1] === last));
      if (next === -1) break;
      used[next] = true;
      const nodes = open[next][0] === last ? open[next] : [...open[next]].reverse();
      ring.push(...nodes.slice(1));
    }

    // A ring needs three distinct nodes
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) {
      rings.push(ring);
    }
  }
  return rings;
}

/**
 * Resolve multipolygon relations into renderable geometry: member ways are
 * assembled into outer rings (role outer, or no role) and inner rings (holes)
 * @param osmData - OSM data with elements array
 * @param nodeMap - Map of node ID to {lat, lon}
 * @returns Array of resolved multipolygons
 */
export function resolveMultipolygons(
  osmData: { elements: any[] },
  nodeMap: Map<number, { lat: number; lon: number }>
): ResolvedMultipolygon[] {
  const wayNodes = new Map<number, number[]>();
  for (const el of osmData.elements) {
    if (el.type === 'way' && el.nodes) wayNodes.set(el.id, el.nodes);
  }

  const toCoordinates = (ring: number[]): [number, number][] | null => {
    const coords: [number, number][] = [];
    for (const nodeId of ring) {
      const node = nodeMap.get(nodeId);
      if (!node) return null;  // Incomplete ring: not drawn
      coords.push([node.lat, node.lon]);
    }
    return coords;
  };
  const ringsOf = (roles: string[], members: any[]): [number, number][][] => {
    const ways = members
      .filter(member => member.type === 'way' && roles.includes(member.role) && wayNodes.has(member.ref))
      .map(member => wayNodes.get(member.ref)!);
    return assembleRings(ways)
      .map(toCoordinates)
      .filter((coords): coords is [number, number][] => coords !== null);
  };

  const resolved: ResolvedMultipolygon[] = [];
  for (const el of osmData.elements) {
    if (el.type === 'relation' && el.tags?.type === 'multipolygon' && el.members) {
      const outer = ringsOf(['outer', ''], el.members);
      // Only include if we have at least one outer ring
      if (outer.length > 0) {
        resolved.push({ id: el.id, tags: el.tags, outer, inner: ringsOf(['inner'], el.members) });
      }
    }
  }

  return resolved;
}

/**
 * Calculate the centroid of a ring (array of [lat, lon] coordinates)
 * More robust than using just the first point for containment tests
 * @param ring - Array of [lat, lon] pairs
 * @returns Centroid as {lat, lon} or null if ring is empty
 */
export function getRingCentroid(ring: [number, number][]): { lat: number; lon: number } | null {
  if (ring.length === 0) return null;

  let sumLat = 0;
  let sumLon = 0;
  for (const [lat, lon] of ring) {
    sumLat += lat;
    sumLon += lon;
  }

  return {
    lat: sumLat / ring.length,
    lon: sumLon / ring.length
  };
}

/**
 * Find inner rings (holes) that are contained within a given outer ring
 * Uses centroid-based containment test for better robustness with concave polygons
 * @param outerRing - The outer ring coordinates [lat, lon][]
 * @param innerRings - Array of inner ring coordinates to test
 * @returns Array of inner rings that are contained in the outer ring
 */
export function findContainedInnerRings(
  outerRing: [number, number][],
  innerRings: [number, number][][]
): [number, number][][] {
  const contained: [number, number][][] = [];

  for (const innerRing of innerRings) {
    if (innerRing.length === 0) continue;

    // Use centroid for containment test - more robust than first point
    const centroid = getRingCentroid(innerRing);
    if (centroid && isPointInPolygon(centroid, outerRing)) {
      contained.push(innerRing);
    }
  }

  return contained;
}

// Cache for derived casing colors (with size limit to prevent memory leaks)
const casingColorCache = new Map<string, string>();
const MAX_CASING_CACHE_SIZE = 100;

/**
 * Darken a color by a fixed amount for road casing (memoized)
 * @param fillColor - Color string, normally "#RRGGBB"; other CSS colors are read too
 * @returns Darkened hex color, gray when the color cannot be read
 */
export function deriveCasingColor(fillColor: string): string {
  const cached = casingColorCache.get(fillColor);
  if (cached) return cached;

  // Clear cache if it gets too large to prevent memory buildup
  if (casingColorCache.size >= MAX_CASING_CACHE_SIZE) {
    casingColorCache.clear();
  }

  const hex = normalizeColor(fillColor);
  let result = '#808080';
  if (hex) {
    const darken = (offset: number) => Math.max(0, parseInt(hex.slice(offset, offset + 2), 16) - 40).toString(16).padStart(2, '0');
    result = `#${darken(1)}${darken(3)}${darken(5)}`;
  }

  casingColorCache.set(fillColor, result);
  return result;
}
