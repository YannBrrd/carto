/**
 * User-facing message (French) for a file write error of the main process
 */
export function writeErrorMessage(error: unknown, filePath: string): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'EBUSY' || code === 'EACCES') {
    return `Le fichier "${filePath}" est ouvert dans une autre application. Fermez-le et réessayez.`;
  }
  if (code === 'ENOSPC') return 'Espace disque insuffisant.';
  if (code === 'EROFS') return 'Impossible d\'écrire sur un disque en lecture seule.';
  if (code === 'EPERM') return 'Permission refusée. Vérifiez les droits d\'accès au dossier.';
  return String(error);
}
