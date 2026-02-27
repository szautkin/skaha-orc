import { getNestedValue, setNestedValue } from '../../src/routes/oidc';

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
    expect((obj as any).a.b.c).toBe(99);
  });

  it('overwrites existing value', () => {
    const obj: Record<string, unknown> = { a: { b: { c: 'old' } } };
    setNestedValue(obj, 'a.b.c', 'new');
    expect((obj as any).a.b.c).toBe('new');
  });

  it('does not clobber siblings', () => {
    const obj: Record<string, unknown> = { a: { b: 1, c: 2 } };
    setNestedValue(obj, 'a.b', 'updated');
    expect((obj as any).a.b).toBe('updated');
    expect((obj as any).a.c).toBe(2);
  });
});
