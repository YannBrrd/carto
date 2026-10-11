import { describe, it, expect } from 'vitest';
import { COMMON_FEATURES } from './defaultRules';
import { matchCondition } from './matcher';
import { isUnderground } from '../utils/styleResolvers';

describe('railway_tunnel feature', () => {
  const feature = COMMON_FEATURES.find(candidate => candidate.name === 'railway_tunnel')!;

  it.each<Record<string, string>>([
    { railway: 'subway', tunnel: 'yes' },
    { railway: 'rail', tunnel: 'culvert' },
    { railway: 'subway', location: 'underground' },
    { railway: 'subway', bridge: 'viaduct' },
    { railway: 'rail', tunnel: 'no' },
    { railway: 'rail', tunnel: 'building_passage' },
    { railway: 'rail', tunnel: 'avalanche_protector' },
    { railway: 'rail', layer: '-1' },
  ])('matches the railways the renderers draw as underground: %o', (tags) => {
    expect(matchCondition({ type: 'way', id: 1, tags }, feature.conditions)).toBe(isUnderground(tags));
  });

  it('only matches railways', () => {
    expect(matchCondition({ type: 'way', id: 1, tags: { highway: 'primary', tunnel: 'yes' } }, feature.conditions)).toBe(false);
  });
});
