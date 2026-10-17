import { isExternalWebUrl } from './externalLinks';

// What to do when the page navigates the window itself (a link without target, window.location)
export type NavigationAction = 'allow' | 'open-externally' | 'block';

// The document a URL loads: the fragment only scrolls within it
function documentUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

// Only the app page may stay in the window, leaving it would lose the zones and the unsaved styles.
// Web pages open in the system browser, anything else (local files, scripts, data) is blocked.
export function navigationAction(targetUrl: string, appUrl: string): NavigationAction {
  const target = documentUrl(targetUrl);
  if (target !== null && target === documentUrl(appUrl)) {
    return 'allow';
  }
  return isExternalWebUrl(targetUrl) ? 'open-externally' : 'block';
}
