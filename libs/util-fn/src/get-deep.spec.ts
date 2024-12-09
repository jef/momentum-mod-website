import { getDeep } from './get-deep';

describe('getDeep', () => {
  it('returns the value for a single level key', () => {
    const obj = { a: 1, b: 2 };
    const result = getDeep(obj, 'a');
    expect(result).toBe(1);
  });

  it('returns the value for a nested key', () => {
    const obj = { a: { b: { c: 3 } } };
    const result = getDeep(obj, 'a.b.c');
    expect(result).toBe(3);
  });

  it('returns undefined for a non-existent key', () => {
    const obj = { a: 1, b: 2 };
    const result = getDeep(obj, 'c');
    expect(result).toBeUndefined();
  });

  it('returns undefined for a non-existent nested key', () => {
    const obj = { a: { b: 2 } };
    const result = getDeep(obj, 'a.c');
    expect(result).toBeUndefined();
  });

  it('returns the value for a deeply nested key', () => {
    const obj = { a: { b: { c: { d: { e: 5 } } } } };
    const result = getDeep(obj, 'a.b.c.d.e');
    expect(result).toBe(5);
  });

  it('returns undefined for an empty path', () => {
    const obj = { a: 1 };
    const result = getDeep(obj, '');
    expect(result).toBeUndefined();
  });
});
