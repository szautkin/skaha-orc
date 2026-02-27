import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock config before importing yaml service
const tmpDir = mkdtempSync(join(tmpdir(), 'yaml-test-'));

jest.mock('../../src/config', () => ({
  config: {
    helmConfigDir: tmpDir,
  },
  valuesFilePath: (filename: string) => {
    if (filename.includes('..') || filename.includes('/')) {
      throw new Error(`Invalid values filename: ${filename}`);
    }
    const { resolve } = require('path');
    return resolve(tmpDir, filename);
  },
}));

import { readValuesFile, writeValuesFile } from '../../src/services/yaml.service';

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('readValuesFile', () => {
  it('parses valid YAML', async () => {
    writeFileSync(join(tmpDir, 'valid.yaml'), 'key: value\nnested:\n  num: 42\n');
    const result = await readValuesFile('valid.yaml');
    expect(result.key).toBe('value');
    expect((result.nested as any).num).toBe(42);
  });

  it('returns empty object for empty file', async () => {
    writeFileSync(join(tmpDir, 'empty.yaml'), '');
    const result = await readValuesFile('empty.yaml');
    expect(result).toEqual({});
  });

  it('throws for missing file', async () => {
    await expect(readValuesFile('nonexistent.yaml')).rejects.toThrow();
  });
});

describe('writeValuesFile', () => {
  it('writes valid YAML readable back', async () => {
    const data = { deployment: { name: 'test', port: 8080 } };
    await writeValuesFile('roundtrip.yaml', data);
    const result = await readValuesFile('roundtrip.yaml');
    expect(result.deployment).toEqual({ name: 'test', port: 8080 });
  });

  it('preserves nested structures', async () => {
    const data = {
      level1: {
        level2: {
          level3: ['a', 'b', 'c'],
        },
      },
    };
    await writeValuesFile('nested.yaml', data);
    const result = await readValuesFile('nested.yaml');
    expect((result as any).level1.level2.level3).toEqual(['a', 'b', 'c']);
  });
});
