import { describe, it, expect } from 'vitest';
import { migrateStyle } from './migrateStyle';
import { MAPS_STYLE } from './defaultPresets';
import { RenderStyle } from '../types';

// A custom preset saved before footways got their own style
function legacyStyle(): RenderStyle {
  const style = structuredClone(MAPS_STYLE) as RenderStyle;
  delete (style.highway as Partial<RenderStyle['highway']>).footway;
  style.highway.path = { color: '#6e7c6d', opacity: 0.7, lineStyle: 'dash' };
  return style;
}

describe('migrateStyle', () => {
  it('gives footways the style paths had, so saved presets look the same', () => {
    const migrated = migrateStyle(legacyStyle());
    expect(migrated.highway.footway).toEqual({ color: '#6e7c6d', opacity: 0.7, lineStyle: 'dash' });
    expect(migrated.highway.footway).not.toBe(migrated.highway.path);
  });

  it('keeps an existing footway style', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.footway = { color: '#aaaaaa', opacity: 1 };
    expect(migrateStyle(style).highway.footway).toEqual({ color: '#aaaaaa', opacity: 1 });
  });

  it('still adds the construction building style to presets saved before it existed', () => {
    const style = legacyStyle();
    delete (style.building as Partial<RenderStyle['building']>).construction;
    expect(migrateStyle(style).building.construction).toEqual({ color: '#f0f0f0', opacity: 0.6, strokeColor: '#c0c0c0' });
  });
});
