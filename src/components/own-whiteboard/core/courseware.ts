import {
  type CoursewareProduct,
  getCourseware,
} from '@/lib/courseware-catalog';
import {
  DEFAULT_TREE_SETTINGS,
  parseTreeSettings,
  treeLessonFrameSrc,
} from '@/lib/tree-lesson-settings';
import { createShape, getShapeBounds, validateDocument } from './model';
import type { BoardDocument, BoardShape, Bounds } from './types';

export {
  type CoursewareProduct,
  coursewareWhiteboardHref,
  getCourseware,
} from '@/lib/courseware-catalog';

export function coursewareForShape(shape: BoardShape) {
  return shape.type === 'embed'
    ? getCourseware(shape.props.coursewareId)
    : undefined;
}

const plantingConfigKeys = new Set([
  'title', 'subtitle', 'routeLength', 'theme', 'defaultShape', 'defaultMode',
  'defaultSkin', 'soundEnabled', 'teacherNote', 'missions',
]);

/** Only bounded JSON data from the editor or registered planting iframe. */
export function plantingLessonConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let budget = 32_000;
  function check(item: unknown, depth: number): boolean {
    if (--budget < 0 || depth > 7) return false;
    if (typeof item === 'string') {
      budget -= item.length;
      return budget >= 0;
    }
    if (typeof item === 'number') return Number.isFinite(item);
    if (item === null || typeof item === 'boolean') return true;
    if (Array.isArray(item))
      return item.length <= 20 && item.every((entry) => check(entry, depth + 1));
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype)
      return false;
    const entries = Object.entries(item);
    return entries.length <= 20 && entries.every(([key, field]) =>
      key.length <= 64 && !['__proto__', 'prototype', 'constructor'].includes(key) && check(field, depth + 1)
    );
  }
  if (!check(value, 0)) return null;
  const data = Object.fromEntries(
    Object.entries(value).filter(([key]) => plantingConfigKeys.has(key))
  );
  if (data.missions !== undefined && (!Array.isArray(data.missions) ||
    data.missions.some((mission) => !mission || typeof mission !== 'object' || Array.isArray(mission))))
    return null;
  return Object.keys(data).length ? data : null;
}

export function escapeJsonForScript(value: unknown) {
  return (JSON.stringify(value) ?? '{}')
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function buildStandaloneCoursewareHtml(
  templateHtml: string,
  assets: { css: string; configJs: string; modelJs: string; lessonJs: string },
  config: unknown
) {
  const clean = plantingLessonConfig(config);
  if (!clean) throw new Error('课件配置无效');
  const css = assets.css.replace(/<\/style/gi, '<\\/style');
  const script = (
    'window.__COURSEWARE_INLINE_CONFIG__ = ' + escapeJsonForScript(clean) + ';\n' +
    assets.configJs + '\n' + assets.modelJs + '\n' + assets.lessonJs
  ).replace(/<\/script/gi, '<\\/script');
  return templateHtml
    .replace(/<link[^>]+href=["']lesson\.css["'][^>]*>\s*/gi, '')
    .replace(/<script[^>]+src=["'](?:config|model|lesson)\.js["'][^>]*><\/script>\s*/gi, '')
    .replace(/<\/head>/i, () => `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style></head>`)
    .replace(/<\/body>/i, () => `<script>\n${script}\n</script></body>`);
}

export function treeSettingsForShape(shape: BoardShape) {
  if (coursewareForShape(shape)?.id !== 'zhi-shu') return null;
  return 'treeLessonSettings' in shape.props
    ? parseTreeSettings(shape.props.treeLessonSettings)
    : DEFAULT_TREE_SETTINGS;
}

export function coursewareSource(shape: BoardShape) {
  const product = coursewareForShape(shape);
  if (product?.id === 'zhi-shu' && 'treeLessonSettings' in shape.props) {
    const settings = treeSettingsForShape(shape);
    if (settings) return treeLessonFrameSrc(settings);
  }
  return product?.entryHref;
}

/** Derive a separate embed on this page from a validated draft, without touching any source props. */
export function addTreeLessonCopy(
  doc: BoardDocument,
  target: { boardId: string; pageId: string; shapeId: string },
  draft: unknown,
  viewport: Pick<Bounds, 'w' | 'h'>
) {
  const p = doc.pages.find((entry) => entry.id === target.pageId);
  const source = p?.shapes.find((s) => s.id === target.shapeId);
  const settings = parseTreeSettings(draft);
  if (
    doc.id !== target.boardId ||
    doc.currentPageId !== target.pageId ||
    !p ||
    !source ||
    !treeSettingsForShape(source) ||
    !settings
  ) {
    throw new Error('原课件或白板已变更，请重新打开备课。');
  }
  const bounds = getShapeBounds(source, p.shapes);
  const y = bounds.y;
  let x = bounds.x + bounds.w + 32;
  const occupied = p.shapes
    .map((s) => getShapeBounds(s, p.shapes))
    .sort((a, b) => a.x - b.x);
  for (const b of occupied) {
    if (
      b.y < y + source.h &&
      y < b.y + b.h &&
      x < b.x + b.w + 16 &&
      b.x < x + source.w + 16
    )
      x = b.x + b.w + 32;
  }
  const copy = {
    ...createShape('embed', x, y, {
      coursewareId: 'zhi-shu',
      title: `直线植树 · ${settings.road}米 / 每${settings.spacing}米`,
      treeLessonSettings: settings,
    }),
    w: source.w,
    h: source.h,
  };
  const zoom = Math.max(
    0.1,
    Math.min(1, (viewport.w - 32) / copy.w, (viewport.h - 128) / copy.h)
  );
  const camera = {
    zoom,
    x: viewport.w / 2 - (copy.x + copy.w / 2) * zoom,
    y: (viewport.h - 32) / 2 - (copy.y + copy.h / 2) * zoom,
  };
  const document = validateDocument({
    ...doc,
    pages: doc.pages.map((entry) =>
      entry === p
        ? { ...entry, camera, shapes: [...entry.shapes, copy] }
        : entry
    ),
  });
  return { document, shapeId: copy.id };
}

export function prepareCoursewareBoard(
  document: BoardDocument,
  product: CoursewareProduct,
  viewport: Pick<Bounds, 'w' | 'h'>
) {
  // Reopening the article reuses the existing lesson card and never replaces notes.
  for (const page of document.pages) {
    const existing = page.shapes.find(
      (shape) =>
        coursewareForShape(shape)?.id === product.id &&
        !('treeLessonSettings' in shape.props)
    );
    if (existing) {
      return {
        document: {
          ...document,
          currentPageId: page.id,
          pages: document.pages.map((candidate) =>
            candidate === page && candidate.camera.zoom === 1
              ? {
                  ...candidate,
                  camera: {
                    ...candidate.camera,
                    x: Math.round(candidate.camera.x),
                    y: Math.round(candidate.camera.y),
                  },
                }
              : candidate
          ),
        },
        shapeId: existing.id,
      };
    }
  }
  const w = Math.max(280, Math.min(1240, (viewport.w || 1000) - 36));
  const h = Math.max(320, Math.min(780, (viewport.h || 800) - 138));
  const shape = {
    ...createShape('embed', 0, 0, {
      title: product.title,
      coursewareId: product.id,
    }),
    w,
    h,
  };
  return {
    document: {
      ...document,
      pages: document.pages.map((page) =>
        page.id === document.currentPageId
          ? {
              ...page,
              shapes: [...page.shapes, shape],
              camera: {
                zoom: 1,
                x: Math.max(12, Math.round(((viewport.w || 1000) - w) / 2)),
                y: Math.max(54, Math.round(((viewport.h || 800) - h - 32) / 2)),
              },
            }
          : page
      ),
    },
    shapeId: shape.id,
  };
}
