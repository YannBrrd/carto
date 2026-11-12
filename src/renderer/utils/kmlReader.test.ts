import { describe, it, expect } from 'vitest';
import { readTerritoryKml, KmlRejection } from './kmlReader';
import { zonesToKml } from './kml';
import { MAX_ZONES } from './zoneUtils';
import { Zone } from '../types';

// KML ring of [lng, lat] pairs
const ring = (points: number[][]) => points.map(([lng, lat]) => `${lng},${lat}`).join(' ');

const SQUARE = [[2.35, 48.855], [2.356, 48.855], [2.356, 48.857], [2.35, 48.857], [2.35, 48.855]];

const polygon = (points: number[][] = SQUARE, holes: number[][][] = []) => `
  <Polygon>
    <outerBoundaryIs><LinearRing><coordinates>${ring(points)}</coordinates></LinearRing></outerBoundaryIs>
    ${holes.map(hole => `<innerBoundaryIs><LinearRing><coordinates>${ring(hole)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}
  </Polygon>`;

const kml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;

const placemark = (geometry: string) => `<Placemark><name>P</name>${geometry}</Placemark>`;

// Translated copy of the square, so every zone is distinct
const shifted = (dx: number) => SQUARE.map(([lng, lat]) => [lng + dx, lat]);

function zonesOf(text: string): Zone[] {
  const result = readTerritoryKml(text);
  if (!result.ok) throw new Error(`Rejected: ${result.reason} (${result.message})`);
  return result.zones;
}

function rejectionOf(text: string): KmlRejection {
  const result = readTerritoryKml(text);
  if (result.ok) throw new Error('Accepted');
  expect(result.message).toMatch(/\S/);
  return result.reason;
}

describe('readTerritoryKml', () => {
  it('reads a polygon as a zone of [lat, lng] points, without the closing point', () => {
    const [zone] = zonesOf(kml(placemark(polygon())));
    expect(zone.type).toBe('Polygon');
    expect(zone.coordinates).toEqual([[48.855, 2.35], [48.855, 2.356], [48.857, 2.356], [48.857, 2.35]]);
  });

  it('gives each zone its bounds and its own id', () => {
    const zones = zonesOf(kml(placemark(polygon()) + placemark(polygon(shifted(0.01)))));
    expect(zones[0].bounds.getSouth()).toBe(48.855);
    expect(zones[0].bounds.getNorth()).toBe(48.857);
    expect(zones[0].bounds.getWest()).toBe(2.35);
    expect(zones[0].bounds.getEast()).toBe(2.356);
    expect(new Set(zones.map(z => z.id)).size).toBe(2);
  });

  it('reads the polygons of every placemark, folder and multi-geometry, in document order', () => {
    const text = kml(`
      ${placemark(polygon())}
      <Folder><Folder>${placemark(polygon(shifted(0.01)))}</Folder></Folder>
      ${placemark(`<MultiGeometry>${polygon(shifted(0.02))}${polygon(shifted(0.03))}</MultiGeometry>`)}`);
    expect(zonesOf(text).map(z => z.coordinates[0][1])).toEqual([2.35, 2.36, 2.37, 2.38]);
  });

  it('ignores points and lines', () => {
    const text = kml(`
      ${placemark('<Point><coordinates>2.35,48.85</coordinates></Point>')}
      ${placemark(`<LineString><coordinates>${ring(SQUARE)}</coordinates></LineString>`)}
      ${placemark(polygon())}`);
    expect(zonesOf(text)).toHaveLength(1);
  });

  it('reads altitudes, open rings and any whitespace between tuples', () => {
    const text = kml(placemark(`<Polygon><outerBoundaryIs><LinearRing><coordinates>
      2.35,48.855,35\t2.356,48.855,35
      2.356,48.857,0    2.35,48.857,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon>`));
    expect(zonesOf(text)[0].coordinates).toHaveLength(4);
  });

  it('reads KML 2.1 and KML without namespace', () => {
    const body = `<Document>${placemark(polygon())}</Document>`;
    expect(zonesOf(`<kml xmlns="http://earth.google.com/kml/2.1">${body}</kml>`)).toHaveLength(1);
    expect(zonesOf(`<kml>${body}</kml>`)).toHaveLength(1);
  });

  it(`accepts ${MAX_ZONES} zones`, () => {
    const placemarks = Array.from({ length: MAX_ZONES }, (_, i) => placemark(polygon(shifted(i * 0.01))));
    expect(zonesOf(kml(placemarks.join('')))).toHaveLength(MAX_ZONES);
  });

  it('reads back the zones the application exports', () => {
    const zones: Zone[] = [
      { id: 'a', type: 'Polygon', coordinates: [[48.857, 2.35], [48.857, 2.356], [48.855, 2.356], [48.855, 2.35]] },
      { id: 'b', type: 'Polygon', coordinates: [[48.86, 2.36], [48.858, 2.358], [48.858, 2.362]] },
    ];
    const read = zonesOf(zonesToKml(zones, { borderColor: '#000000' }));
    expect(read).toHaveLength(2);
    // Same points, whatever the winding the export chose
    read.forEach((zone, i) => {
      const sort = (points: number[][]) => [...points].map(p => p.join()).sort();
      expect(sort(zone.coordinates)).toEqual(sort(zones[i].coordinates));
    });
  });

  describe('rejections', () => {
    it('rejects text that is not XML', () => {
      expect(rejectionOf('not xml <<<')).toBe('invalid-xml');
      expect(rejectionOf('')).toBe('invalid-xml');
    });

    it('rejects an XML document that is not KML', () => {
      expect(rejectionOf('<?xml version="1.0"?><gpx></gpx>')).toBe('not-kml');
    });

    it('rejects a KML without polygon', () => {
      expect(rejectionOf(kml(placemark('<Point><coordinates>2.35,48.85</coordinates></Point>')))).toBe('no-polygon');
      expect(rejectionOf(kml(''))).toBe('no-polygon');
    });

    it(`rejects more than ${MAX_ZONES} zones, giving their number`, () => {
      const placemarks = Array.from({ length: MAX_ZONES + 2 }, (_, i) => placemark(polygon(shifted(i * 0.01))));
      const result = readTerritoryKml(kml(placemarks.join('')));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('too-many-zones');
        expect(result.message).toContain(String(MAX_ZONES + 2));
      }
    });

    it('rejects coordinates that are not numbers or out of range', () => {
      const bad = (points: string) => kml(placemark(`<Polygon><outerBoundaryIs><LinearRing><coordinates>${points}</coordinates></LinearRing></outerBoundaryIs></Polygon>`));
      expect(rejectionOf(bad('2.35,48.85 abc,48.86 2.36,48.86'))).toBe('invalid-coordinates');
      expect(rejectionOf(bad('2.35 2.36,48.86 2.37,48.85'))).toBe('invalid-coordinates');
      expect(rejectionOf(bad('2.35,95 2.36,48.86 2.37,48.85'))).toBe('invalid-coordinates');
      expect(rejectionOf(bad('190,48.85 2.36,48.86 2.37,48.85'))).toBe('invalid-coordinates');
    });

    it('rejects a polygon without outer ring', () => {
      expect(rejectionOf(kml(placemark('<Polygon></Polygon>')))).toBe('invalid-coordinates');
    });

    it('rejects a polygon of fewer than three distinct points or of no area', () => {
      expect(rejectionOf(kml(placemark(polygon([[2.35, 48.85], [2.36, 48.86], [2.35, 48.85]]))))).toBe('degenerate-polygon');
      expect(rejectionOf(kml(placemark(polygon([[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]]))))).toBe('degenerate-polygon');
    });

    it('rejects a polygon with holes, which zones cannot draw', () => {
      const hole = [[2.352, 48.8555], [2.354, 48.8555], [2.354, 48.8565], [2.352, 48.8555]];
      expect(rejectionOf(kml(placemark(polygon(SQUARE, [hole]))))).toBe('polygon-with-holes');
    });

    it('rejects the whole territory when one of its polygons is invalid', () => {
      const text = kml(placemark(polygon()) + placemark(polygon([[2.35, 48.85], [2.36, 48.86], [2.35, 48.85]])));
      expect(rejectionOf(text)).toBe('degenerate-polygon');
    });
  });
});
