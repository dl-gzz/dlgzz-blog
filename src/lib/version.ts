export function compareVersions(a: string, b: string) {
  const left = a
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const right = b
    .trim()
    .split('.')
    .map((segment) => Number(segment.match(/\d+/)?.[0] || 0));
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}
