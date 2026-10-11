import { describe, it, expect } from 'vitest';
import { MAPS_STYLE } from './defaultPresets';
import { MAPS_RULESET } from '../rules/defaultRules';
import { rulesetToRenderStyle } from '../rules/converter';
import { FeatureStyle, RenderStyle } from '../types';

type ColorMap = Record<string, { color: string; strokeColor?: string }>;

function colorsOf(group: Record<string, FeatureStyle>, skip: string[] = []): ColorMap {
  const result: ColorMap = {};
  for (const [key, feature] of Object.entries(group)) {
    if (skip.includes(key)) continue;
    result[key] = feature.strokeColor
      ? { color: feature.color, strokeColor: feature.strokeColor }
      : { color: feature.color };
  }
  return result;
}

// Every color the renderers read from a style, construction sites aside:
// rulesets have no feature for them
function palette(style: RenderStyle) {
  return {
    backgroundColor: style.backgroundColor,
    highway: colorsOf(style.highway),
    building: colorsOf(style.building, ['construction']),
    landuse: colorsOf(style.landuse),
    natural: colorsOf(style.natural),
    waterway: colorsOf(style.waterway),
    labels: style.labels,
  };
}

describe('Maps preset palette', () => {
  // Measured on Google Maps (Plan layer, light mode, browser zoom 100 %) in October 2026,
  // at zoom 16 where colors change with zoom
  it('uses the current Google Maps colors', () => {
    expect(palette(MAPS_STYLE)).toEqual({
      backgroundColor: '#f6f4f4',
      highway: {
        motorway: { color: '#8aa4be', strokeColor: '#6f90b1' },
        primary: { color: '#8aa4be', strokeColor: '#6f90b1' },
        secondary: { color: '#8aa4be', strokeColor: '#6f90b1' },
        tertiary: { color: '#d7e0e5', strokeColor: '#bcc7cf' },
        residential: { color: '#d7e0e5', strokeColor: '#bcc7cf' },
        path: { color: '#d4dce9' },
        cycleway: { color: '#d4dce9' },
      },
      building: {
        residential: { color: '#e7e8eb', strokeColor: '#d5d8e5' },
        commercial: { color: '#e7e8eb', strokeColor: '#d5d8e5' },
        industrial: { color: '#e7e8eb', strokeColor: '#d5d8e5' },
        religious: { color: '#e7e8eb', strokeColor: '#d5d8e5' },
        default: { color: '#e7e8eb', strokeColor: '#d5d8e5' },
      },
      landuse: {
        residential: { color: '#fcf8ef' },
        commercial: { color: '#f7efdc' },
        industrial: { color: '#f6f4f4' },
        farmland: { color: '#e9f2dc' },
        forest: { color: '#c2f0d4' },
      },
      natural: {
        water: { color: '#90d9ed' },
        wood: { color: '#c2f0d4' },
        grassland: { color: '#c2f0d4' },
        beach: { color: '#f5ebb8' },
      },
      waterway: {
        river: { color: '#90d9ed' },
        stream: { color: '#90d9ed' },
        canal: { color: '#90d9ed' },
        default: { color: '#90d9ed' },
      },
      labels: {
        roadColor: '#4b5d6f',
        areaColor: '#12875f',
        waterColor: '#218da0',
        forestColor: '#12875f',
        haloColor: '#ffffff',
      },
    });
  });

  it('gives the same colors whether loaded as a preset or derived from the Maps ruleset', () => {
    expect(palette(rulesetToRenderStyle(MAPS_RULESET))).toEqual(palette(MAPS_STYLE));
  });
});

describe('Maps preset road widths', () => {
  // On Google Maps at zoom 16, arterials and motorway carriageways are about 2.7 times as wide
  // as residential streets (casing included); the casing border stays 1 px
  it('widens roads like Google Maps, relative to the default road widths', () => {
    const widthScales = Object.fromEntries(
      Object.entries(MAPS_STYLE.highway).map(([key, feature]) => [key, feature.widthScale ?? 1])
    );
    expect(widthScales).toEqual({
      motorway: 1.5,
      primary: 1.75,
      secondary: 2.25,
      tertiary: 1.75,
      residential: 1,
      path: 1,
      cycleway: 1,
    });
  });
});
