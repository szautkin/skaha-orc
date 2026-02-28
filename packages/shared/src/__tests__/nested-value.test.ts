import { getNestedValue, setNestedValue, getNestedString, getNestedArray } from '../utils/nested-value';

describe('getNestedValue', () => {
  it('gets a top-level key', () => {
    expect(getNestedValue({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('gets a 3-level deep key', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing intermediate', () => {
    const obj = { a: { x: 1 } };
    expect(getNestedValue(obj, 'a.b.c')).toBeUndefined();
  });

  it('handles single-segment path', () => {
    expect(getNestedValue({ name: 'test' }, 'name')).toBe('test');
  });

  it('returns undefined when root is empty object', () => {
    expect(getNestedValue({}, 'a.b')).toBeUndefined();
  });

  it('accepts array path', () => {
    const obj = { a: { b: { c: 99 } } };
    expect(getNestedValue(obj, ['a', 'b', 'c'])).toBe(99);
  });

  it('returns undefined for null intermediate', () => {
    const obj = { a: null } as unknown as Record<string, unknown>;
    expect(getNestedValue(obj, 'a.b')).toBeUndefined();
  });

  it('gets array values', () => {
    const obj = { items: [1, 2, 3] };
    expect(getNestedValue(obj, 'items')).toEqual([1, 2, 3]);
  });

  it('gets boolean values', () => {
    const obj = { config: { enabled: false } };
    expect(getNestedValue(obj, 'config.enabled')).toBe(false);
  });

  it('returns undefined for path beyond primitive', () => {
    const obj = { a: 'string' };
    expect(getNestedValue(obj, 'a.b')).toBeUndefined();
  });
});

describe('setNestedValue', () => {
  it('sets a top-level key', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('creates intermediate objects for deep key', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 99);
    expect(getNestedValue(obj, 'a.b.c')).toBe(99);
  });

  it('overwrites existing value', () => {
    const obj: Record<string, unknown> = { a: { b: { c: 'old' } } };
    setNestedValue(obj, 'a.b.c', 'new');
    expect(getNestedValue(obj, 'a.b.c')).toBe('new');
  });

  it('does not clobber siblings', () => {
    const obj: Record<string, unknown> = { a: { b: 1, c: 2 } };
    setNestedValue(obj, 'a.b', 'updated');
    expect(getNestedValue(obj, 'a.b')).toBe('updated');
    expect(getNestedValue(obj, 'a.c')).toBe(2);
  });

  it('accepts array path', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, ['x', 'y', 'z'], 42);
    expect(getNestedValue(obj, 'x.y.z')).toBe(42);
  });

  it('replaces non-object intermediate with object', () => {
    const obj: Record<string, unknown> = { a: 'string' };
    setNestedValue(obj, 'a.b', 'value');
    expect(getNestedValue(obj, 'a.b')).toBe('value');
  });

  it('sets null values', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b', null);
    expect(getNestedValue(obj, 'a.b')).toBeNull();
  });
});

describe('getNestedString', () => {
  it('returns string value', () => {
    const obj = { name: 'hello' };
    expect(getNestedString(obj, 'name')).toBe('hello');
  });

  it('returns empty string for missing key', () => {
    expect(getNestedString({}, 'missing')).toBe('');
  });

  it('returns empty string for non-string value', () => {
    const obj = { count: 42 };
    expect(getNestedString(obj, 'count')).toBe('');
  });

  it('works with deep dot path', () => {
    const obj = { a: { b: { c: 'deep' } } };
    expect(getNestedString(obj, 'a.b.c')).toBe('deep');
  });

  it('works with array path', () => {
    const obj = { a: { b: 'val' } };
    expect(getNestedString(obj, ['a', 'b'])).toBe('val');
  });

  it('returns empty string for null', () => {
    const obj = { val: null } as unknown as Record<string, unknown>;
    expect(getNestedString(obj, 'val')).toBe('');
  });
});

describe('getNestedArray', () => {
  it('returns array value', () => {
    const obj = { items: [1, 2, 3] };
    expect(getNestedArray(obj, 'items')).toEqual([1, 2, 3]);
  });

  it('returns undefined for non-array', () => {
    const obj = { items: 'not-array' };
    expect(getNestedArray(obj, 'items')).toBeUndefined();
  });

  it('returns undefined for missing key', () => {
    expect(getNestedArray({}, 'missing')).toBeUndefined();
  });

  it('works with deep path', () => {
    const obj = { a: { b: { list: ['x', 'y'] } } };
    expect(getNestedArray(obj, 'a.b.list')).toEqual(['x', 'y']);
  });

  it('works with array path', () => {
    const obj = { a: { list: [10, 20] } };
    expect(getNestedArray(obj, ['a', 'list'])).toEqual([10, 20]);
  });

  it('returns empty array', () => {
    const obj = { empty: [] };
    expect(getNestedArray(obj, 'empty')).toEqual([]);
  });

  it('returns typed arrays', () => {
    const obj = { names: ['a', 'b'] };
    const result = getNestedArray<string>(obj, 'names');
    expect(result).toEqual(['a', 'b']);
  });
});
