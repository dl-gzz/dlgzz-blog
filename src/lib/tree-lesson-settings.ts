export type TreeLessonSettings = { road: number; spacing: number };
export const DEFAULT_TREE_SETTINGS: Readonly<TreeLessonSettings> =
  Object.freeze({ road: 20, spacing: 5 });

export function parseTreeSettings(value: unknown): TreeLessonSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { road, spacing } = value as Partial<TreeLessonSettings>;
  if (
    Object.keys(value).length !== 2 ||
    typeof road !== 'number' ||
    typeof spacing !== 'number' ||
    !Number.isInteger(road) ||
    !Number.isInteger(spacing) ||
    road < 5 ||
    road > 100 ||
    spacing < 1 ||
    spacing > 20 ||
    road % spacing !== 0 ||
    road / spacing < 2 ||
    road / spacing > 10
  )
    return null;
  return { road, spacing };
}

export function treeLessonFrameSrc(settings: TreeLessonSettings) {
  const valid = parseTreeSettings(settings);
  if (!valid) throw new Error('种植参数不适合这节课');
  return (
    '/courseware/zhi-shu/index.html#road=' +
    valid.road +
    '&spacing=' +
    valid.spacing
  );
}
