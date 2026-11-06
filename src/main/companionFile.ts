/**
 * A file written beside an exported file, with the same name and another extension
 * (the KML of the zones beside the exported map). No save dialog: the user named the
 * exported file; an existing companion is only replaced after confirmation.
 */

import * as path from 'path';
import { writeErrorMessage } from './fileErrors';

export interface CompanionFileIO {
  exists: (filePath: string) => Promise<boolean>;
  confirmReplace: (filePath: string) => Promise<boolean>;
  write: (filePath: string, content: string) => Promise<void>;
}

export interface CompanionFileResult {
  success: boolean;
  path?: string;
  /** The companion existed and the user kept it */
  cancelled?: boolean;
  error?: string;
}

/** The path of the companion of `filePath`: same directory and name, `extension` instead of its extension */
export function companionPath(filePath: string, extension: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, parsed.name + extension);
}

export async function writeCompanionFile(
  filePath: string,
  extension: string,
  content: string,
  io: CompanionFileIO
): Promise<CompanionFileResult> {
  const target = companionPath(filePath, extension);
  if (await io.exists(target) && !(await io.confirmReplace(target))) {
    return { success: false, cancelled: true, path: target };
  }
  try {
    await io.write(target, content);
    return { success: true, path: target };
  } catch (error) {
    return { success: false, error: writeErrorMessage(error, target) };
  }
}
