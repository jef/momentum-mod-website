import { Get } from 'type-fest';
import { getDeep } from './get-deep';

export function pick<Obj extends object, Keys extends keyof Obj>(
  obj: Obj,
  keys: Keys
): Pick<Obj, Keys>;

export function pick<Obj extends object, Keys extends Array<keyof Obj>>(
  obj: Obj,
  keys: Keys
): Pick<Obj, Keys[number]>;

export function pick<
  Obj extends object,
  Keys extends keyof Obj | Array<keyof Obj>
>(
  obj: Obj,
  keys: Keys
): Pick<Obj, Keys extends Array<keyof Obj> ? Keys[number] : Keys> {
  const result: any = {};

  for (const key of Object.keys(obj) as Array<keyof Obj>) {
    if (Array.isArray(keys)) {
      if (keys.includes(key)) {
        result[key] = obj[key];
      }
    } else {
      if (keys === key) {
        result[key] = obj[key];
      }
    }
  }

  return result;
}

export function pickDeep<
  Obj extends object,
  Path extends string | readonly string[]
>(obj: Obj, keys: Path): Get<Obj, Path> {
  const result: any = {};

  for (const key of Object.keys(obj)) {
    if (Array.isArray(keys)) {
      if (keys.includes(key)) {
        result[key] = getDeep(obj, key);
      }
    } else {
      if (keys === (key as string)) {
        result[key] = getDeep(obj, key);
      }
    }
  }

  return result;
}
