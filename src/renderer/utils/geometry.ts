/**
 * Geometry utilities for color override feature
 * Point-in-polygon tests and centroid calculations
 */

import { ElementCategory } from '../types';

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

/**
 * Build a node map from OSM data elements
 * @param osmData - OSM data with elements array
 * @returns Map of node ID to {lat, lon}
 */
export function buildNodeMap(
  osmData: { elements: Array<{ type: string; id: number; lat?: number; lon?: number }> }
): Map<number, { lat: number; lon: number }> {
  const nodes = new Map<number, { lat: number; lon: number }>();

  for (const el of osmData.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  return nodes;
}
