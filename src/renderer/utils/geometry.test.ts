import { describe, it, expect } from 'vitest';
import { assembleRings, resolveMultipolygons, buildNodeMap } from './geometry';

describe('assembleRings', () => {
  it('keeps a closed way as a ring', () => {
    expect(assembleRings([[1, 2, 3, 1]])).toEqual([[1, 2, 3, 1]]);
  });

  it('joins open ways that share their end nodes into a ring', () => {
    expect(assembleRings([[1, 2, 3], [3, 4, 1]])).toEqual([[1, 2, 3, 4, 1]]);
  });

  it('reverses ways drawn in the other direction', () => {
    expect(assembleRings([[1, 2, 3], [1, 4, 3]])).toEqual([[1, 2, 3, 4, 1]]);
    expect(assembleRings([[1, 2, 3], [5, 1], [3, 4, 5]])).toEqual([[1, 2, 3, 4, 5, 1]]);
  });

  it('builds several rings from unordered ways', () => {
    expect(assembleRings([[1, 2], [10, 11], [2, 3, 1], [11, 12, 10]])).toEqual([[1, 2, 3, 1], [10, 11, 12, 10]]);
  });

  it('drops the ways that cannot be closed into a ring', () => {
    expect(assembleRings([[1, 2, 3], [3, 4], [10, 11, 12, 10]])).toEqual([[10, 11, 12, 10]]);
  });

  it('ignores degenerate ways', () => {
    expect(assembleRings([[], [1], [1, 1]])).toEqual([]);
  });
});

describe('resolveMultipolygons', () => {
  // Square 1-2-3-4 split into two open outer ways, with a closed inner way 5-6-7
  const data = {
    elements: [
      { type: 'node', id: 1, lat: 0, lon: 0 },
      { type: 'node', id: 2, lat: 0, lon: 10 },
      { type: 'node', id: 3, lat: 10, lon: 10 },
      { type: 'node', id: 4, lat: 10, lon: 0 },
      { type: 'node', id: 5, lat: 2, lon: 2 },
      { type: 'node', id: 6, lat: 2, lon: 4 },
      { type: 'node', id: 7, lat: 4, lon: 4 },
      { type: 'way', id: 10, nodes: [1, 2, 3] },
      { type: 'way', id: 11, nodes: [3, 4, 1] },
      { type: 'way', id: 12, nodes: [5, 6, 7, 5] },
      {
        type: 'relation', id: 20, tags: { type: 'multipolygon', natural: 'water' },
        members: [
          { type: 'way', ref: 11, role: 'outer' },
          { type: 'way', ref: 10, role: '' },
          { type: 'way', ref: 12, role: 'inner' },
        ],
      },
    ],
  };

  it('assembles the outer and inner rings of a multipolygon from its member ways', () => {
    const [mp] = resolveMultipolygons(data, buildNodeMap(data));
    expect(mp.id).toBe(20);
    expect(mp.outer).toEqual([[[10, 10], [10, 0], [0, 0], [0, 10], [10, 10]]]);
    expect(mp.inner).toEqual([[[2, 2], [2, 4], [4, 4], [2, 2]]]);
  });

  it('ignores multipolygons whose outer ways are missing', () => {
    const partial = { elements: data.elements.filter(el => el.id !== 10) };
    expect(resolveMultipolygons(partial, buildNodeMap(partial))).toEqual([]);
  });
});
