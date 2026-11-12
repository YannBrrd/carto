import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useColorEditing } from './useColorEditing';
import { ColorEditMode, Zone } from '../types';

// Two buildings, each inside its own zone, and one outside both
const square = (id: number, lat: number, lon: number) => [
  { type: 'node', id: id * 10 + 1, lat, lon },
  { type: 'node', id: id * 10 + 2, lat, lon: lon + 0.0002 },
  { type: 'node', id: id * 10 + 3, lat: lat + 0.0002, lon: lon + 0.0002 },
  { type: 'node', id: id * 10 + 4, lat: lat + 0.0002, lon },
  { type: 'way', id, nodes: [id * 10 + 1, id * 10 + 2, id * 10 + 3, id * 10 + 4, id * 10 + 1], tags: { building: 'yes' } },
];
const osmData = { elements: [...square(1, 48.8501, 2.3501), ...square(2, 48.8601, 2.3601), ...square(3, 48.8701, 2.3701)] };

const zone = (id: string, lat: number, lon: number): Zone => ({
  id,
  type: 'Polygon',
  coordinates: [[lat, lon], [lat, lon + 0.001], [lat + 0.001, lon + 0.001], [lat + 0.001, lon]],
  bounds: null as never,
});
const zones = [zone('zone-a', 48.85, 2.35), zone('zone-b', 48.86, 2.36)];

const mode: ColorEditMode = { active: true, selectedColor: '#ff0000', selectedCategory: 'building', selectionMode: 'click' };

describe('useColorEditing click', () => {
  it('ties the override to the zone that contains the feature, whatever the active zone', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useColorEditing(null, osmData, zones, mode, apply));

    expect(result.current.handleElementClick(2, 'building')).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(2, '#ff0000', 'building', 'zone-b');
    expect(result.current.handleElementClick(1, 'building')).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(1, '#ff0000', 'building', 'zone-a');
  });

  it('leaves a feature outside every zone alone', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useColorEditing(null, osmData, zones, mode, apply));
    expect(result.current.handleElementClick(3, 'building')).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
