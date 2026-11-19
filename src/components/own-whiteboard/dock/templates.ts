import {
  createDocument,
  createId,
  createShape,
  validateDocument,
} from '../core/model';
import {
  type BoardShape,
  SHAPE_LABELS,
  type ShapeProps,
  type ShapeStyle,
  type ShapeType,
} from '../core/types';

export const TOOLS_STORAGE_KEY = 'oneworker-tools-dock-v1';
export const LEGACY_TOOLS_STORAGE_KEY = 'ow-os-custom-dock-items';
export const MAX_TOOLS = 50;
export const MAX_TOOLS_BYTES = 2 * 1024 * 1024;
const TOOL_TYPES = [
  'text',
  'note',
  'ai_result',
  'preview_html',
  'blog_post',
  'skill',
] as const;
export type ToolType = (typeof TOOL_TYPES)[number];
export type ToolTemplate = {
  id: string;
  name: string;
  type: ToolType;
  w: number;
  h: number;
  cardScale?: number;
  style: ShapeStyle;
  props: ShapeProps;
  createdAt: number;
};
export type ToolsLibrary = {
  format: 'oneworker-tools-dock';
  version: 1;
  items: ToolTemplate[];
  importedLegacyIds: string[];
};
type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyToolsLibrary(): ToolsLibrary {
  return {
    format: 'oneworker-tools-dock',
    version: 1,
    items: [],
    importedLegacyIds: [],
  };
}

export function canSaveTool(shape: BoardShape | null): boolean {
  return !!shape && TOOL_TYPES.includes(shape.type as ToolType);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('工具库数据结构无效。');
  return value as Record<string, unknown>;
}

function toolName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 60)
    throw new Error('工具名称需要 1–60 个字符。');
  return value.trim();
}

function toolId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(value))
    throw new Error('工具标识无效。');
  return value;
}

/** Explicit config allowlist: never copy chat history, results, tokens, jobs or asset handles. */
function reusableProps(type: ToolType, input: unknown): ShapeProps {
  const source = asRecord(input);
  const keys: Record<ToolType, string[]> = {
    text: ['text', 'title'],
    note: ['text', 'title'],
    ai_result: ['text', 'title'],
    preview_html: ['html', 'title', 'description'],
    blog_post: ['title', 'description', 'url', 'image', 'date', 'category'],
    skill: ['title', 'skillId', 'accountName', 'keyword', 'afterDate'],
  };
  const props: ShapeProps = {};
  for (const key of keys[type]) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'string' || source[key].length > 500_000)
      throw new Error('工具配置文本无效或超过 500,000 字符。');
    if (
      (key === 'html' || key === 'url' || key === 'image') &&
      /\bblob:/i.test(source[key])
    )
      throw new Error(
        '工具包含临时媒体地址，关闭页面后会失效，请先移除临时媒体。'
      );
    props[key] = source[key];
  }
  // A text artifact is its reusable content; runtime result fields themselves are never copied.
  if (type === 'ai_result' && !props.text && typeof source.result === 'string')
    props.text = source.result;
  if (type === 'text' || type === 'note') {
    for (const key of ['bold', 'italic'])
      if (typeof source[key] === 'boolean') props[key] = source[key];
    if (['left', 'center', 'right'].includes(String(source.align)))
      props.align = source.align;
  }
  if (type === 'skill' && source.limit !== undefined) {
    if (
      typeof source.limit !== 'number' ||
      !Number.isInteger(source.limit) ||
      source.limit < 1 ||
      source.limit > 10
    )
      throw new Error('Skill 的数量配置需要是 1–10 的整数。');
    props.limit = source.limit;
  }
  return props;
}

function validatedStandalone(
  type: ToolType,
  w: unknown,
  h: unknown,
  style: unknown,
  props: unknown,
  cardScale?: unknown
): BoardShape {
  const shape = createShape(type, 0, 0, reusableProps(type, props));
  if (w !== undefined) shape.w = w as number;
  if (h !== undefined) shape.h = h as number;
  if (cardScale !== undefined) shape.cardScale = cardScale as number;
  if (style !== undefined) {
    const sourceStyle = asRecord(style);
    shape.style = {
      stroke: sourceStyle.stroke as string,
      fill: sourceStyle.fill as string,
      strokeWidth: sourceStyle.strokeWidth as number,
      fontSize: sourceStyle.fontSize as number,
      opacity: sourceStyle.opacity as number,
      dash: sourceStyle.dash as boolean,
    };
  }
  const document = createDocument();
  document.pages[0].shapes = [shape];
  return validateDocument(document).pages[0].shapes[0];
}

export function suggestedToolName(shape: BoardShape): string {
  const props = shape.props;
  const htmlTitle =
    typeof props.html === 'string'
      ? props.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      : undefined;
  const value =
    props.title ||
    htmlTitle ||
    props.text?.split('\n')[0] ||
    SHAPE_LABELS[shape.type];
  return (
    value
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 60) || '我的工具'
  );
}

export function createToolTemplate(
  shape: BoardShape,
  name = suggestedToolName(shape)
): ToolTemplate {
  if (!canSaveTool(shape))
    throw new Error('请选择 HTML、文字、便签、文章或 Skill 卡片。');
  const clean = validatedStandalone(
    shape.type as ToolType,
    shape.w,
    shape.h,
    shape.style,
    shape.props,
    shape.cardScale
  );
  return {
    id: createId('tool'),
    name: toolName(name),
    type: clean.type as ToolType,
    w: clean.w,
    h: clean.h,
    ...(clean.cardScale !== undefined && clean.cardScale !== 1 && { cardScale: clean.cardScale }),
    style: clean.style,
    props: clean.props,
    createdAt: Date.now(),
  };
}

export function instantiateTool(template: ToolTemplate): BoardShape {
  // createShape supplies a new id and fresh state on every invocation.
  return validatedStandalone(
    template.type,
    template.w,
    template.h,
    template.style,
    template.props,
    template.cardScale
  );
}

function validateTemplate(value: unknown): ToolTemplate {
  const input = asRecord(value);
  if (!TOOL_TYPES.includes(input.type as ToolType))
    throw new Error('工具库包含不支持的卡片类型。');
  if (
    typeof input.createdAt !== 'number' ||
    !Number.isFinite(input.createdAt) ||
    input.createdAt < 0
  )
    throw new Error('工具创建时间无效。');
  const clean = validatedStandalone(
    input.type as ToolType,
    input.w,
    input.h,
    input.style,
    input.props,
    input.cardScale
  );
  return {
    id: toolId(input.id),
    name: toolName(input.name),
    type: clean.type as ToolType,
    w: clean.w,
    h: clean.h,
    ...(clean.cardScale !== undefined && clean.cardScale !== 1 && { cardScale: clean.cardScale }),
    style: clean.style,
    props: clean.props,
    createdAt: input.createdAt,
  };
}

export function parseToolsLibrary(text: string): ToolsLibrary {
  if (text.length > MAX_TOOLS_BYTES || new Blob([text]).size > MAX_TOOLS_BYTES)
    throw new Error('工具库备份不能超过 2 MiB。');
  let input: Record<string, unknown>;
  try {
    input = asRecord(JSON.parse(text));
  } catch {
    throw new Error('不是有效的工具库 JSON 文件。');
  }
  if (
    input.format !== 'oneworker-tools-dock' ||
    input.version !== 1 ||
    !Array.isArray(input.items) ||
    input.items.length > MAX_TOOLS
  )
    throw new Error('工具库格式不支持或超过 50 个工具。');
  const items = input.items.map(validateTemplate);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('工具库包含重复标识。');
  const imported = input.importedLegacyIds ?? [];
  if (
    !Array.isArray(imported) ||
    imported.length > 500 ||
    imported.some((id) => typeof id !== 'string' || id.length > 256)
  )
    throw new Error('旧工具恢复记录无效。');
  return {
    format: 'oneworker-tools-dock',
    version: 1,
    items,
    importedLegacyIds: [...new Set(imported as string[])],
  };
}

export function serializeToolsLibrary(library: ToolsLibrary): string {
  const text = JSON.stringify(
    parseToolsLibrary(JSON.stringify(library)),
    null,
    2
  );
  if (new Blob([text]).size > MAX_TOOLS_BYTES)
    throw new Error('工具库备份不能超过 2 MiB。');
  return text;
}

export function loadToolsLibrary(storage: LocalStore): ToolsLibrary {
  const value = storage.getItem(TOOLS_STORAGE_KEY);
  return value ? parseToolsLibrary(value) : emptyToolsLibrary();
}

export function saveToolsLibrary(
  library: ToolsLibrary,
  storage: LocalStore
): void {
  const text = serializeToolsLibrary(library);
  if (new Blob([text]).size > MAX_TOOLS_BYTES)
    throw new Error('工具库超过 2 MiB，请先导出备份并移除不再使用的工具。');
  storage.setItem(TOOLS_STORAGE_KEY, text);
}

function fingerprint(template: ToolTemplate): string {
  return JSON.stringify([
    template.type,
    template.w,
    template.h,
    template.cardScale ?? 1,
    Object.entries(template.style).sort(([a], [b]) => a.localeCompare(b)),
    Object.entries(template.props).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

export function addTool(
  library: ToolsLibrary,
  template: ToolTemplate
): ToolsLibrary {
  const clean = validateTemplate(template);
  if (
    library.items.some(
      (item) => item.id === clean.id || fingerprint(item) === fingerprint(clean)
    )
  )
    return library;
  if (library.items.length >= MAX_TOOLS)
    throw new Error('最多保存 50 个工具，请先移除不再使用的工具。');
  return { ...library, items: [...library.items, clean] };
}

export function renameTool(
  library: ToolsLibrary,
  id: string,
  name: string
): ToolsLibrary {
  const nextName = toolName(name);
  return {
    ...library,
    items: library.items.map((item) =>
      item.id === id ? { ...item, name: nextName } : item
    ),
  };
}

export function removeTool(library: ToolsLibrary, id: string): ToolsLibrary {
  return { ...library, items: library.items.filter((item) => item.id !== id) };
}

export function mergeToolsLibrary(
  library: ToolsLibrary,
  incoming: ToolsLibrary
): { library: ToolsLibrary; added: number } {
  let merged = library;
  for (const item of incoming.items) merged = addTool(merged, item);
  const importedLegacyIds = [
    ...new Set([...library.importedLegacyIds, ...incoming.importedLegacyIds]),
  ];
  if (importedLegacyIds.length > 500)
    throw new Error('旧工具恢复记录数量过多。');
  return {
    library: { ...merged, importedLegacyIds },
    added: merged.items.length - library.items.length,
  };
}

/** Explicit, repeat-safe recovery. The old localStorage record is never modified. */
export function recoverLegacyTools(
  library: ToolsLibrary,
  text: string | null
): { library: ToolsLibrary; added: number; skipped: number } {
  if (!text) return { library, added: 0, skipped: 0 };
  if (text.length > MAX_TOOLS_BYTES || new Blob([text]).size > MAX_TOOLS_BYTES)
    throw new Error('旧工具记录过大，未修改原数据。');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error('旧工具记录无法解析，原数据保持不变。');
  }
  if (!Array.isArray(input) || input.length > 500)
    throw new Error('旧工具记录结构无效。');
  let merged = library;
  let skipped = 0;
  const imported = new Set(library.importedLegacyIds);
  for (const entry of input) {
    try {
      const item = asRecord(entry);
      const id = toolId(item.id);
      if (imported.has(id)) {
        skipped++;
        continue;
      }
      if (
        !['preview_html', 'ai_result', 'blog_post'].includes(String(item.type))
      ) {
        skipped++;
        continue;
      }
      const props = asRecord(item.props);
      const shape = validatedStandalone(
        item.type as ToolType,
        props.w,
        props.h,
        undefined,
        props
      );
      if (item.type === 'ai_result' && typeof props.color === 'string')
        shape.style.fill = props.color;
      const template = createToolTemplate(
        shape,
        typeof item.label === 'string'
          ? item.label.slice(0, 60)
          : suggestedToolName(shape)
      );
      const next = addTool(merged, template);
      if (next === merged) skipped++;
      merged = next;
      imported.add(id);
    } catch {
      skipped++;
    }
  }
  return {
    library: { ...merged, importedLegacyIds: [...imported] },
    added: merged.items.length - library.items.length,
    skipped,
  };
}

export function toolTypeLabel(type: ShapeType): string {
  return type === 'skill'
    ? 'Skill'
    : type === 'preview_html'
      ? 'HTML'
      : SHAPE_LABELS[type];
}
