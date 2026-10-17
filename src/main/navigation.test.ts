import { describe, it, expect } from 'vitest';
import { navigationAction } from './navigation';

const APP_URL = 'file:///C:/Program%20Files/Carto/resources/app.asar/dist/renderer/index.html';
const DEV_SERVER_URL = 'http://localhost:8080/';

describe('navigationAction', () => {
  it('keeps the app page, whatever its fragment', () => {
    expect(navigationAction(APP_URL, APP_URL)).toBe('allow');
    expect(navigationAction(`${APP_URL}#zone`, APP_URL)).toBe('allow');
    expect(navigationAction(APP_URL, `${APP_URL}#zone`)).toBe('allow');
  });

  it('keeps the dev server page when the app is served by one', () => {
    expect(navigationAction(DEV_SERVER_URL, DEV_SERVER_URL)).toBe('allow');
    expect(navigationAction(`${DEV_SERVER_URL}#zone`, DEV_SERVER_URL)).toBe('allow');
  });

  it('keeps an app page served over https in the window instead of opening it in the browser', () => {
    expect(navigationAction('https://localhost:8080/index.html', 'https://localhost:8080/index.html')).toBe('allow');
  });

  it('opens web pages, such as the map attributions, in the system browser', () => {
    for (const url of ['https://leafletjs.com', 'https://www.openstreetmap.org/copyright', 'https://carto.com/attributions']) {
      expect(navigationAction(url, APP_URL)).toBe('open-externally');
    }
  });

  it('blocks other local files and other pages of the app origin', () => {
    expect(navigationAction('file:///C:/Windows/System32/calc.exe', APP_URL)).toBe('block');
    expect(navigationAction('file:///C:/Program%20Files/Carto/resources/app.asar/dist/renderer/other.html', APP_URL)).toBe('block');
    expect(navigationAction(`${APP_URL}?reset=1`, APP_URL)).toBe('block');
    expect(navigationAction(`${DEV_SERVER_URL}other`, DEV_SERVER_URL)).toBe('block');
  });

  it('blocks anything that could run code or that the system browser should not open', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', 'smb://server/share',
      'not a url', '']) {
      expect(navigationAction(url, APP_URL)).toBe('block');
    }
  });

  it('keeps no page while the app page is unknown, but still opens web pages in the browser', () => {
    expect(navigationAction(APP_URL, '')).toBe('block');
    expect(navigationAction('https://www.openstreetmap.org/copyright', '')).toBe('open-externally');
  });
});
