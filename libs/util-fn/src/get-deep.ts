export function getDeep(obj: object, path: string) {
  const split = path.split('.');

  if (split.length === 1) {
    return obj[path];
  }

  // eslint-disable-next-line unicorn/no-array-reduce
  return split.reduce((acc, key) => acc[key], obj);
}
