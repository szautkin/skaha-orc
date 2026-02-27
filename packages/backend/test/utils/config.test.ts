import { valuesFilePath } from '../../src/config';

describe('valuesFilePath', () => {
  it('resolves a simple filename', () => {
    const result = valuesFilePath('base-values.yaml');
    expect(result).toContain('base-values.yaml');
    expect(result).not.toContain('..');
  });

  it('throws on path traversal with ..', () => {
    expect(() => valuesFilePath('../etc/passwd')).toThrow('Invalid values filename');
  });

  it('throws on subdirectory with /', () => {
    expect(() => valuesFilePath('subdir/file.yaml')).toThrow('Invalid values filename');
  });

  it('handles hyphenated filenames', () => {
    const result = valuesFilePath('posix-mapper-values.yaml');
    expect(result).toContain('posix-mapper-values.yaml');
  });
});
