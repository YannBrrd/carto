/**
 * Reading of a local .osm file, for the file dialog and for the file reloaded at startup
 */

import { promises as fs } from 'fs';
import * as path from 'path';

export interface OsmFileResult {
  success: boolean;
  content?: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}

const OSM_EXTENSIONS = ['.osm', '.xml'];

export async function readOsmFile(filePath: string): Promise<OsmFileResult> {
  if (typeof filePath !== 'string' || !OSM_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) {
    return { success: false, error: 'Seuls les fichiers .osm ou .xml sont pris en charge.' };
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content, filePath, fileName: path.basename(filePath) };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return { success: false, error: `Fichier introuvable : ${filePath}` };
    }
    return { success: false, error: `Erreur de lecture: ${String(error)}` };
  }
}
