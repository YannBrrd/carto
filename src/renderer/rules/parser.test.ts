import { describe, it, expect } from 'vitest';
import { parseRuleset } from './parser';
import { rulesetToRenderStyle } from './converter';

// Line color of primary roads in a parsed ruleset
function primaryColor(value: string): string {
  const ruleset = parseRuleset([
    'features',
    '\tline',
    '\t\thighway_primary : highway=primary',
    'rules',
    '\ttarget : highway_primary',
    '\t\tdefine',
    `\t\t\tline-color : ${value}`,
    '\t\tdraw : line',
  ].join('\n'));
  return rulesetToRenderStyle(ruleset).highway.primary.color;
}

describe('parseRuleset color blends', () => {
  it.each([
    ['#849bbd black 20%', '#6a7c97'],
    ['#ff0000 navy 50%', '#800040'],
    ['red #0000ff 50%', '#800080'],
    ['#ff0000 rgb(0,0,255) 50%', '#800080'],
    ['red gray 50%', '#c04040'],
  ])('blends %s into %s', (value, expected) => {
    expect(primaryColor(value)).toBe(expected);
  });

  it('keeps colors that contain percentages as they are', () => {
    expect(primaryColor('hsl(0, 0%, 100%)')).toBe('#ffffff');
    expect(primaryColor('rgb(100%, 0%, 0%)')).toBe('#ff0000');
  });
});

describe('parseRuleset indentation', () => {
  const tabbed = [
    'features',
    '\tlines',
    '\t\thighway_primary : highway=primary',
    'rules',
    '\ttarget : highway_primary',
    '\t\tdefine',
    '\t\t\tline-color : #ff0000',
    '\t\tdraw : line',
  ];

  it.each([4, 2])('accepts %i spaces per level as an editor may have written them', (spaces) => {
    const content = tabbed.map(line => line.replace(/\t/g, ' '.repeat(spaces))).join('\n');
    const ruleset = parseRuleset(content);
    expect(ruleset.features.map(f => f.name)).toEqual(['highway_primary']);
    expect(rulesetToRenderStyle(ruleset).highway.primary.color).toBe('#ff0000');
  });

  it('rejects a file in which no feature and no rule could be read', () => {
    expect(() => parseRuleset('// Maperitive rules\nfeatures\nrules\n')).toThrow(/Aucune/);
    expect(() => parseRuleset('')).toThrow(/Aucune/);
  });
});

describe('parseRuleset features', () => {
  it('keeps features whose line contains lines, points or areas', () => {
    const ruleset = parseRuleset([
      'features',
      '\tlines',
      '\t\tpower_lines : power=line',
      '\t\tpipelines : man_made=pipeline',
      '\tareas',
      '\t\tplay_areas : leisure=playground',
      '\tpoints, areas',
      '\t\tpoi : amenity=cafe',
    ].join('\n'));
    expect(ruleset.features.map(f => [f.name, f.geometryTypes])).toEqual([
      ['power_lines', ['line']],
      ['pipelines', ['line']],
      ['play_areas', ['area']],
      ['poi', ['point', 'area']],
    ]);
  });
});

describe('parseRuleset nested conditionals', () => {
  it('keeps a nested if/elseif/else chain inside its parent block', () => {
    const ruleset = parseRuleset([
      'features',
      '\tlines',
      '\t\troad : highway',
      'rules',
      '\ttarget : road',
      '\t\tif : highway=primary',
      '\t\t\tif : oneway=yes',
      '\t\t\t\tdefine',
      '\t\t\t\t\tline-color : #ff0000',
      '\t\t\telseif : oneway=-1',
      '\t\t\t\tdefine',
      '\t\t\t\t\tline-color : #00ff00',
      '\t\t\telse',
      '\t\t\t\tdefine',
      '\t\t\t\t\tline-color : #0000ff',
      '\t\t\tdraw : line',
      '\t\telse',
      '\t\t\tdefine',
      '\t\t\t\tline-color : #000000',
      '\t\tdraw : line',
    ].join('\n'));
    const [rule] = ruleset.rules;
    expect(rule.conditionals.map(c => c.type)).toEqual(['if', 'else']);
    const [primary] = rule.conditionals;
    expect(primary.children.map(c => c.type)).toEqual(['if', 'elseif', 'else']);
    expect(primary.children.map(c => c.properties[0].value)).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(primary.draws).toHaveLength(1);
    expect(rule.draws).toHaveLength(1);
  });
});
