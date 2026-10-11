import { describe, it, expect } from 'vitest';
import { OSM_CARTO_STYLE } from './defaultPresets';
import { deriveCasingColor } from '../utils/geometry';

describe('OpenStreetMap preset', () => {
  // Areas are outlined only when their style has a stroke color: the preset keeps the
  // darker outline the SVG export used to derive for water, woods and forests
  it('outlines water, woods and forests with a darker shade of their color', () => {
    for (const area of [OSM_CARTO_STYLE.natural.water, OSM_CARTO_STYLE.natural.wood, OSM_CARTO_STYLE.landuse.forest]) {
      expect(area.strokeColor).toBe(deriveCasingColor(area.color));
    }
  });

  it('does not tint the zone interior, so exports keep the preset colors', () => {
    expect(OSM_CARTO_STYLE.fillOpacity).toBe(0);
  });

  it('keeps building shadows', () => {
    expect(OSM_CARTO_STYLE.buildingShadows).not.toBe(false);
  });
});
