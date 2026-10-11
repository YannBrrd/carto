import L from 'leaflet';
import * as turf from '@turf/turf';
import { Zone } from '../types';

/**
 * Outer rings of the union of the zones, as [lat, lng] points: overlapping zones share
 * one outline, as the map preview and the SVG export draw them
 */
export function mergeZoneRings(zones: Zone[]): [number, number][][] {
  let merged: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = null;
  for (const zone of zones) {
    if (!zone.coordinates || zone.coordinates.length < 3) continue;

    // Turf uses [lng, lat] format, and polygons must be closed
    const coords = zone.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
    const [first, last] = [coords[0], coords[coords.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push([...first]);

    try {
      const polygon = turf.polygon([coords]);
      merged = merged ? (turf.union(merged, polygon) as turf.Feature<turf.Polygon | turf.MultiPolygon> | null) ?? merged : polygon;
    } catch (e) {
      console.warn('Failed to union zone polygons:', e);
    }
  }
  if (!merged) return [];

  const geometry = merged.geometry;
  const outers = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map(polygon => polygon[0]);
  return outers.map(ring => ring.map(([lng, lat]) => [lat, lng] as [number, number]));
}

/**
 * Generate a unique zone ID
 */
export function generateZoneId(): string {
  return `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate context bounds that encompass all zones with margin
 * @param zones Array of zones
 * @param existingBounds Current context bounds (if any)
 * @param locked If true and existing bounds contain all zones, keep existing
 * @param margin Margin as fraction (default 0.2 = 20%)
 */
export function calculateContextBounds(
  zones: Zone[],
  existingBounds: L.LatLngBounds | null,
  locked: boolean,
  margin: number = 0.2
): L.LatLngBounds | null {
  if (zones.length === 0) return null;

  // Calculate union of all zone bounds
  let unionBounds: L.LatLngBounds | null = null;
  for (const zone of zones) {
    if (zone.bounds) {
      if (!unionBounds) {
        unionBounds = L.latLngBounds(
          zone.bounds.getSouthWest(),
          zone.bounds.getNorthEast()
        );
      } else {
        unionBounds.extend(zone.bounds);
      }
    }
  }

  if (!unionBounds) return null;

  // If locked and existing bounds contain all zones, keep existing
  if (locked && existingBounds) {
    const allZonesContained = zones.every(
      (zone) => zone.bounds && existingBounds.contains(zone.bounds)
    );
    if (allZonesContained) {
      return existingBounds;
    }
  }

  // Add margin to union bounds
  const latSpan = unionBounds.getNorth() - unionBounds.getSouth();
  const lngSpan = unionBounds.getEast() - unionBounds.getWest();
  const marginLat = latSpan * margin;
  const marginLng = lngSpan * margin;

  return L.latLngBounds(
    [unionBounds.getSouth() - marginLat, unionBounds.getWest() - marginLng],
    [unionBounds.getNorth() + marginLat, unionBounds.getEast() + marginLng]
  );
}

/**
 * Check if bounds contain all zones
 */
export function boundsContainAllZones(
  bounds: L.LatLngBounds,
  zones: Zone[]
): boolean {
  if (zones.length === 0) return true;
  return zones.every((zone) => zone.bounds && bounds.contains(zone.bounds));
}

/**
 * Get minimum bounds that must contain (union of all zone bounds)
 */
export function getMinimumBounds(zones: Zone[]): L.LatLngBounds | null {
  if (zones.length === 0) return null;

  let unionBounds: L.LatLngBounds | null = null;
  for (const zone of zones) {
    if (zone.bounds) {
      if (!unionBounds) {
        unionBounds = L.latLngBounds(
          zone.bounds.getSouthWest(),
          zone.bounds.getNorthEast()
        );
      } else {
        unionBounds.extend(zone.bounds);
      }
    }
  }

  return unionBounds;
}

/**
 * Check if all zones fit within reasonable viewport constraints
 * Returns true if zones are reasonably close together
 */
export function zonesWithinViewportConstraint(
  zones: Zone[],
  maxSpanDegrees: number = 0.1 // ~10km at equator
): boolean {
  if (zones.length <= 1) return true;

  const minBounds = getMinimumBounds(zones);
  if (!minBounds) return true;

  const latSpan = minBounds.getNorth() - minBounds.getSouth();
  const lngSpan = minBounds.getEast() - minBounds.getWest();

  return latSpan <= maxSpanDegrees && lngSpan <= maxSpanDegrees;
}

export const MAX_ZONES = 5;
