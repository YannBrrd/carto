import { describe, it, expect } from 'vitest';
import { appUserAgent, withUserAgent, IDENTIFIED_API_URLS } from './apiUserAgent';

describe('appUserAgent', () => {
  it('names the app, its version and where to reach its maintainer', () => {
    expect(appUserAgent('1.9.0')).toBe('Carto/1.9.0 (+https://github.com/YannBrrd/carto)');
  });
});

describe('withUserAgent', () => {
  it('replaces the browser user agent Electron sends, whatever its case', () => {
    const headers = { 'user-agent': 'Mozilla/5.0 Chrome/140 Electron/41', Accept: '*/*' };
    expect(withUserAgent(headers, 'Carto/1.9.0')).toEqual({ 'User-Agent': 'Carto/1.9.0', Accept: '*/*' });
  });

  it('adds the user agent when the request has none, without changing the original headers', () => {
    const headers = { Accept: '*/*' };
    expect(withUserAgent(headers, 'Carto/1.9.0')).toEqual({ Accept: '*/*', 'User-Agent': 'Carto/1.9.0' });
    expect(headers).toEqual({ Accept: '*/*' });
  });
});

describe('IDENTIFIED_API_URLS', () => {
  // Same matching rules as Electron's webRequest URL filters, enough for these patterns
  const matches = (url: string) => IDENTIFIED_API_URLS.some(pattern =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(url));

  it('covers every Overpass server and Nominatim the app calls', () => {
    expect(matches('https://overpass-api.de/api/interpreter?data=x')).toBe(true);
    expect(matches('https://overpass.kumi.systems/api/interpreter?data=x')).toBe(true);
    expect(matches('https://maps.mail.ru/osm/tools/overpass/api/interpreter?data=x')).toBe(true);
    expect(matches('https://nominatim.openstreetmap.org/search?format=json&q=Paris')).toBe(true);
  });

  it('leaves map tiles and other sites alone', () => {
    expect(matches('https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/1/0/0.png')).toBe(false);
    expect(matches('https://maps.mail.ru/other')).toBe(false);
    expect(matches('https://evil.example/overpass-api.de/')).toBe(false);
  });
});
