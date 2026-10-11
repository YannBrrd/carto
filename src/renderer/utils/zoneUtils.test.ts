import { describe, it, expect } from 'vitest';
import { mergeZoneRings } from './zoneUtils';
import { Zone } from '../types';

const square = (id: string, south: number, west: number, size: number): Zone => ({
  id,
  type: 'Rectangle',
  coordinates: [[south, west], [south, west + size], [south + size, west + size], [south + size, west]],
});

describe('mergeZoneRings', () => {
  it('merges overlapping zones into one outline, as [lat, lng] rings', () => {
    const rings = mergeZoneRings([square('a', 0, 0, 2), square('b', 1, 1, 2)]);
    expect(rings).toHaveLength(1);
    const lats = rings[0].map(([lat]) => lat);
    expect(Math.min(...lats)).toBe(0);
    expect(Math.max(...lats)).toBe(3);
  });

  it('keeps one outline per separate zone', () => {
    expect(mergeZoneRings([square('a', 0, 0, 1), square('b', 5, 5, 1)])).toHaveLength(2);
  });

  it('ignores zones without at least three points', () => {
    expect(mergeZoneRings([{ id: 'a', type: 'Polygon', coordinates: [[0, 0], [1, 1]] }])).toEqual([]);
  });
});
