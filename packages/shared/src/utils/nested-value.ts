type ObjPath = string | string[];

function toKeys(path: ObjPath): string[] {
  return typeof path === 'string' ? path.split('.') : path;
}

export function getNestedValue(obj: Record<string, unknown>, path: ObjPath): unknown {
  const keys = toKeys(path);
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setNestedValue(obj: Record<string, unknown>, path: ObjPath, value: unknown): void {
  const keys = toKeys(path);
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

export function getNestedString(obj: Record<string, unknown>, path: ObjPath): string {
  const val = getNestedValue(obj, path);
  return typeof val === 'string' ? val : '';
}

export function getNestedArray<T = unknown>(obj: Record<string, unknown>, path: ObjPath): T[] | undefined {
  const val = getNestedValue(obj, path);
  return Array.isArray(val) ? (val as T[]) : undefined;
}
