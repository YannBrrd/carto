/**
 * Reading of a territory from a KML file (batch export): every polygon of the file is a
 * zone, as the application draws them. A file the export cannot draw as it is, is rejected
 * as a whole, with the reason, rather than drawn differently.
 */

import L from 'leaflet';
import { Zone } from '../types';
import { MAX_ZONES } from './zoneUtils';

export type KmlRejection =
  | 'invalid-xml'
  | 'not-kml'
  | 'no-polygon'
  | 'too-many-zones'
  | 'invalid-coordinates'
  | 'degenerate-polygon'
  | 'polygon-with-holes';

export type KmlReadResult =
  | { ok: true; zones: Zone[] }
  | { ok: false; reason: KmlRejection; message: string };

class Rejected extends Error {
  constructor(readonly reason: KmlRejection, message: string) {
    super(message);
  }
}

// Child elements of a given local name, whatever the KML namespace (2.2, 2.1 or none)
const childrenNamed = (element: Element, name: string) =>
  Array.from(element.children).filter(child => child.localName === name);

// [lat, lng] points of a KML coordinates text ("lng,lat[,alt]" tuples), without the closing point
function readRing(text: string, polygonNumber: number): number[][] {
  const invalid = () => new Rejected('invalid-coordinates', `Polygone ${polygonNumber} : coordonnées invalides.`);
  const points = text.trim().split(/\s+/).filter(Boolean).map(tuple => {
    const values = tuple.split(',');
    if (values.length < 2 || values.length > 3) throw invalid();
    const [lng, lat] = values.map(value => (value.trim() === '' ? NaN : Number(value)));
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw invalid();
    return [lat, lng];
  });

  const [first, last] = [points[0], points[points.length - 1]];
  if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
  return points;
}

// Whether a ring encloses no area: its shoelace area is negligible next to its extent
// (aligned points give a rounding residue, not an exact zero)
function hasNoArea(points: number[][]): boolean {
  const doubleArea = points.reduce((sum, [y1, x1], i) => {
    const [y2, x2] = points[(i + 1) % points.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0);
  const extent = (values: number[]) => Math.max(...values) - Math.min(...values);
  const box = extent(points.map(([lat]) => lat)) * extent(points.map(([, lng]) => lng));
  return Math.abs(doubleArea) <= box * 1e-9;
}

function readPolygon(polygon: Element, index: number): Zone {
  const number = index + 1;
  if (childrenNamed(polygon, 'innerBoundaryIs').length > 0) {
    throw new Rejected('polygon-with-holes', `Polygone ${number} : les polygones à trous ne sont pas pris en charge.`);
  }

  const coordinates = childrenNamed(polygon, 'outerBoundaryIs')
    .flatMap(boundary => childrenNamed(boundary, 'LinearRing'))
    .flatMap(linearRing => childrenNamed(linearRing, 'coordinates'))[0];
  if (!coordinates) {
    throw new Rejected('invalid-coordinates', `Polygone ${number} : contour extérieur absent.`);
  }

  const points = readRing(coordinates.textContent ?? '', number);
  const distinct = new Set(points.map(point => point.join()));
  if (distinct.size < 3 || hasNoArea(points)) {
    throw new Rejected('degenerate-polygon', `Polygone ${number} : moins de trois points distincts ou surface nulle.`);
  }

  return {
    id: `kml-zone-${number}`,
    type: 'Polygon',
    coordinates: points,
    bounds: L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng))),
  };
}

/** Zones of a territory KML, or why the file is rejected */
export function readTerritoryKml(text: string): KmlReadResult {
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
      throw new Rejected('invalid-xml', 'Fichier XML illisible.');
    }
    if (doc.documentElement.localName !== 'kml') {
      throw new Rejected('not-kml', "Le fichier n'est pas un document KML.");
    }

    // Placemarks, folders and multi-geometries alike, in document order
    const polygons = Array.from(doc.getElementsByTagNameNS('*', 'Polygon'));
    if (polygons.length === 0) {
      throw new Rejected('no-polygon', 'Aucun polygone dans le fichier.');
    }
    if (polygons.length > MAX_ZONES) {
      throw new Rejected('too-many-zones', `${polygons.length} polygones : ${MAX_ZONES} zones au maximum.`);
    }

    return { ok: true, zones: polygons.map(readPolygon) };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.reason, message: error.message };
    throw error;
  }
}
