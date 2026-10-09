import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  hexToKmlColor,
  computeOverlayBox,
  zoneToKmlCoordinates,
  generateKml,
  KmlZone,
  KmlStyle,
} from './kmlGenerator';

const style: KmlStyle = {
  interiorColor: '#ff0000',
  borderColor: '#0000ff',
  borderWidth: 3,
  fillOpacity: 0.5,
  strokeOpacity: 1,
};

// Leaflet-style [lat, lng] ring (not closed)
const square: KmlZone = {
  id: 'zone-1',
  coordinates: [
    [48.0, 2.0],
    [48.0, 2.1],
    [48.1, 2.1],
    [48.1, 2.0],
  ],
};

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;'
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeXml('Zone 1')).toBe('Zone 1');
  });
});

describe('hexToKmlColor', () => {
  it('converts #RRGGBB to aabbggrr (alpha first, BGR order)', () => {
    expect(hexToKmlColor('#ff0000', 1)).toBe('ff0000ff');
    expect(hexToKmlColor('#00ff00', 1)).toBe('ff00ff00');
    expect(hexToKmlColor('#0000ff', 1)).toBe('ffff0000');
    expect(hexToKmlColor('#123456', 1)).toBe('ff563412');
  });

  it('encodes opacity as the alpha byte', () => {
    expect(hexToKmlColor('#ffffff', 0)).toBe('00ffffff');
    expect(hexToKmlColor('#ffffff', 0.5)).toBe('80ffffff');
  });

  it('clamps opacity to [0, 1]', () => {
    expect(hexToKmlColor('#ffffff', 2)).toBe('ffffffff');
    expect(hexToKmlColor('#ffffff', -1)).toBe('00ffffff');
  });

  it('expands 3-digit hex and accepts missing #', () => {
    expect(hexToKmlColor('#f00', 1)).toBe('ff0000ff');
    expect(hexToKmlColor('ff0000', 1)).toBe('ff0000ff');
  });

  it('is case-insensitive and outputs lowercase', () => {
    expect(hexToKmlColor('#FF00AA', 1)).toBe('ffaa00ff');
  });

  it('falls back to opaque black on invalid input', () => {
    expect(hexToKmlColor('not-a-color', 1)).toBe('ff000000');
    expect(hexToKmlColor('', 1)).toBe('ff000000');
  });
});

describe('zoneToKmlCoordinates', () => {
  it('swaps [lat, lng] to "lon,lat,0"', () => {
    const out = zoneToKmlCoordinates([[48.5, 2.25], [48.6, 2.35], [48.7, 2.15]]);
    expect(out.split(' ')[0]).toBe('2.25,48.5,0');
  });

  it('closes the ring by repeating the first point', () => {
    const parts = zoneToKmlCoordinates(square.coordinates).split(' ');
    expect(parts).toHaveLength(5);
    expect(parts[4]).toBe(parts[0]);
  });

  it('does not duplicate the closing point if already closed', () => {
    const closed = [...square.coordinates, square.coordinates[0]];
    expect(zoneToKmlCoordinates(closed).split(' ')).toHaveLength(5);
  });
});

describe('computeOverlayBox', () => {
  const bounds = { north: 48.1, south: 48.0, east: 2.1, west: 2.0 };

  it('extends the bounds by the pixel margin (linear lat/lon mapping)', () => {
    // content 400x200 px, margin 50 px => 12.5% horizontally, 25% vertically
    const box = computeOverlayBox(bounds, 400, 200, 50);
    expect(box.west).toBeCloseTo(2.0 - 0.1 * 0.125, 10);
    expect(box.east).toBeCloseTo(2.1 + 0.1 * 0.125, 10);
    expect(box.north).toBeCloseTo(48.1 + 0.1 * 0.25, 10);
    expect(box.south).toBeCloseTo(48.0 - 0.1 * 0.25, 10);
  });

  it('returns the bounds unchanged for a zero margin', () => {
    expect(computeOverlayBox(bounds, 400, 200, 0)).toEqual(bounds);
  });

  it('throws on a non-positive content size', () => {
    expect(() => computeOverlayBox(bounds, 0, 200, 50)).toThrow();
    expect(() => computeOverlayBox(bounds, 400, -1, 50)).toThrow();
  });
});

describe('generateKml', () => {
  it('produces a well-formed KML 2.2 document with one Placemark per zone', () => {
    const kml = generateKml({
      name: 'Ma carte',
      zones: [square, { ...square, id: 'zone-2' }],
      style,
    });
    expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(kml).toContain('xmlns="http://www.opengis.net/kml/2.2"');
    expect(kml.match(/<Placemark>/g)).toHaveLength(2);
    expect(kml).toContain('<name>Zone 1</name>');
    expect(kml).toContain('<name>Zone 2</name>');
  });

  it('writes polygon coordinates as lon,lat,0 and applies the style colors', () => {
    const kml = generateKml({ name: 'x', zones: [square], style });
    expect(kml).toContain('2,48,0');
    expect(kml).toContain('<outerBoundaryIs><LinearRing><coordinates>');
    // fill: red @ 50% => 80 0000ff ; line: blue @ 100% => ff ff0000
    expect(kml).toContain('<PolyStyle><color>800000ff</color>');
    expect(kml).toContain('<LineStyle><color>ffff0000</color><width>3</width>');
  });

  it('escapes the document name', () => {
    const kml = generateKml({ name: 'A & <B>', zones: [square], style });
    expect(kml).toContain('<name>A &amp; &lt;B&gt;</name>');
    expect(kml).not.toContain('<B>');
  });

  it('skips zones with fewer than 3 points', () => {
    const kml = generateKml({
      name: 'x',
      zones: [{ id: 'bad', coordinates: [[1, 2], [3, 4]] }, square],
      style,
    });
    expect(kml.match(/<Placemark>/g)).toHaveLength(1);
  });

  it('adds no GroundOverlay without an overlay option', () => {
    const kml = generateKml({ name: 'x', zones: [square], style });
    expect(kml).not.toContain('GroundOverlay');
  });

  it('adds a GroundOverlay with href and LatLonBox when an overlay is given', () => {
    const kml = generateKml({
      name: 'x',
      zones: [square],
      style,
      overlay: {
        href: 'files/carte.png',
        box: { north: 48.2, south: 47.9, east: 2.2, west: 1.9 },
      },
    });
    expect(kml).toContain('<GroundOverlay>');
    expect(kml).toContain('<href>files/carte.png</href>');
    expect(kml).toContain('<north>48.2</north>');
    expect(kml).toContain('<south>47.9</south>');
    expect(kml).toContain('<east>2.2</east>');
    expect(kml).toContain('<west>1.9</west>');
    // overlay must be drawn below the zone outlines
    expect(kml.indexOf('<GroundOverlay>')).toBeLessThan(kml.indexOf('<Placemark>'));
  });
});
