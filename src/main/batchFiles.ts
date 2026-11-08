/**
 * Files of the batch export: territory KML files of an input tree, outputs written into an
 * output tree. Paths cross the IPC relative, with '/' separators, and never leave their root.
 * An output is written to a temporary file then renamed, so that an interrupted batch leaves
 * no partial file that a resumed batch would take for done.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { decodeDataUrl } from './dataUrl';

export type BatchOutputData = { text: string } | { dataUrl: string } | { bytes: ArrayBuffer | Uint8Array };

/** Absolute path of a relative path inside the root, or an error when it would leave it */
export function resolveInside(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error(`Chemin invalide : ${relative}`);
  }
  const base = path.resolve(root);
  const target = path.resolve(base, ...relative.split('/'));
  const fromBase = path.relative(base, target);
  if (!fromBase || fromBase.startsWith('..') || path.isAbsolute(fromBase)) {
    throw new Error(`Chemin hors du dossier : ${relative}`);
  }
  return target;
}

/** KML files of the folder and its subfolders, relative with '/', sorted; links are not followed */
export async function listKmlFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (folder: string, prefix: string) => {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(folder, entry.name), relative);
      else if (entry.isFile() && /\.kml$/i.test(entry.name)) found.push(relative);
    }
  };
  await walk(path.resolve(root), '');
  return found.sort((a, b) => a.localeCompare(b, 'en'));
}

const DATA_URL_PREFIX = /^data:image\/(png|jpeg);base64,/;

function bytesOf(data: BatchOutputData): Buffer {
  if ('text' in data) return Buffer.from(data.text, 'utf8');
  if ('bytes' in data) return Buffer.from(data.bytes instanceof Uint8Array ? data.bytes : new Uint8Array(data.bytes));
  const decoded = decodeDataUrl(data.dataUrl, DATA_URL_PREFIX);
  if (!decoded) throw new Error('Image vide : le navigateur n\'a pas pu l\'encoder.');
  return decoded;
}

export async function writeOutput(root: string, relative: string, data: BatchOutputData): Promise<void> {
  const target = resolveInside(root, relative);
  const bytes = bytesOf(data);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.part`;
  try {
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

/** Whether an output exists and is not empty */
export async function outputExists(root: string, relative: string): Promise<boolean> {
  try {
    return (await fs.stat(resolveInside(root, relative))).size > 0;
  } catch {
    return false;
  }
}
