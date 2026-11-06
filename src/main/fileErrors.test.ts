import { describe, it, expect } from 'vitest';
import { writeErrorMessage } from './fileErrors';

describe('writeErrorMessage', () => {
  it('names the file when it is locked by another application', () => {
    expect(writeErrorMessage({ code: 'EBUSY' }, '/exports/carte.pdf'))
      .toBe('Le fichier "/exports/carte.pdf" est ouvert dans une autre application. Fermez-le et réessayez.');
    expect(writeErrorMessage({ code: 'EACCES' }, '/exports/carte.pdf')).toContain('ouvert dans une autre application');
  });

  it('explains disk, read-only and permission errors', () => {
    expect(writeErrorMessage({ code: 'ENOSPC' }, 'f')).toBe('Espace disque insuffisant.');
    expect(writeErrorMessage({ code: 'EROFS' }, 'f')).toBe('Impossible d\'écrire sur un disque en lecture seule.');
    expect(writeErrorMessage({ code: 'EPERM' }, 'f')).toBe('Permission refusée. Vérifiez les droits d\'accès au dossier.');
  });

  it('falls back to the error text', () => {
    expect(writeErrorMessage(new Error('boom'), 'f')).toBe('Error: boom');
  });
});
