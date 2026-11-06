import { describe, it, expect, vi } from 'vitest';
import { companionPath, writeCompanionFile, CompanionFileIO } from './companionFile';

describe('companionPath', () => {
  it('replaces the extension of the exported file, in the same directory', () => {
    expect(companionPath('/exports/carte.pdf', '.kml')).toBe('/exports/carte.kml');
    expect(companionPath('/exports/carte.png', '.kml')).toBe('/exports/carte.kml');
  });

  it('only replaces the last extension', () => {
    expect(companionPath('/exports/carte.v2.jpeg', '.kml')).toBe('/exports/carte.v2.kml');
  });

  it('adds the extension to a file without one', () => {
    expect(companionPath('/exports/carte', '.kml')).toBe('/exports/carte.kml');
  });
});

function io(overrides: Partial<CompanionFileIO> = {}): CompanionFileIO & { write: ReturnType<typeof vi.fn> } {
  return {
    exists: vi.fn(async () => false),
    confirmReplace: vi.fn(async () => true),
    write: vi.fn(async () => {}),
    ...overrides,
  } as CompanionFileIO & { write: ReturnType<typeof vi.fn> };
}

describe('writeCompanionFile', () => {
  it('writes beside the exported file without asking when nothing is overwritten', async () => {
    const files = io();
    const result = await writeCompanionFile('/exports/carte.pdf', '.kml', '<kml/>', files);
    expect(result).toEqual({ success: true, path: '/exports/carte.kml' });
    expect(files.confirmReplace).not.toHaveBeenCalled();
    expect(files.write).toHaveBeenCalledWith('/exports/carte.kml', '<kml/>');
  });

  it('asks before replacing an existing file and replaces it when confirmed', async () => {
    const files = io({ exists: vi.fn(async () => true) });
    const result = await writeCompanionFile('/exports/carte.pdf', '.kml', '<kml/>', files);
    expect(files.confirmReplace).toHaveBeenCalledWith('/exports/carte.kml');
    expect(result).toEqual({ success: true, path: '/exports/carte.kml' });
    expect(files.write).toHaveBeenCalledWith('/exports/carte.kml', '<kml/>');
  });

  it('keeps the existing file when the replacement is declined', async () => {
    const files = io({ exists: vi.fn(async () => true), confirmReplace: vi.fn(async () => false) });
    const result = await writeCompanionFile('/exports/carte.pdf', '.kml', '<kml/>', files);
    expect(result).toEqual({ success: false, cancelled: true, path: '/exports/carte.kml' });
    expect(files.write).not.toHaveBeenCalled();
  });

  it('reports write errors in plain words', async () => {
    const files = io({ write: vi.fn(async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); }) });
    const result = await writeCompanionFile('/exports/carte.pdf', '.kml', '<kml/>', files);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Le fichier "/exports/carte.kml" est ouvert dans une autre application. Fermez-le et réessayez.');
  });
});
