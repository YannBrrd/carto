import { describe, it, expect } from 'vitest';
import { parseCliArgs, CLI_USAGE } from './cliArgs';

// Packaged: [executable, ...arguments]; development: [electron, '.', ...arguments]
const packaged = (...args: string[]) => parseCliArgs(['/opt/Carto/carto', ...args]);

describe('parseCliArgs', () => {
  it('starts the application without --batch', () => {
    expect(packaged()).toEqual({ mode: 'gui' });
    expect(parseCliArgs(['electron', '.'])).toEqual({ mode: 'gui' });
    // Chromium switches and a file opened with the app are not a batch
    expect(packaged('--no-sandbox', 'carte.osm')).toEqual({ mode: 'gui' });
  });

  it('reads a batch: input and output folders, optional profile, formats and overwrite', () => {
    expect(packaged('--batch', '--input', 'kml', '--output', 'out')).toEqual({
      mode: 'batch', input: 'kml', output: 'out', overwrite: false,
    });
    expect(parseCliArgs(['electron', '.', '--batch', '--input=kml dir', '--output', 'out', '--profile', 'p.json', '--formats', 'pdf,png', '--overwrite'])).toEqual({
      mode: 'batch', input: 'kml dir', output: 'out', profile: 'p.json', formats: ['pdf', 'png'], overwrite: true,
    });
  });

  it('accepts short names and repeated formats once', () => {
    expect(packaged('--batch', '-i', 'in', '-o', 'out', '-f', 'png,PNG, jpeg')).toMatchObject({ formats: ['png', 'jpeg'] });
  });

  it('ignores Chromium switches around the batch arguments', () => {
    expect(packaged('--no-sandbox', '--batch', '--input', 'in', '--output', 'out', '--ozone-platform=headless'))
      .toMatchObject({ mode: 'batch', input: 'in', output: 'out' });
  });

  it('gives the usage when asked', () => {
    expect(packaged('--batch', '--help')).toEqual({ mode: 'help' });
    expect(packaged('--help')).toEqual({ mode: 'help' });
    expect(CLI_USAGE).toContain('--batch');
    expect(CLI_USAGE).toContain('--input');
  });

  it('refuses a batch without input or output folder, or with an unknown format, with a French message', () => {
    expect(packaged('--batch', '--output', 'out')).toEqual({ mode: 'error', message: expect.stringContaining('--input') });
    expect(packaged('--batch', '--input', 'in')).toEqual({ mode: 'error', message: expect.stringContaining('--output') });
    expect(packaged('--batch', '--input')).toEqual({ mode: 'error', message: expect.stringContaining('--input') });
    expect(packaged('--batch', '-i', 'in', '-o', 'out', '--formats', 'pdf,gif')).toEqual({ mode: 'error', message: expect.stringContaining('gif') });
    expect(packaged('--batch', '-i', 'in', '-o', 'out', '--formats', '')).toEqual({ mode: 'error', message: expect.stringContaining('format') });
  });
});
