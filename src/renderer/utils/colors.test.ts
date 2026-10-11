import { describe, it, expect } from 'vitest';
import { normalizeColor, sanitizeStyle } from './colors';
import { deriveCasingColor } from './geometry';
import { MAPS_STYLE } from '../presets/defaultPresets';

describe('normalizeColor', () => {
  it.each([
    ['#ABC', '#aabbcc'],
    ['#AABBCC', '#aabbcc'],
    ['#aabbccdd', '#aabbcc'],
    ['#abcd', '#aabbcc'],
    [' white ', '#ffffff'],
    ['DarkSlateGray', '#2f4f4f'],
    ['grey', '#808080'],
    ['rgb(255, 0, 0)', '#ff0000'],
    ['rgba(0,0,255,0.5)', '#0000ff'],
    ['rgb(100%, 50%, 0%)', '#ff8000'],
  ])('reads %s as %s', (color, expected) => {
    expect(normalizeColor(color)).toBe(expected);
  });

  it.each([
    ['#fff;}</style><script>alert(1)</script>'],
    ['url(#x)'],
    ['transparent'],
    ['constructor'],
    ['rgb(300, 0, 0)'],
    ['#ggg'],
    [''],
    [123],
    [undefined],
  ])('rejects %s', color => {
    expect(normalizeColor(color)).toBeUndefined();
  });
});

describe('deriveCasingColor', () => {
  it('darkens named colors too', () => {
    expect(deriveCasingColor('white')).toBe('#d7d7d7');
  });

  it('falls back to gray for colors it cannot read', () => {
    expect(deriveCasingColor('nonsense')).toBe('#808080');
  });
});

describe('sanitizeStyle', () => {
  it('turns every color into six-digit hex and drops what is not a color', () => {
    const style = structuredClone(MAPS_STYLE);
    style.backgroundColor = '#fff;}</style><script>alert(1)</script><style>.x{';
    style.borderColor = 'black';
    style.natural.water = { color: '#fff"/><script>', opacity: 1, strokeColor: 'url(x)' };
    style.highway.primary = { color: 'white', opacity: 1, strokeColor: 'rgb(0, 0, 0)' };
    style.railway!.tram = { color: 'expression(x)', opacity: 1 };
    style.highwayTunnel = { color: 'red', strokeColor: '<b>' };
    style.labels = { roadColor: 'navy', haloColor: '}' };

    const safe = sanitizeStyle(style);
    expect(safe.backgroundColor).toBe('#f5f5f5');
    expect(safe.borderColor).toBe('#000000');
    expect(safe.natural.water).toEqual({ color: '#888888', opacity: 1 });
    expect(safe.highway.primary).toEqual({ color: '#ffffff', opacity: 1, strokeColor: '#000000' });
    expect(safe.railway!.tram.color).toBe('#888888');
    expect(safe.highwayTunnel).toEqual({ color: '#ff0000' });
    expect(safe.labels).toEqual({ roadColor: '#000080' });
  });

  it('leaves the style it is given untouched', () => {
    const style = structuredClone(MAPS_STYLE);
    style.borderColor = 'black';
    sanitizeStyle(style);
    expect(style.borderColor).toBe('black');
  });

  it('keeps valid styles as they are', () => {
    expect(sanitizeStyle(MAPS_STYLE)).toEqual(MAPS_STYLE);
  });
});

describe('sanitizeStyle numbers', () => {
  it('keeps opacities and widths numeric', () => {
    const style = structuredClone(MAPS_STYLE) as any;
    style.highway.primary.opacity = '1;}</style><script>';
    style.natural.water.opacity = 2;
    style.borderWidth = '3px';
    style.strokeOpacity = -1;
    style.fillOpacity = Number.NaN;
    const safe = sanitizeStyle(style);
    expect(safe.highway.primary.opacity).toBe(1);
    expect(safe.natural.water.opacity).toBe(1);
    expect(safe.borderWidth).toBe(1);
    expect(safe.strokeOpacity).toBe(0);
    expect(safe.fillOpacity).toBe(0);
  });
});
