import { getShapeBounds } from './model';
import type { BoardShape } from './types';

const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|json|log|js|jsx|ts|tsx|py|yaml|yml|html|htm|css|xml)$/i;
export const MATERIAL_TEXT_LIMIT = 100_000;
export const MATERIAL_FILE_LIMIT = 1024 * 1024;

export function isTextMaterial(file: { name: string; type: string }): boolean {
  return file.type.startsWith('text/') || TEXT_EXTENSIONS.test(file.name);
}

/** Imported code remains inert text; no execution or upload happens on drop. */
export function textMaterialProps(name: string, content: string) {
  if (content.includes('\0'))
    throw new Error('文件包含二进制内容，未当作文本导入。');
  const truncated = content.length > MATERIAL_TEXT_LIMIT;
  return {
    title: name.slice(0, 200),
    text: content.slice(0, MATERIAL_TEXT_LIMIT),
    sourceName: name.slice(0, 200),
    sourceTruncated: truncated,
  };
}

/** Nearby is a suggestion only. It never starts a paid analysis automatically. */
export function nearestVideo(
  analyzer: BoardShape,
  shapes: BoardShape[],
  radius = 120
) {
  const a = getShapeBounds(analyzer, shapes);
  return shapes
    .filter((shape) => ['video', 'video_player'].includes(shape.type))
    .map((shape) => {
      const b = getShapeBounds(shape, shapes);
      return {
        shape,
        distance: Math.hypot(
          Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0),
          Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
        ),
      };
    })
    .filter(({ distance }) => distance <= radius)
    .sort(
      (a, b) => a.distance - b.distance || a.shape.id.localeCompare(b.shape.id)
    )[0]?.shape;
}

/** Position newly generated results after text has expanded to its final height. */
export function arrangeGeneratedResults(
  shapes: BoardShape[],
  createdIds: string[]
): BoardShape[] {
  const created = new Set(createdIds);
  let nextY: number | undefined;
  return shapes.map((shape) => {
    if (!created.has(shape.id) || shape.type === 'arrow') return shape;
    const y = nextY ?? shape.y;
    nextY = y + shape.h + 24;
    return { ...shape, y };
  });
}
