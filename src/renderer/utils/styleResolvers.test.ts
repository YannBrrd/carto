import { describe, it, expect } from 'vitest';
import { resolveStrokeColor, resolveLabelStyle, DEFAULT_LABEL_STYLE } from './styleResolvers';
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
