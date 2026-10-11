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

  it('styles footways and paths from their own rules', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_footway', [{ property: 'line-color', value: '#aaaaaa' }, { property: 'line-style', value: 'dot' }]],
      ['highway_path', [{ property: 'line-color', value: '#d4dce9' }, { property: 'line-style', value: 'dash' }]],
    ]));
    expect(style.highway.footway).toEqual({ color: '#aaaaaa', opacity: 1, lineStyle: 'dot' });
    expect(style.highway.path).toEqual({ color: '#d4dce9', opacity: 1, lineStyle: 'dash' });
  });

  it('styles footways from the steps rule only when there is no footway rule', () => {
    const steps: [string, PropertyAssignment[]] = ['highway_steps', [{ property: 'line-color', value: '#ff0000' }]];
    const footway: [string, PropertyAssignment[]] = ['highway_footway', [{ property: 'line-color', value: '#d4dce9' }]];
    expect(rulesetToRenderStyle(ruleset([steps])).highway.footway.color).toBe('#ff0000');
    for (const rules of [[steps, footway], [footway, steps]]) {
      expect(rulesetToRenderStyle(ruleset(rules)).highway.footway.color).toBe('#d4dce9');
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

  it('reads the border style of a road rule as its casing line style', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_path', [{ property: 'line-style', value: 'dash' }, { property: 'border-style', value: 'solid' }]],
    ]));
    expect(style.highway.path).toMatchObject({ lineStyle: 'dash', casingLineStyle: 'solid' });
  });

  it('reads the style of each railway type from its rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['railway_rail', [
        { property: 'line-color', value: '#999999' },
        { property: 'line-width', value: 5 },
        { property: 'line-style', value: 'dashlong' },
        { property: 'border-style', value: 'solid' },
        { property: 'border-color', value: '#555555' },
      ]],
      ['railway_tram', [{ property: 'line-color', value: '#ff0000' }]],
      ['railway_subway', [{ property: 'line-style', value: 'none' }]],
    ]));
    expect(style.railway?.rail).toEqual({
      color: '#999999', opacity: 1, strokeColor: '#555555', widthScale: 2, lineStyle: 'dashlong', casingLineStyle: 'solid',
    });
    expect(style.railway?.tram).toEqual({ color: '#ff0000', opacity: 1 });
    expect(style.railway?.subway.lineStyle).toBe('none');
  });

  it('reads the style of underground railways from the tunnel rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['railway_rail', [{ property: 'line-color', value: '#999999' }]],
      ['railway_tunnel', [{ property: 'line-color', value: '#999999' }, { property: 'line-style', value: 'none' }]],
    ]));
    expect(style.railway?.tunnel).toEqual({ color: '#999999', opacity: 1, lineStyle: 'none' });
    expect(style.railway?.rail.lineStyle).toBeUndefined();
  });

  it('draws railway types without a rule of their own like trains', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['railway_rail', [{ property: 'line-color', value: '#999999' }, { property: 'border-color', value: '#555555' }]],
    ]));
    const rail = { color: '#999999', opacity: 1, strokeColor: '#555555' };
    expect(style.railway).toEqual({ rail, lightRail: rail, tram: rail, subway: rail, tunnel: rail });
    expect(style.railway!.tram).not.toBe(style.railway!.rail);
  });

  it('applies a rule targeting every railway to each type, unless a type has its own rule', () => {
    const generic: [string, PropertyAssignment[]] = ['railway*', [{ property: 'line-color', value: '#999999' }]];
    const tram: [string, PropertyAssignment[]] = ['railway_tram', [{ property: 'line-color', value: '#ff0000' }]];
    for (const rules of [[generic, tram], [tram, generic]]) {
      const style = rulesetToRenderStyle(ruleset(rules));
      expect(style.railway?.rail.color).toBe('#999999');
      expect(style.railway?.tram.color).toBe('#ff0000');
    }
  });

  it('leaves the railway style unset when the ruleset has no railway rule', () => {
    expect(rulesetToRenderStyle(ruleset([])).railway).toBeUndefined();
  });

  it('reads the tunnel style of roads from the highway_tunnel rule, without restyling any road level', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_residential', [{ property: 'line-color', value: '#d7e0e5' }]],
      ['highway_tunnel', [{ property: 'line-color', value: '#d7e0e5' }, { property: 'border-color', value: '#bcc7cf' }]],
    ]));
    expect(style.highwayTunnel).toEqual({ color: '#d7e0e5', strokeColor: '#bcc7cf' });
    expect(style.highway.residential).toEqual({ color: '#d7e0e5', opacity: 1 });
  });

  it('reads the style of underground waterways from the waterway_tunnel rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['waterway*', [{ property: 'line-color', value: '#90d9ed' }]],
      ['waterway_tunnel', [{ property: 'line-style', value: 'none' }, { property: 'line-opacity', value: 0.5 }]],
    ]));
    expect(style.waterwayTunnel).toEqual({ lineStyle: 'none', opacity: 0.5 });
    expect(style.waterway.stream.color).toBe('#90d9ed');
  });

  it('leaves the tunnel styles unset without tunnel rules', () => {
    const style = rulesetToRenderStyle(ruleset([]));
    expect(style.highwayTunnel).toBeUndefined();
    expect(style.waterwayTunnel).toBeUndefined();
  });

  it('maps the text halo color to the label halo', () => {
    const style = rulesetToRenderStyle(ruleset([], { 'text-halo-color': '#fefefe' }));
    expect(style.labels?.haloColor).toBe('#fefefe');
  });
});
