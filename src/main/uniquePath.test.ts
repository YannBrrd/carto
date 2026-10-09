import { describe, it, expect } from 'vitest';
import { uniquePath } from './uniquePath';

const existing = (...paths: string[]) => async (p: string) => paths.includes(p);

describe('uniquePath', () => {
  it('returns the path unchanged when it is free', async () => {
    expect(await uniquePath('/out/carte.kmz', existing())).toBe('/out/carte.kmz');
  });

  it('appends " (1)" before the extension when taken', async () => {
    expect(await uniquePath('/out/carte.kmz', existing('/out/carte.kmz'))).toBe('/out/carte (1).kmz');
  });

  it('increments until a free name is found', async () => {
    const exists = existing('/out/carte.kmz', '/out/carte (1).kmz', '/out/carte (2).kmz');
    expect(await uniquePath('/out/carte.kmz', exists)).toBe('/out/carte (3).kmz');
  });

  it('throws after too many collisions instead of looping forever', async () => {
    await expect(uniquePath('/out/carte.kmz', async () => true)).rejects.toThrow();
  });
});
