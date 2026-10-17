import { describe, it, expect } from 'vitest';
import { isExternalWebUrl } from './externalLinks';

describe('isExternalWebUrl', () => {
  it('accepts web pages, such as the CARTO key page and the map attributions', () => {
    expect(isExternalWebUrl('https://carto.com/basemaps/apikey')).toBe(true);
    expect(isExternalWebUrl('https://www.openstreetmap.org/copyright')).toBe(true);
  });

  it('refuses anything that could run or open local content', () => {
    for (const url of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'data:text/html,<b>x</b>',
      'http://example.com', 'smb://server/share', 'not a url']) {
      expect(isExternalWebUrl(url)).toBe(false);
    }
  });
});
