import { readFile, writeFile, rename } from 'fs/promises';
import { resolve, dirname } from 'path';
import yaml from 'js-yaml';
import { valuesFilePath } from '../config.js';

/**
 * Reads and parses a Helm values YAML file from the configured helmConfigDir.
 * @param filename - Bare filename (no path separators allowed).
 * @returns Parsed YAML as a key-value record, or empty object for empty files.
 */
export async function readValuesFile(filename: string): Promise<Record<string, unknown>> {
  const filePath = valuesFilePath(filename);
  const content = await readFile(filePath, 'utf-8');
  return (yaml.load(content) as Record<string, unknown>) ?? {};
}

/**
 * Atomically writes data as YAML to a Helm values file (write-to-temp then rename).
 * @param filename - Bare filename (no path separators allowed).
 * @param data - Object to serialize as YAML.
 */
export async function writeValuesFile(
  filename: string,
  data: Record<string, unknown>,
): Promise<void> {
  const filePath = valuesFilePath(filename);
  const content = yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true });

  // Atomic write: write to temp, then rename
  const tmpPath = resolve(dirname(filePath), `.${filename}.tmp`);
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}

export async function readRawYaml(filename: string): Promise<string> {
  const filePath = valuesFilePath(filename);
  return readFile(filePath, 'utf-8');
}
