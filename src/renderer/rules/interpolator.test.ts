import { describe, it, expect } from 'vitest';
import { resolveValue, parseColorWithBlend, parseZoomDependentValue } from './interpolator';

const blended = (value: string) => {
  const { base, blend, blendAmount } = parseColorWithBlend(value);
  return resolveValue({ type: 'color', base, blend, blendAmount }, 16);
};

describe('color blending', () => {
  it.each([
    ['#ff0000 black 50%', '#800000'],
    ['#f00 white 50%', '#ff8080'],
    ['rgb(200, 0, 0) black 20%', '#a00000'],
    ['navy white 50%', '#8080c0'],
    ['#ff0000 rgb(0, 0, 255) 50%', '#800080'],
    ['hsl(0, 100%, 50%) darkslategray 100%', '#2f4f4f'],
  ])('blends %s into %s', (value, expected) => {
    expect(blended(value)).toBe(expected);
  });

  it('keeps the base color when a color cannot be read', () => {
    expect(blended('nonsense black 50%')).toBe('nonsense');
  });
});

describe('parseZoomDependentValue', () => {
  it('reads zoom:value pairs separated by semicolons', () => {
    expect(parseZoomDependentValue('12:1;14:2;16:3')?.stops).toEqual([
      { zoom: 12, value: 1 }, { zoom: 14, value: 2 }, { zoom: 16, value: 3 },
    ]);
  });
});
