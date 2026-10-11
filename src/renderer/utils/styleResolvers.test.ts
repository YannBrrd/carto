import { describe, it, expect } from 'vitest';
import { resolveStrokeColor, resolveLabelStyle, resolveRailwayStyle, scaleRoadWeight, DEFAULT_LABEL_STYLE } from './styleResolvers';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle } from '../types';

describe('resolveStrokeColor', () => {
  it('uses the explicit stroke color when the style defines one', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '#dadce0' })).toBe('#dadce0');
  });

  it('derives a darker outline from the fill when no stroke color is set', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1 })).toBe('#d7d7d7');
  });

  it('treats an empty stroke color as unset', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '' })).toBe('#d7d7d7');
  });

  it('derives the outline from a per-element override color, ignoring the style stroke', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '#dadce0' }, '#ff0000')).toBe('#d70000');
  });
});

describe('resolveLabelStyle', () => {
  const styleWithoutLabels = (): RenderStyle => {
    const style = structuredClone(MAPS_STYLE);
    delete style.labels;
    return style;
  };

  it('keeps the historical label colors when the style has no label settings', () => {
    expect(resolveLabelStyle(styleWithoutLabels())).toEqual({
      roadColor: '#333333',
      areaColor: '#2d5a27',
      waterColor: '#1a5276',
      forestColor: '#1e5631',
      houseNumberColor: '#000000',
      haloColor: '#ffffff',
    });
  });

  it('overrides only the label colors the style defines', () => {
    const style = { ...styleWithoutLabels(), labels: { roadColor: '#5f6368' } };
    expect(resolveLabelStyle(style)).toEqual({ ...DEFAULT_LABEL_STYLE, roadColor: '#5f6368' });
  });

  it('falls back to the default for label colors that are empty or undefined', () => {
    const style = { ...styleWithoutLabels(), labels: { roadColor: '', haloColor: undefined } };
    expect(resolveLabelStyle(style)).toEqual(DEFAULT_LABEL_STYLE);
  });

  it('accepts hex, named and rgb label colors', () => {
    const style = {
      ...styleWithoutLabels(),
      labels: { roadColor: '#5F6368', haloColor: 'white', areaColor: 'rgba(58, 125, 68, 0.9)', waterColor: '#4a6fa5cc' },
    };
    expect(resolveLabelStyle(style)).toMatchObject(style.labels);
  });

  it('rejects label colors that could inject markup or CSS (e.g. from an imported ruleset)', () => {
    const style = {
      ...styleWithoutLabels(),
      labels: {
        haloColor: '#fff;"><img src=x onerror=alert(1)>',
        roadColor: 'red; } .background { fill: url(http://evil) ',
      },
    };
    expect(resolveLabelStyle(style)).toEqual(DEFAULT_LABEL_STYLE);
  });

  it('does not let the returned object alias the shared defaults', () => {
    const resolved = resolveLabelStyle(styleWithoutLabels());
    resolved.roadColor = '#123456';
    expect(DEFAULT_LABEL_STYLE.roadColor).toBe('#333333');
  });
});

describe('scaleRoadWeight', () => {
  const road = { color: '#d7e0e5', opacity: 1 };

  it('keeps the default road width when the style sets no width scale', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, road)).toEqual({ fill: 4, casing: 6 });
  });

  it('widens the road fill and keeps the casing border as thick as before', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale: 2.25 })).toEqual({ fill: 9, casing: 11 });
  });

  it('narrows the road the same way', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale: 0.5 })).toEqual({ fill: 2, casing: 4 });
  });

  it('leaves the other weight values, such as the label font size, untouched', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6, fontSize: 8 }, { ...road, widthScale: 2 })).toEqual({ fill: 8, casing: 10, fontSize: 8 });
  });

  it('ignores width scales that are not a positive number (e.g. from an imported preset)', () => {
    for (const widthScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '2' as unknown as number]) {
      expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale })).toEqual({ fill: 4, casing: 6 });
    }
  });
});

describe('resolveRailwayStyle', () => {
  it('keeps the historical railway look (white ties over a gray rail) when the style has no railway', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    expect(resolveRailwayStyle(style)).toEqual({
      color: '#ffffff', opacity: 1, strokeColor: '#8c8c8c', lineStyle: 'dash', casingLineStyle: 'solid',
    });
  });

  it('uses the railway style of the style', () => {
    const style = structuredClone(MAPS_STYLE);
    style.railway = { color: '#999999', opacity: 1, strokeColor: '#555555', lineStyle: 'dashlong' };
    expect(resolveRailwayStyle(style)).toEqual(style.railway);
  });

  it('does not let the returned object alias the shared default', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    resolveRailwayStyle(style).color = '#123456';
    expect(resolveRailwayStyle(style).color).toBe('#ffffff');
  });
});
