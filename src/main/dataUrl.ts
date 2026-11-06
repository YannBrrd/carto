/**
 * Bytes of a data URL of the expected media type, or null when the renderer sent something
 * else: a canvas too large for Chromium to encode gives "data:," and must not become a file
 */
export function decodeDataUrl(dataUrl: string, prefix: RegExp): Buffer | null {
  if (!prefix.test(dataUrl)) return null;
  const base64 = dataUrl.replace(prefix, '');
  if (base64.length === 0) return null;
  return Buffer.from(base64, 'base64');
}
