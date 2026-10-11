import { describe, it, expect } from 'vitest';
import { rulesetToRenderStyle } from './converter';
import { MapProperties, PropertyAssignment, Ruleset } from './types';

function ruleset(rules: Array<[string, PropertyAssignment[]]>, properties: MapProperties = {}): Ruleset {
  return {
    name: 'Test',
    features: [],
    properties,
    rules: rules.map(([featurePattern, props]) => ({
      target: { featurePattern },
      properties: props,
      draws: [],
      conditionals: [],
    })),
  };
}

describe('rulesetToRenderStyle', () => {
  it('maps a road border color to the casing color of the highway style', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_residential', [
        { property: 'line-color', value: '#ffffff' },
        { property: 'border-color', value: '#dadce0' },
      ]],
    ]));
    expect(style.highway.residential).toEqual({ color: '#ffffff', opacity: 1, strokeColor: '#dadce0' });
  });

  it('leaves the casing derived when a road rule has no border color', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_primary', [{ property: 'line-color', value: '#ffffff' }]],
    ]));
    expect(style.highway.primary.strokeColor).toBeUndefined();
  });

  it('uses the fill color of an area and its line color as outline, whatever the order', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['building*', [
        { property: 'fill-color', value: '#e8e8e8' },
        { property: 'fill-opacity', value: 0.9 },
        { property: 'line-color', value: '#d0d0d0' },
        { property: 'line-opacity', value: 0.5 },
      ]],
    ]));
    expect(style.building.default).toEqual({ color: '#e8e8e8', opacity: 0.9, strokeColor: '#d0d0d0' });
  });

  it('expands short hex colors so color pickers and casing derivation can read them', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_tertiary', [
        { property: 'line-color', value: '#FfE' },
        { property: 'border-color', value: '#bbb' },
      ]],
    ]));
    expect(style.highway.tertiary).toEqual({ color: '#ffffee', opacity: 1, strokeColor: '#bbbbbb' });
  });

  it('reads the Maperitive map background color', () => {
    const style = rulesetToRenderStyle(ruleset([], { 'map-background-color': '#f8f9fa' }));
    expect(style.backgroundColor).toBe('#f8f9fa');
  });

  it('still accepts the legacy background-color property', () => {
    const style = rulesetToRenderStyle(ruleset([], { 'background-color': '#eeeeee' }));
    expect(style.backgroundColor).toBe('#eeeeee');
  });

  it('applies a rule targeting every waterway to each waterway style', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['waterway*', [{ property: 'line-color', value: '#90d9ed' }]],
    ]));
    for (const key of ['river', 'stream', 'canal', 'default'] as const) {
      expect(style.waterway[key].color).toBe('#90d9ed');
    }
  });

  it('applies the wood rule to forest landuse too, since the wood feature covers landuse=forest', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['natural_wood', [{ property: 'fill-color', value: '#c2f0d4' }]],
    ]));
    expect(style.landuse.forest.color).toBe('#c2f0d4');
  });

  it('reads label colors from the text color of road, water, wood and other area rules', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_residential', [{ property: 'line-color', value: '#ffffff' }, { property: 'text-color', value: '#4b5d6f' }]],
      ['natural_water', [{ property: 'fill-color', value: '#90d9ed' }, { property: 'text-color', value: '#218da0' }]],
      ['natural_wood', [{ property: 'fill-color', value: '#c2f0d4' }, { property: 'text-color', value: '#1e5631' }]],
      ['natural_grassland', [{ property: 'fill-color', value: '#c2f0d4' }, { property: 'text-color', value: '#12875f' }]],
    ]));
    expect(style.labels).toEqual({
      roadColor: '#4b5d6f',
      waterColor: '#218da0',
      forestColor: '#1e5631',
      areaColor: '#12875f',
    });
  });

  it('leaves label colors unset when no rule gives a text color', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_residential', [{ property: 'line-color', value: '#ffffff' }]],
    ]));
    expect(style.labels).toBeUndefined();
  });

  it('maps the text halo color to the label halo', () => {
    const style = rulesetToRenderStyle(ruleset([], { 'text-halo-color': '#fefefe' }));
    expect(style.labels?.haloColor).toBe('#fefefe');
  });
});
