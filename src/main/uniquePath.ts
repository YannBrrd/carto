import * as path from 'path';

const MAX_ATTEMPTS = 1000;

/**
 * Return `filePath` if free, otherwise "name (1).ext", "name (2).ext"...
 * `exists` is injected so the logic stays testable without touching the disk.
 */
export async function uniquePath(
  filePath: string,
  exists: (p: string) => Promise<boolean>
): Promise<string> {
  if (!(await exists(filePath))) {
    return filePath;
  }
  const { dir, name, ext } = path.parse(filePath);
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const candidate = path.join(dir, `${name} (${i})${ext}`);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error('Impossible de trouver un nom de fichier disponible.');
}
