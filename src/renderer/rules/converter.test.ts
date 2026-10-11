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

describe('rulesetToRenderStyle road levels drawn with another level style', () => {
  const line = (color: string): PropertyAssignment[] => [{ property: 'line-color', value: color }];

  it.each([
    ['highway_trunk', 'motorway', 'highway_motorway'],
    ['highway_unclassified', 'residential', 'highway_residential'],
    ['highway_living_street', 'residential', 'highway_residential'],
    ['highway_bridleway', 'path', 'highway_path'],
  ] as const)('styles the %s roads the renderers draw as %s from their rule, unless %s has one', (pattern, key, own) => {
    expect(rulesetToRenderStyle(ruleset([[pattern, line('#123456')]])).highway[key].color).toBe('#123456');
    for (const rules of [[[pattern, line('#123456')], [own, line('#abcdef')]], [[own, line('#abcdef')], [pattern, line('#123456')]]]) {
      expect(rulesetToRenderStyle(ruleset(rules as Array<[string, PropertyAssignment[]]>)).highway[key].color).toBe('#abcdef');
    }
  });

  it('applies a rule targeting every road to each road level without a rule of its own, whatever the order', () => {
    for (const generic of ['highway', 'highway*']) {
      for (const rules of [[[generic, line('#123456')], ['highway_primary', line('#abcdef')]], [['highway_primary', line('#abcdef')], [generic, line('#123456')]]]) {
        const style = rulesetToRenderStyle(ruleset(rules as Array<[string, PropertyAssignment[]]>));
        expect(style.highway.primary.color).toBe('#abcdef');
        expect(style.highway.residential.color).toBe('#123456');
        expect(style.highway.cycleway.color).toBe('#123456');
      }
    }
  });
});

describe('rulesetToRenderStyle waterways', () => {
  it('styles drains and ditches with the canal rule, or their own rule when there is no canal rule', () => {
    const drain = rulesetToRenderStyle(ruleset([['waterway_drain', [{ property: 'line-color', value: '#123456' }]]]));
    expect(drain.waterway.canal.color).toBe('#123456');
    const both = rulesetToRenderStyle(ruleset([
      ['waterway_canal', [{ property: 'line-color', value: '#abcdef' }]],
      ['waterway_drain', [{ property: 'line-color', value: '#123456' }]],
    ]));
    expect(both.waterway.canal.color).toBe('#abcdef');
  });

  it('applies a rule targeting every waterway only to the waterways without a rule of their own, whatever the order', () => {
    const generic: [string, PropertyAssignment[]] = ['waterway*', [{ property: 'line-color', value: '#90d9ed' }]];
    const stream: [string, PropertyAssignment[]] = ['waterway_stream', [{ property: 'line-color', value: '#aadaff' }]];
    for (const rules of [[generic, stream], [stream, generic]]) {
      const style = rulesetToRenderStyle(ruleset(rules));
      expect(style.waterway.stream.color).toBe('#aadaff');
      expect(style.waterway.river.color).toBe('#90d9ed');
    }
  });

  it('reads the line style of a waterway rule', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['waterway_stream', [{ property: 'line-color', value: '#aadaff' }, { property: 'line-style', value: 'dash' }]],
    ]));
    expect(style.waterway.stream.lineStyle).toBe('dash');
  });
});

describe('rulesetToRenderStyle buildings', () => {
  it('applies the generic building rule only to the building types without a rule of their own, whatever the order', () => {
    const generic: [string, PropertyAssignment[]] = ['building*', [{ property: 'fill-color', value: '#e7e8eb' }]];
    const religious: [string, PropertyAssignment[]] = ['building_religious', [{ property: 'fill-color', value: '#d4c4a8' }]];
    for (const rules of [[generic, religious], [religious, generic]]) {
      const style = rulesetToRenderStyle(ruleset(rules));
      expect(style.building.religious.color).toBe('#d4c4a8');
      expect(style.building.residential.color).toBe('#e7e8eb');
    }
  });
});

describe('rulesetToRenderStyle map properties', () => {
  it('reads the label font from the font family list, when the app supports it', () => {
    expect(rulesetToRenderStyle(ruleset([], { 'font-family': 'Inter, Arial, sans-serif' })).fontSize.fontFamily).toBe('Inter');
    expect(rulesetToRenderStyle(ruleset([], { 'font-family': "'Open Sans', sans-serif" })).fontSize.fontFamily).toBe('Open Sans');
    expect(rulesetToRenderStyle(ruleset([], { 'font-family': 'DejaVu Sans, Arial' })).fontSize.fontFamily).toBe('Roboto');
  });

  it('reads bold labels from the font weight', () => {
    expect(rulesetToRenderStyle(ruleset([], { 'font-weight': 'bold' })).fontSize.fontBold).toBe(true);
    expect(rulesetToRenderStyle(ruleset([], { 'font-weight': 'normal' })).fontSize.fontBold).toBe(false);
  });

  it('turns building shadows off when the ruleset says so', () => {
    expect(rulesetToRenderStyle(ruleset([], { 'building-shadows': false })).buildingShadows).toBe(false);
    expect(rulesetToRenderStyle(ruleset([])).buildingShadows).toBeUndefined();
  });
});

describe('rulesetToRenderStyle colors', () => {
  it('reads named and rgb colors as hex, and rejects what is not a color', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['highway_primary', [{ property: 'line-color', value: 'white' }]],
      ['natural_water', [{ property: 'fill-color', value: '#fff;}</style><script>alert(1)</script>' }]],
      ['building*', [{ property: 'fill-color', value: 'rgb(231, 232, 235)' }]],
    ], { 'map-background-color': '#fff}</style><script>' }));
    expect(style.highway.primary.color).toBe('#ffffff');
    expect(style.natural.water.color).toBe('#888888');
    expect(style.building.residential.color).toBe('#e7e8eb');
    expect(style.backgroundColor).toBe('#f5f5f5');
  });
});

describe('rulesetToRenderStyle link roads', () => {
  it.each([
    ['highway_motorway', 'highway_motorway_link', 'motorway'],
    ['highway_primary', 'highway_primary_link', 'primary'],
    ['highway_secondary', 'highway_secondary_link', 'secondary'],
    ['highway_tertiary', 'highway_tertiary_link', 'tertiary'],
  ] as const)('styles the %s level from its own rule, not from the %s rule, whatever the order', (own, link, key) => {
    const main: [string, PropertyAssignment[]] = [own, [{ property: 'line-color', value: '#abcdef' }]];
    const ramp: [string, PropertyAssignment[]] = [link, [{ property: 'line-color', value: '#ff0000' }]];
    for (const rules of [[main, ramp], [ramp, main]]) {
      expect(rulesetToRenderStyle(ruleset(rules)).highway[key].color).toBe('#abcdef');
    }
    expect(rulesetToRenderStyle(ruleset([ramp])).highway[key].color).toBe('#ff0000');
  });
});

describe('rulesetToRenderStyle area outlines', () => {
  it('draws no outline around an area whose line style is none', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['natural_water', [
        { property: 'fill-color', value: '#90d9ed' },
        { property: 'line-color', value: '#6699cc' },
        { property: 'line-style', value: 'none' },
      ]],
    ]));
    expect(style.natural.water.strokeColor).toBeUndefined();
  });

  it('reads the border width of buildings from their line width', () => {
    const rules = ruleset([
      ['building*', [
        { property: 'fill-color', value: '#e7e8eb' },
        { property: 'line-color', value: '#d5d8e5' },
        { property: 'line-width', value: 0.5 },
      ]],
    ]);
    rules.rules[0].conditionals = [
      { type: 'if', featurePattern: 'building_construction', properties: [{ property: 'line-width', value: 2 }], draws: [], children: [] },
    ];
    const style = rulesetToRenderStyle(rules);
    expect(style.building.residential.widthScale).toBe(0.5);
    expect(style.building.construction.widthScale).toBe(2);
  });
});

describe('rulesetToRenderStyle building borders', () => {
  it.each([
    [[{ property: 'line-style', value: 'none' }]],
    [[{ property: 'line-width', value: 0 }]],
  ])('draws no building border when the rule says %j', props => {
    const style = rulesetToRenderStyle(ruleset([
      ['building*', [{ property: 'fill-color', value: '#d9b99b' }, { property: 'line-color', value: '#b5a186' }, ...props]],
    ]));
    expect(style.building.residential.casingLineStyle).toBe('none');
  });

  it('outlines only an area whose fill is transparent', () => {
    const style = rulesetToRenderStyle(ruleset([
      ['natural_water', [{ property: 'fill-color', value: 'transparent' }, { property: 'line-color', value: '#6699cc' }]],
    ]));
    expect(style.natural.water).toMatchObject({ opacity: 0, strokeColor: '#6699cc' });
  });
});
