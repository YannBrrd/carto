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

  it('styles construction sites with the generic building rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['building*', [
        { property: 'fill-color', value: '#e7e8eb' },
        { property: 'line-color', value: '#d5d8e5' },
      ]],
    ]));
    expect(style.building.construction).toEqual({ color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' });
  });

  it('lets a building conditional override only the properties it sets', () => {
    const rules = ruleset([
      ['building*', [
        { property: 'fill-color', value: '#e7e8eb' },
        { property: 'fill-opacity', value: 0.9 },
        { property: 'line-color', value: '#d5d8e5' },
      ]],
    ]);
    rules.rules[0].conditionals = [
      { type: 'if', featurePattern: 'building_construction', properties: [{ property: 'fill-opacity', value: 0.6 }], draws: [], children: [] },
      { type: 'elseif', featurePattern: 'building_religious', properties: [{ property: 'fill-color', value: '#d4c4a8' }], draws: [], children: [] },
    ];
    const style = rulesetToRenderStyle(rules);
    expect(style.building.construction).toEqual({ color: '#e7e8eb', opacity: 0.6, strokeColor: '#d5d8e5' });
    expect(style.building.religious).toEqual({ color: '#d4c4a8', opacity: 0.9, strokeColor: '#d5d8e5' });
  });

  it('derives the road width scale from the line width of the rule, against the default road width', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_secondary', [{ property: 'line-color', value: '#8aa4be' }, { property: 'line-width', value: 9 }]],
    ]));
    expect(style.highway.secondary.widthScale).toBe(2.25);
  });

  it('reads a zoom-dependent line width at the conversion zoom', () => {
    const lineWidth = { type: 'zoom-dependent' as const, stops: [{ zoom: 14, value: 4 }, { zoom: 18, value: 12 }] };
    const rules = ruleset([['highway_secondary', [{ property: 'line-color', value: '#8aa4be' }, { property: 'line-width', value: lineWidth }]]]);
    expect(rulesetToRenderStyle(rules, 16).highway.secondary.widthScale).toBe(2);
    expect(rulesetToRenderStyle(rules, 14).highway.secondary.widthScale).toBe(1);
  });

  it('leaves the width scale unset when a road rule has no usable line width', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_primary', [{ property: 'line-color', value: '#8aa4be' }]],
      ['highway_tertiary', [{ property: 'line-color', value: '#d7e0e5' }, { property: 'line-width', value: 0 }]],
    ]));
    expect(style.highway.primary.widthScale).toBeUndefined();
    expect(style.highway.tertiary.widthScale).toBeUndefined();
  });

  it('styles residential streets from the residential rule, not the service road rule, whatever the order', () => {
    const residential: [string, PropertyAssignment[]] = ['highway_residential', [
      { property: 'line-color', value: '#d7e0e5' }, { property: 'line-width', value: 2 },
    ]];
    const service: [string, PropertyAssignment[]] = ['highway_service', [
      { property: 'line-color', value: '#ffffff' }, { property: 'line-width', value: 1 },
    ]];
    for (const rules of [[residential, service], [service, residential]]) {
      expect(rulesetToRenderStyle(ruleset(rules)).highway.residential).toEqual({ color: '#d7e0e5', opacity: 1, widthScale: 1 });
    }
  });

  it('falls back to the service road rule when there is no residential rule', () => {
    const style = rulesetToRenderStyle(ruleset([['highway_service', [{ property: 'line-color', value: '#ffffff' }]]]));
    expect(style.highway.residential.color).toBe('#ffffff');
  });

  it('styles paths from the path rule rather than the footway rule, whatever the order', () => {
    const path: [string, PropertyAssignment[]] = ['highway_path', [{ property: 'line-color', value: '#d4dce9' }]];
    const footway: [string, PropertyAssignment[]] = ['highway_footway', [{ property: 'line-color', value: '#aaaaaa' }]];
    for (const rules of [[path, footway], [footway, path]]) {
      expect(rulesetToRenderStyle(ruleset(rules)).highway.path.color).toBe('#d4dce9');
    }
  });

  it('reads the line style of a road rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_path', [{ property: 'line-color', value: '#d4dce9' }, { property: 'line-style', value: 'dash' }]],
    ]));
    expect(style.highway.path.lineStyle).toBe('dash');
  });

  it('ignores line styles the renderers do not know', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_path', [{ property: 'line-color', value: '#d4dce9' }, { property: 'line-style', value: 'zigzag' }]],
    ]));
    expect(style.highway.path.lineStyle).toBeUndefined();
  });

  it('maps the text halo color to the label halo', () => {
    const style = rulesetToRenderStyle(ruleset([], { 'text-halo-color': '#fefefe' }));
    expect(style.labels?.haloColor).toBe('#fefefe');
  });
});
