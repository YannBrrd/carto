/**
 * KMZ packaging: a zip archive holding doc.kml and the overlay image.
 */

import { zipSync, strToU8 } from 'fflate';

/** Image location inside the archive; the KML GroundOverlay references this path. */
export const KMZ_IMAGE_PATH = 'files/carte.png';

/** Decode a base64 data URL ("data:image/png;base64,....") to raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:[^;,]*;base64,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('URL de données invalide');
  }
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Build a KMZ archive. doc.kml comes first, as required by the format. */
export function buildKmz(kml: string, image?: Uint8Array): Uint8Array {
  const files: Record<string, Uint8Array> = { 'doc.kml': strToU8(kml) };
  if (image) {
    files[KMZ_IMAGE_PATH] = image;
  }
  return zipSync(files);
}
