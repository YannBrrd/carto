// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readEnvFile, buildVariable } from './buildEnv';

describe('readEnvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carto-env-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the variables of a .env file, ignoring comments and quotes', () => {
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, '# CARTO basemaps\nCARTO_API_KEY="abc123"\nOTHER=value\n');
    expect(readEnvFile(file)).toEqual({ CARTO_API_KEY: 'abc123', OTHER: 'value' });
  });

  it('reads a file written on Windows: CRLF, UTF-8 with a BOM, or UTF-16 from PowerShell 5 `>`', () => {
    const file = path.join(dir, '.env');
    const text = 'CARTO_API_KEY=abc123\r\nOTHER=value\r\n';
    const expected = { CARTO_API_KEY: 'abc123', OTHER: 'value' };

    fs.writeFileSync(file, text);
    expect(readEnvFile(file)).toEqual(expected);
    fs.writeFileSync(file, `﻿${text}`);
    expect(readEnvFile(file)).toEqual(expected);
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    expect(readEnvFile(file)).toEqual(expected);
  });

  it('gives no variables when there is no .env file', () => {
    expect(readEnvFile(path.join(dir, '.env'))).toEqual({});
  });

  it('reports a .env path that cannot be read instead of silently building without a key', () => {
    expect(() => readEnvFile(dir)).toThrow();
  });
});

describe('buildVariable', () => {
  it('takes the environment first, as the GitHub secret in CI', () => {
    expect(buildVariable('CARTO_API_KEY', { CARTO_API_KEY: 'from-ci' }, { CARTO_API_KEY: 'from-file' })).toBe('from-ci');
  });

  it('falls back to the .env file when the environment has no value', () => {
    expect(buildVariable('CARTO_API_KEY', {}, { CARTO_API_KEY: 'from-file' })).toBe('from-file');
    expect(buildVariable('CARTO_API_KEY', { CARTO_API_KEY: '' }, { CARTO_API_KEY: 'from-file' })).toBe('from-file');
  });

  it('is empty when neither defines it', () => {
    expect(buildVariable('CARTO_API_KEY', {}, {})).toBe('');
  });
});
