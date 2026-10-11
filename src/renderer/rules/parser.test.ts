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
