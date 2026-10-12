import { describe, it, expect } from 'vitest';
import { zonesToKml, kmlColor } from './kml';
import { Zone } from '../types';

const KML_NS = 'http://www.opengis.net/kml/2.2';

// Clockwise on the map (north-west, north-east, south-east, south-west), as [lat, lng]
const square: Zone = {
  id: 'zone-a',
  type: 'Polygon',
  coordinates: [[48.857, 2.350], [48.857, 2.356], [48.855, 2.356], [48.855, 2.350]],
};
const triangle: Zone = {
  id: 'zone-b',
  type: 'Polygon',
  coordinates: [[48.86, 2.36], [48.858, 2.358], [48.858, 2.362]],
};

function parse(kml: string): Document {
  const doc = new DOMParser().parseFromString(kml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

// [lng, lat] pairs of the outer ring of a placemark
function ringOf(placemark: Element): number[][] {
  const text = placemark.getElementsByTagNameNS(KML_NS, 'coordinates')[0].textContent!.trim();
  return text.split(/\s+/).map(tuple => tuple.split(',').map(Number));
}

// Shoelace sum in lng/lat: positive for a counterclockwise ring
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

describe('kmlColor', () => {
  it('writes opaque colors in KML order (alpha, blue, green, red)', () => {
    expect(kmlColor('#3b82f6')).toBe('fff6823b');
    expect(kmlColor('red')).toBe('ff0000ff');
  });

  it('falls back to black for values that are not colors', () => {
    expect(kmlColor('nonsense')).toBe('ff000000');
  });
});

describe('zonesToKml', () => {
  it('writes a KML 2.2 document with one placemark per zone, in order', () => {
    const doc = parse(zonesToKml([square, triangle], { borderColor: '#000000' }));
    expect(doc.documentElement.namespaceURI).toBe(KML_NS);
    expect(doc.documentElement.localName).toBe('kml');
    const placemarks = Array.from(doc.getElementsByTagNameNS(KML_NS, 'Placemark'));
    expect(placemarks.map(p => p.getElementsByTagNameNS(KML_NS, 'name')[0].textContent)).toEqual(['Zone 1', 'Zone 2']);
  });

  it('writes longitude before latitude, in a closed ring', () => {
    const doc = parse(zonesToKml([square], { borderColor: '#000000' }));
    const ring = ringOf(doc.getElementsByTagNameNS(KML_NS, 'Placemark')[0]);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) {
      expect(lng).toBeGreaterThan(2.3);
      expect(lng).toBeLessThan(2.4);
      expect(lat).toBeGreaterThan(48.8);
      expect(lat).toBeLessThan(48.9);
    }
    expect(new Set(ring.slice(0, 4).map(point => point.join(',')))).toEqual(
      new Set(square.coordinates.map(([lat, lng]) => `${lng},${lat}`))
    );
  });

  it('orients every outer ring counterclockwise, as the KML specification asks', () => {
    const counterclockwise: Zone = { ...square, coordinates: [...square.coordinates].reverse() };
    const doc = parse(zonesToKml([square, counterclockwise, triangle], { borderColor: '#000000' }));
    for (const placemark of Array.from(doc.getElementsByTagNameNS(KML_NS, 'Placemark'))) {
      expect(signedArea(ringOf(placemark))).toBeGreaterThan(0);
    }
  });

  it('keeps the coordinates of a ring the user already closed without repeating the first point twice', () => {
    const closed: Zone = { ...square, coordinates: [...square.coordinates, square.coordinates[0]] };
    const ring = ringOf(parse(zonesToKml([closed], { borderColor: '#000000' })).getElementsByTagNameNS(KML_NS, 'Placemark')[0]);
    expect(ring).toHaveLength(5);
  });

  it('draws the zones with the export border color and no fill', () => {
    const doc = parse(zonesToKml([square], { borderColor: '#3b82f6' }));
    const lineStyle = doc.getElementsByTagNameNS(KML_NS, 'LineStyle')[0];
    expect(lineStyle.getElementsByTagNameNS(KML_NS, 'color')[0].textContent).toBe('fff6823b');
    const polyStyle = doc.getElementsByTagNameNS(KML_NS, 'PolyStyle')[0];
    expect(polyStyle.getElementsByTagNameNS(KML_NS, 'fill')[0].textContent).toBe('0');
    const styleUrl = doc.getElementsByTagNameNS(KML_NS, 'styleUrl')[0].textContent!;
    expect(doc.getElementById(styleUrl.slice(1))).not.toBeNull();
  });

  it('escapes the document name', () => {
    const kml = zonesToKml([square], { borderColor: '#000000', name: 'Rue <A> & "B"' });
    const doc = parse(kml);
    expect(doc.getElementsByTagNameNS(KML_NS, 'Document')[0].getElementsByTagNameNS(KML_NS, 'name')[0].textContent)
      .toBe('Rue <A> & "B"');
  });

  it('skips zones with fewer than three points or with coordinates that are not numbers', () => {
    const line: Zone = { id: 'line', type: 'Polygon', coordinates: [[48.85, 2.35], [48.86, 2.36]] };
    const broken: Zone = { id: 'broken', type: 'Polygon', coordinates: [[48.85, NaN], [48.86, 2.36], [48.87, 2.37]] };
    const doc = parse(zonesToKml([line, square, broken], { borderColor: '#000000' }));
    const placemarks = doc.getElementsByTagNameNS(KML_NS, 'Placemark');
    expect(placemarks).toHaveLength(1);
    expect(placemarks[0].getElementsByTagNameNS(KML_NS, 'name')[0].textContent).toBe('Zone 2');
  });
});
