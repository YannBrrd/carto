// Links the app may hand to the system browser: https web pages only
export function isExternalWebUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
