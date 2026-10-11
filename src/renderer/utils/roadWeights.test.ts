import { describe, it, expect } from 'vitest';
import { getRoadWeight, getHighwayStyleKey, getRailwayWeight, ROAD_DRAW_ORDER } from './roadWeights';

describe('getRoadWeight', () => {
  it.each([
    ['motorway', { fill: 6, casing: 8, fontSize: 10 }],
    ['trunk', { fill: 6, casing: 8, fontSize: 10 }],
    ['primary', { fill: 5, casing: 7, fontSize: 9 }],
    ['secondary', { fill: 4, casing: 6, fontSize: 8 }],
    ['tertiary', { fill: 3, casing: 5, fontSize: 7 }],
    ['residential', { fill: 2, casing: 4, fontSize: 6 }],
    ['living_street', { fill: 2, casing: 4, fontSize: 6 }],
    ['unclassified', { fill: 2, casing: 4, fontSize: 6 }],
    ['service', { fill: 2, casing: 4, fontSize: 6 }],
    ['path', { fill: 1.5, casing: 2.5, fontSize: 5 }],
    ['footway', { fill: 1.5, casing: 2.5, fontSize: 5 }],
    ['pedestrian', { fill: 1.5, casing: 2.5, fontSize: 5 }],
    ['track', { fill: 1.5, casing: 2.5, fontSize: 5 }],
    ['cycleway', { fill: 2, casing: 3, fontSize: 5 }],
    ['steps', { fill: 1.5, casing: 2.5, fontSize: 5 }],
    ['bridleway', { fill: 1.5, casing: 2.5, fontSize: 5 }],
  ])('gives %s its default width', (highway, weight) => {
    expect(getRoadWeight(highway)).toEqual(weight);
  });

  it('draws links two thirds as wide as their road, with the same casing border', () => {
    expect(getRoadWeight('motorway_link')).toEqual({ fill: 4, casing: 6, fontSize: 6 });
    expect(getRoadWeight('trunk_link')).toEqual({ fill: 4, casing: 6, fontSize: 6 });
    expect(getRoadWeight('secondary_link').fill).toBeCloseTo(8 / 3);
    expect(getRoadWeight('secondary_link').casing).toBeCloseTo(8 / 3 + 2);
  });

  it('never draws a link narrower than a residential street', () => {
    expect(getRoadWeight('tertiary_link')).toEqual({ fill: 2, casing: 4, fontSize: 6 });
  });

  it('falls back to the default width for tags named like object properties', () => {
    expect(getRoadWeight('constructor')).toEqual({ fill: 2, casing: 4, fontSize: 6 });
    expect(getRoadWeight('__proto___link')).toEqual({ fill: 2, casing: 4, fontSize: 6 });
  });

  it('returns a fresh object each time', () => {
    const weight = getRoadWeight('primary');
    weight.fill = 99;
    expect(getRoadWeight('primary').fill).toBe(5);
  });
});

describe('getHighwayStyleKey', () => {
  it.each([
    ['motorway', 'motorway'], ['trunk', 'motorway'], ['motorway_link', 'motorway'], ['trunk_link', 'motorway'],
    ['primary', 'primary'], ['primary_link', 'primary'],
    ['secondary', 'secondary'], ['secondary_link', 'secondary'],
    ['tertiary', 'tertiary'], ['tertiary_link', 'tertiary'],
    ['residential', 'residential'], ['living_street', 'residential'], ['unclassified', 'residential'], ['service', 'residential'],
    ['path', 'path'], ['track', 'path'],
    ['footway', 'footway'], ['pedestrian', 'footway'], ['steps', 'footway'],
    ['cycleway', 'cycleway'],
    ['bridleway', 'path'],
  ])('styles %s with the %s style', (highway, key) => {
    expect(getHighwayStyleKey(highway)).toBe(key);
  });
});

describe('ROAD_DRAW_ORDER', () => {
  it('draws footways with paths, under cycleways and streets', () => {
    expect(ROAD_DRAW_ORDER).toEqual(['path', 'footway', 'cycleway', 'residential', 'tertiary', 'secondary', 'primary', 'motorway']);
  });
});

describe('getRailwayWeight', () => {
  it('gives railways a gray rail base wider than the ties drawn over it', () => {
    expect(getRailwayWeight()).toEqual({ fill: 2.5, casing: 4 });
  });
});
