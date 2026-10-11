import { describe, it, expect } from 'vitest';
import { getDashArray, getCasingDashArray, isLineStyle } from './lineStyles';

describe('getDashArray', () => {
  it('draws solid lines without a dash pattern', () => {
    expect(getDashArray(undefined, 2)).toBeNull();
    expect(getDashArray('solid', 2)).toBeNull();
  });

  it.each([
    ['dot', [2, 2]],
    ['dash', [6, 4]],
    ['dashlong', [12, 4]],
    ['dashdot', [8, 3, 2, 3]],
    ['dashdotdot', [8, 3, 2, 3, 2, 3]],
  ] as const)('scales the %s pattern with the line width', (lineStyle, pattern) => {
    expect(getDashArray(lineStyle, 2)).toEqual(pattern);
    expect(getDashArray(lineStyle, 4)).toEqual(pattern.map(length => length * 2));
  });

  it('has no dash pattern for hidden lines', () => {
    expect(getDashArray('none', 2)).toBeNull();
  });
});

describe('isLineStyle', () => {
  it('accepts the Maperitive line styles', () => {
    for (const lineStyle of ['solid', 'dot', 'dash', 'dashlong', 'dashdot', 'dashdotdot', 'none']) {
      expect(isLineStyle(lineStyle)).toBe(true);
    }
  });

  it('rejects anything else, such as values from an imported preset', () => {
    for (const value of ['dotted', '', 'DASH', 3, undefined, 'constructor']) {
      expect(isLineStyle(value)).toBe(false);
    }
  });
});

describe('getCasingDashArray', () => {
  it('gives the casing the dashes of its line when it has no style of its own', () => {
    expect(getCasingDashArray({ color: '#fff', opacity: 1, lineStyle: 'dash' }, 2)).toEqual([6, 4]);
  });

  it('uses the casing line style when there is one (Maperitive border-style)', () => {
    expect(getCasingDashArray({ color: '#fff', opacity: 1, lineStyle: 'dash', casingLineStyle: 'solid' }, 2)).toBeNull();
    expect(getCasingDashArray({ color: '#fff', opacity: 1, casingLineStyle: 'dot' }, 2)).toEqual([2, 2]);
  });
});
