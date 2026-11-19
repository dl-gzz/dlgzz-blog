'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLocalePathname } from '@/i18n/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  ChevronDown,
  Copy,
  HelpCircle,
  ImagePlus,
  Layers,
  LockKeyhole,
  Maximize,
  Menu as MenuIcon,
  Minus,
  Plus,
  QrCode,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
  Unlock,
  X,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import ShapeView from './ShapeView';
import DrawingToolsPanel from './DrawingToolsPanel';
import StylePalette from './StylePalette';
import ArticlePicker from './ArticlePicker';
import type { ArticleOption } from './article-picker';
import AssistantPanel, {
  type AssistantApplyRequest,
} from './assistant/AssistantPanel';
import { applyAssistantPlan } from './assistant/logic';
import ToolsDock from './dock/ToolsDock';
import {
  coursewareForShape,
  coursewareWhiteboardHref,
  getCourseware,
  prepareCoursewareBoard,
} from './core/courseware';
import {
  arrangeGeneratedResults,
  isTextMaterial,
  MATERIAL_FILE_LIMIT,
  textMaterialProps,
} from './core/materials';
import {
  DOCUMENT_LIMITS,
  adoptFrameContents,
  alignShapes,
  createDocument,
  createId,
  createShape,
  detachShapeBindings,
  duplicateShapes,
  getSelectionBounds,
  getShapeBounds,
  hitTest,
  migrateLegacyShapes,
  resizeShapes,
  rotateShapes,
  scaleShapes,
  scaleShapesFromHandle,
  screenToWorld,
  selectionClosure,
  selectionHasResizableCard,
  translateShapes,
  validateDocument,
  zoomAt,
} from './core/model';
import {
  downloadBlob,
  exportBoardImage,
  exportBoardJSON,
  importBoardJSON,
  wrapExportText,
} from './core/export';
import { getAsset, loadBoard, putAsset, saveBoard } from './core/storage';
import { useBoardHistory } from './core/useBoardHistory';
import {
  CARD_TYPES,
  DEFAULT_STYLE,
  SHAPE_LABELS,
  type Binding,
  type BoardDocument,
  type BoardShape,
  type Bounds,
  type Camera,
  type Point,
  type ShapeProps,
  type ShapeStyle,
  type ShapeType,
  type Tool,
} from './core/types';

type Gesture = {
  kind:
    | 'pan'
    | 'move'
    | 'resize'
    | 'rotate'
    | 'draw'
    | 'create'
    | 'marquee'
    | 'erase';
  before: BoardDocument;
  start: Point;
  screen: Point;
  ids: string[];
  bounds?: Bounds;
  handle?: string;
  uniformScale?: boolean;
  shapeId?: string;
  points?: Point[];
};
const COLORS = [
  '#18263c',
  '#175cff',
  '#e74c3c',
  '#16a085',
  '#8e44ad',
  '#f0a328',
  '#ffffff',
];
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const SELECTION_MIME = 'oneworker-whiteboard-selection';

function activePage(doc: BoardDocument) {
  return doc.pages.find((p) => p.id === doc.currentPageId) || doc.pages[0];
}
function withShapes(doc: BoardDocument, shapes: BoardShape[]) {
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === doc.currentPageId ? { ...p, shapes } : p
    ),
  };
}
function withCamera(doc: BoardDocument, camera: Camera) {
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === doc.currentPageId ? { ...p, camera } : p
    ),
  };
}
function typing(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input,textarea,select,[contenteditable="true"],[data-board-interactive]:not([data-board-interactive="false"])'
      )
    )
  );
}
function boxFrom(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}
function contained(outer: Bounds, inner: Bounds) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
function overlaps(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
  );
}
function safeURL(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
function expandTextShape(shape: BoardShape): BoardShape {
  if (
    !['text', 'note'].includes(shape.type) ||
    typeof shape.props.text !== 'string'
  )
    return shape;
  const horizontalPadding = shape.type === 'note' ? 36 : 16;
  const verticalPadding = shape.type === 'note' ? 36 : 12;
  const lineHeight = shape.style.fontSize * 1.4;
  const lineCount = wrapExportText(
    shape.props.text,
    Math.max(1, shape.w - horizontalPadding),
    shape.style.fontSize,
    Math.floor(DOCUMENT_LIMITS.dimension / lineHeight)
  ).length;
  const height = Math.min(
    DOCUMENT_LIMITS.dimension,
    Math.ceil(lineCount * lineHeight + verticalPadding)
  );
  return height > shape.h ? { ...shape, h: height } : shape;
}
function withoutShapes(shapes: BoardShape[], ids: Set<string>) {
  return shapes
    .filter((s) => !ids.has(s.id))
    .map((s) => ({
      ...detachShapeBindings(s, shapes, ids),
      parentId: s.parentId && ids.has(s.parentId) ? undefined : s.parentId,
    }));
}

function URLField({
  value,
  onSave,
}: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(value);
  }, [value]);
  function save() {
    const url = safeURL(draft.trim());
    if (!draft.trim() || url) {
      setError('');
      onSave(url);
    } else setError('请输入完整的 http:// 或 https:// 地址');
  }
  return (
    <>
      <input
        aria-label="网页地址"
        value={draft}
        placeholder="https://"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
      />
      {error && <small className="owb-error-text">{error}</small>}
    </>
  );
}

export default function CanvasWorkspace({
  onOpenLesson,
}: { onOpenLesson: () => void }) {
  const locale = useLocale();
  const history = useBoardHistory();
  const {
    document: doc,
    current,
    commit: rawCommit,
    preview,
    reset,
    undo: rawUndo,
    redo: rawRedo,
  } = history;
  const page = activePage(doc);
  const shapes = page.shapes;
  const camera = page.camera;
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{
    distance: number;
    camera: Camera;
    point: Point;
  } | null>(null);
  const clipboard = useRef<BoardShape[]>([]);
  const assetUrls = useRef<Record<string, string>>({});
  const textBefore = useRef<BoardDocument | null>(null);
  const editingRef = useRef<string | null>(null);
  const documentEpoch = useRef(0);
  const [renderEpoch, setRenderEpoch] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const selected = shapes.filter((s) => selection.includes(s.id));
  const single = selected.length === 1 ? selected[0] : null;
  const bounds = getSelectionBounds(selected, shapes);
  const [tool, setTool] = useState<Tool>('select');
  const [style, setStyle] = useState<ShapeStyle>({ ...DEFAULT_STYLE });
  const [ready, setReady] = useState(false);
  const [storageKey, setStorageKey] = useState('');
  const [saveState, setSaveState] = useState('正在读取…');
  const [storageError, setStorageError] = useState('');
  const [assetVersion, setAssetVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [interactiveId, setInteractiveId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [snap, setSnap] = useState(true);
  const [menu, setMenu] = useState<
    'document' | 'insert' | 'export' | 'pages' | 'help' | null
  >(null);
  const [inspector, setInspector] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [drawToolsOpen, setDrawToolsOpen] = useState(false);
  const [articlePickerPageKey, setArticlePickerPageKey] = useState<
    string | null
  >(null);
  const articlePageKey = `${doc.id}:${page.id}:${renderEpoch}`;
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<Point | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    setArticlePickerPageKey((key) =>
      key === articlePageKey ? key : null
    );
  }, [articlePageKey]);

  function commit(next: BoardDocument, before?: BoardDocument) {
    const pending = gesture.current;
    if (pending) {
      gesture.current = null;
      pinch.current = null;
      pointers.current.clear();
      setMarquee(null);
      setGuides({});
    }
    rawCommit(next, before || pending?.before);
  }
  function undo() {
    if (!history.canUndo) return;
    cancelGesture();
    setRenderEpoch(++documentEpoch.current);
    rawUndo();
  }
  function redo() {
    if (!history.canRedo) return;
    cancelGesture();
    setRenderEpoch(++documentEpoch.current);
    rawRedo();
  }

  function leaveCanvas(next: () => void) {
    if (!ready) return;
    if (storageError) {
      notify('白板未保存，请先导出备份。');
      return;
    }
    void saveBoard(storageKey, current.current)
      .then(next)
      .catch((error: unknown) => notify(error instanceof Error ? error.message : '白板暂时无法保存。'));
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ w: element.clientWidth, h: element.clientHeight })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams(window.location.search);
    const courseware = getCourseware(query.get('courseware'));
    const identity = [
      query.get('studentId') || 'anonymous',
      query.get('lessonId') || 'own-whiteboard-demo',
    ]
      .map(encodeURIComponent)
      .join(':');
    const boardName = query.get('board');
    const key = courseware
      ? `oneworker-board-v2:courseware:${courseware.id}`
      : `oneworker-board-v2:${boardName ? encodeURIComponent(boardName) : identity}`;
    setStorageKey(key);
    void (async () => {
      try {
        let stored = await loadBoard(key);
        if (!stored && !courseware && !query.has('board')) {
          const legacy = localStorage.getItem(
            `dlgzz-own-whiteboard-v1:${identity}`
          );
          if (legacy) {
            stored = migrateLegacyShapes(JSON.parse(legacy));
            notify('已复制旧白板内容到新版，原始课堂数据仍保留。');
          }
        }
        if (!cancelled) {
          const document = stored || createDocument();
          if (courseware) {
            const viewport = surface.current?.getBoundingClientRect();
            const lesson = prepareCoursewareBoard(
              stored ? document : { ...document, name: `${courseware.title} · 体验白板` },
              courseware,
              { w: viewport?.width || 1000, h: viewport?.height || 800 }
            );
            reset(lesson.document);
            setInteractiveId(lesson.shapeId);
          } else reset(document);
          setReady(true);
          setSaveState('已读取');
        }
      } catch (error) {
        if (!cancelled) {
          setStorageError(
            `读取失败，已暂停自动保存以保护原数据：${error instanceof Error ? error.message : String(error)}`
          );
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify, reset]);
  useEffect(() => {
    if (!ready || !storageKey || storageError || gesture.current) return;
    setSaveState('保存中…');
    const timer = setTimeout(() => {
      void saveBoard(storageKey, doc)
        .then(() => setSaveState('已保存到此浏览器'))
        .catch((error) => {
          setStorageError(`保存失败，请导出备份：${error.message}`);
          setSaveState('未保存');
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [doc, ready, storageKey, storageError]);
  useEffect(() => {
    if (!ready) return;
    const ids = [
      ...new Set(
        doc.pages.flatMap((p) =>
          p.shapes
            .map((s) => s.props.assetId)
            .filter((id): id is string => Boolean(id))
        )
      ),
    ];
    let cancelled = false;
    void Promise.all(
      ids
        .filter((id) => !assetUrls.current[id])
        .map(async (id) => {
          try {
            const asset = await getAsset(id);
            if (asset && !cancelled) {
              assetUrls.current[id] = URL.createObjectURL(asset.blob);
              setAssetVersion((v) => v + 1);
            } else if (!asset && !cancelled)
              notify('部分媒体资源缺失，请重新导入原文件或完整 JSON 备份。');
          } catch (error) {
            if (!cancelled) notify(`媒体读取失败：${String(error)}`);
          }
        })
    );
    return () => {
      cancelled = true;
    };
  }, [doc.pages, ready, notify]);
  useEffect(
    () => () => {
      for (const url of Object.values(assetUrls.current))
        URL.revokeObjectURL(url);
    },
    []
  );

  function updateShapes(next: BoardShape[], before?: BoardDocument) {
    commit(withShapes(current.current, next.map(expandTextShape)), before);
  }
  function localPoint(clientX: number, clientY: number): Point {
    const r = surface.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  function currentPoint(clientX: number, clientY: number) {
    return screenToWorld(
      localPoint(clientX, clientY),
      activePage(current.current).camera
    );
  }
  function finishEditing() {
    if (textBefore.current) commit({ ...current.current }, textBefore.current);
    textBefore.current = null;
    editingRef.current = null;
    setEditing(null);
  }
  function patchProps(
    id: string,
    props: Partial<ShapeProps>,
    expectedEpoch?: number
  ) {
    if (expectedEpoch !== undefined && expectedEpoch !== documentEpoch.current)
      return;
    const next = withShapes(
      current.current,
      activePage(current.current).shapes.map((s) =>
        s.id === id && !s.locked
          ? expandTextShape({ ...s, props: { ...s.props, ...props } })
          : s
      )
    );
    if (editingRef.current === id) preview(next);
    else commit(next);
  }
  function insertShape(
    type: ShapeType,
    props: ShapeProps = {},
    dimensions?: { w: number; h: number }
  ) {
    const d = current.current;
    const p = activePage(d);
    const center = screenToWorld({ x: size.w / 2, y: size.h / 2 }, p.camera);
    const s = createShape(type, center.x, center.y, props);
    if (dimensions) {
      s.w = dimensions.w;
      s.h = dimensions.h;
    }
    s.x -= s.w / 2;
    s.y -= s.h / 2;
    s.style = {
      ...s.style,
      ...style,
      ...(type === 'note' ? { fill: '#fff6bc' } : {}),
    };
    commit(withShapes(d, [...p.shapes, expandTextShape(s)]));
    setSelection([s.id]);
    setTool('select');
    setMenu(null);
    if (CARD_TYPES.includes(type) || ['bookmark', 'embed'].includes(type)) {
      setInteractiveId(s.id);
      setInspector(true);
    }
    return s.id;
  }
  function toggleArticlePicker() {
    cancelGesture();
    finishEditing();
    setArticlePickerPageKey((key) =>
      key === articlePageKey ? null : articlePageKey
    );
    setInspector(false);
    setMenu(null);
    setTool('select');
    setInteractiveId(null);
  }
  function insertArticle(article: ArticleOption) {
    const d = current.current;
    const key = `${d.id}:${activePage(d).id}:${documentEpoch.current}`;
    if (articlePickerPageKey !== key) {
      setArticlePickerPageKey(null);
      notify('画布已经切换，请重新选择文章。');
      return;
    }
    insertShape('blog_post', article, { w: 360, h: 360 });
    setInspector(false);
    setArticlePickerPageKey(null);
  }
  function openAssistant() {
    finishEditing();
    setAssistantOpen(true);
    setInspector(false);
    setMenu(null);
    setTool('select');
    setInteractiveId(null);
  }
  function applyAssistant(request: AssistantApplyRequest) {
    const d = current.current;
    const p = activePage(d);
    if (
      request.pageKey !== `${d.id}:${p.id}` ||
      renderEpoch !== documentEpoch.current
    )
      throw new Error('画布已经切换，请回到原页面重新确认。');
    if (p.assistantAppliedRequests?.includes(request.requestId))
      throw new Error('这次结果已应用，请使用撤销 / 重做，不要重复插入。');
    const result = applyAssistantPlan(
      request.plan,
      p.shapes,
      request.anchorPoint
    );
    const count = result.createdIds.length + result.updatedIds.length;
    if (!count)
      throw new Error(
        '目标内容已变化、被锁定或操作无效，未修改画布。请重新生成。'
      );
    // Validate the full document before a single undoable history transaction.
    const arranged = arrangeGeneratedResults(
      result.shapes.map(expandTextShape),
      result.createdIds
    );
    let next = withShapes(d, arranged);
    next = validateDocument({
      ...next,
      pages: next.pages.map((value) =>
        value.id === p.id
          ? {
              ...value,
              assistantAppliedRequests: [
                ...(value.assistantAppliedRequests || []),
                request.requestId,
              ],
            }
          : value
      ),
    });
    const firstNew = arranged.find(
      (shape) => result.createdIds.includes(shape.id) && shape.type !== 'arrow'
    );
    if (firstNew) {
      const focus = getShapeBounds(firstNew, arranged);
      const usableWidth = Math.max(240, size.w - 80);
      const usableHeight = Math.max(240, size.h - 170);
      const zoom = Math.max(
        ZOOM_MIN,
        Math.min(
          p.camera.zoom,
          usableWidth / (focus.w + 48),
          usableHeight / (focus.h + 48)
        )
      );
      next = withCamera(next, {
        zoom,
        x: size.w / 2 - (focus.x + focus.w / 2) * zoom,
        y: usableHeight / 2 + 20 - (focus.y + focus.h / 2) * zoom,
      });
    }
    commit(next);
    // Results take the stage; the Dock reopens the same persisted conversation.
    setAssistantOpen(false);
    setSelection(
      result.createdIds.length ? result.createdIds : result.updatedIds
    );
    setInteractiveId(null);
    notify(
      `已应用 ${count} 项修改，可一次撤销${result.skipped ? `；跳过 ${result.skipped} 项失效操作` : ''}。双击卡片即可使用。`
    );
  }
  function insertSavedTool(shape: BoardShape) {
    const d = current.current;
    const p = activePage(d);
    const center = screenToWorld({ x: size.w / 2, y: size.h / 2 }, p.camera);
    const source = getSelectionBounds(
      p.shapes.filter((s) => selection.includes(s.id)),
      p.shapes
    );
    const placed = {
      ...shape,
      x: source ? source.x + source.w + 48 : center.x - shape.w / 2,
      y: source ? source.y : center.y - shape.h / 2,
    };
    const zoom = Math.max(
      ZOOM_MIN,
      Math.min(
        p.camera.zoom,
        (size.w - 100) / (placed.w + 48),
        (size.h - 180) / (placed.h + 48)
      )
    );
    commit(
      validateDocument(
        withCamera(withShapes(d, [...p.shapes, placed]), {
          zoom,
          x: size.w / 2 - (placed.x + placed.w / 2) * zoom,
          y: (size.h - 160) / 2 - (placed.y + placed.h / 2) * zoom,
        })
      )
    );
    setSelection([placed.id]);
    setTool('select');
    setInteractiveId(placed.id);
    setInspector(false);
    setAssistantOpen(false);
    notify('已把工具放到白板，可以直接使用或交给 AI 继续修改。');
  }
  function removeSelected() {
    const p = activePage(current.current);
    const ids = new Set(
      selectionClosure(p.shapes, selection).filter(
        (id) => !p.shapes.find((s) => s.id === id)?.locked
      )
    );
    updateShapes(withoutShapes(p.shapes, ids));
    setSelection([]);
    setInteractiveId(null);
    setContext(null);
  }
  function duplicate() {
    const p = activePage(current.current);
    const result = duplicateShapes(
      p.shapes,
      selectionClosure(p.shapes, selection)
    );
    updateShapes(result.shapes);
    setSelection(result.ids);
    setContext(null);
  }
  function group(ungroup = false) {
    const p = activePage(current.current);
    const ids = selectionClosure(p.shapes, selection);
    const groupId = createId('group');
    if (!ungroup && ids.length < 2) return;
    updateShapes(
      p.shapes.map((s) =>
        ids.includes(s.id) && !s.locked
          ? { ...s, groupId: ungroup ? undefined : groupId }
          : s
      )
    );
  }
  function setLocked() {
    updateShapes(
      activePage(current.current).shapes.map((s) =>
        selection.includes(s.id)
          ? { ...s, locked: !selected.every((v) => v.locked) }
          : s
      )
    );
  }
  function order(front: boolean) {
    const p = activePage(current.current);
    const moving = p.shapes.filter(
      (s) => selection.includes(s.id) && !s.locked
    );
    const rest = p.shapes.filter((s) => !moving.includes(s));
    updateShapes(front ? [...rest, ...moving] : [...moving, ...rest]);
  }
  function changeStyle(patch: Partial<ShapeStyle>) {
    setStyle((s) => ({ ...s, ...patch }));
    updateShapes(
      activePage(current.current).shapes.map((s) =>
        selection.includes(s.id) && !s.locked
          ? { ...s, style: { ...s.style, ...patch } }
          : s
      )
    );
  }
  function changeGeometry(
    key: 'x' | 'y' | 'w' | 'h' | 'rotation',
    value: number
  ) {
    if (
      !single ||
      single.locked ||
      !Number.isFinite(value) ||
      Math.abs(value) >= 1000000
    )
      return;
    const all = activePage(current.current).shapes;
    const shape = all.find((s) => s.id === single.id);
    if (!shape) return;
    const ids = selectionClosure(all, [shape.id]);
    if (key === 'x' || key === 'y') {
      updateShapes(
        translateShapes(
          all,
          ids,
          key === 'x' ? value - shape.x : 0,
          key === 'y' ? value - shape.y : 0
        )
      );
    } else if (key === 'rotation') {
      updateShapes(
        rotateShapes(all, ids, value - shape.rotation, {
          x: shape.x + shape.w / 2,
          y: shape.y + shape.h / 2,
        })
      );
    } else {
      const box = getSelectionBounds(
        all.filter((s) => ids.includes(s.id)),
        all
      );
      if (!box) return;
      if (selectionHasResizableCard(all, ids)) {
        updateShapes(
          scaleShapes(all, ids, box, Math.max(16, value) / shape[key])
        );
        return;
      }
      const factor = Math.max(16, value) / Math.max(1, shape[key]);
      updateShapes(
        resizeShapes(all, ids, box, {
          ...box,
          w: key === 'w' ? box.w * factor : box.w,
          h: key === 'h' ? box.h * factor : box.h,
        })
      );
    }
  }
  function setZoom(zoom: number, anchor = { x: size.w / 2, y: size.h / 2 }) {
    const d = current.current;
    preview(
      withCamera(
        d,
        zoomAt(
          activePage(d).camera,
          anchor,
          Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
        )
      )
    );
  }
  function fit() {
    const d = current.current;
    const p = activePage(d);
    const b = getSelectionBounds(p.shapes, p.shapes);
    if (!b) {
      preview(withCamera(d, { x: 0, y: 0, zoom: 1 }));
      return;
    }
    const zoom = Math.max(
      ZOOM_MIN,
      Math.min(
        2,
        (size.w - 160) / Math.max(b.w, 1),
        (size.h - 150) / Math.max(b.h, 1)
      )
    );
    preview(
      withCamera(d, {
        zoom,
        x: size.w / 2 - (b.x + b.w / 2) * zoom,
        y: size.h / 2 - (b.y + b.h / 2) * zoom,
      })
    );
  }
  async function copySelection(cut = false) {
    const p = activePage(current.current);
    const ids = new Set(selectionClosure(p.shapes, selection));
    const excluded = new Set(
      p.shapes.filter((s) => !ids.has(s.id)).map((s) => s.id)
    );
    clipboard.current = p.shapes
      .filter((s) => ids.has(s.id))
      .map((s) => ({
        ...detachShapeBindings(s, p.shapes, excluded),
        parentId: s.parentId && ids.has(s.parentId) ? s.parentId : undefined,
      }));
    if (!clipboard.current.length) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ format: SELECTION_MIME, shapes: clipboard.current })
      );
    } catch {
      /* Internal clipboard remains available through the paste button. */
    }
    if (cut) removeSelected();
    else notify('已复制，使用粘贴按钮或 ⌘/Ctrl V');
  }
  function pasteShapes(items = clipboard.current) {
    if (!items.length) return;
    const temp = createDocument();
    temp.pages[0].shapes = items;
    const valid = validateDocument(temp);
    const result = duplicateShapes(
      valid.pages[0].shapes,
      items.map((s) => s.id)
    );
    const copies = result.shapes.filter((s) => result.ids.includes(s.id));
    updateShapes([...activePage(current.current).shapes, ...copies]);
    setSelection(result.ids);
  }
  async function addFiles(files: File[], point?: Point) {
    const targetDocumentId = current.current.id;
    const targetPage = activePage(current.current);
    const center =
      point ||
      screenToWorld(
        {
          x: size.w / 2,
          y: size.h / 2,
        },
        targetPage.camera
      );
    setBusy(true);
    try {
      let index = 0;
      for (const file of files.slice(0, 20)) {
        if (
          current.current.pages.reduce(
            (count, p) => count + p.shapes.length,
            0
          ) >= DOCUMENT_LIMITS.shapes
        )
          throw new Error(
            `白板已有 ${DOCUMENT_LIMITS.shapes} 个对象，请新建白板后再导入。`
          );
        if (isTextMaterial(file) && !file.type.startsWith('image/')) {
          if (file.size > MATERIAL_FILE_LIMIT) {
            notify(`未导入 ${file.name}：文本文件上限为 1 MB。`);
            continue;
          }
          const props = textMaterialProps(file.name, await file.text());
          const s = createShape(
            'ai_result',
            center.x + index * 40,
            center.y + index * 40,
            props
          );
          if (!point) {
            s.x -= s.w / 2;
            s.y -= s.h / 2;
          }
          if (
            current.current.id !== targetDocumentId ||
            !current.current.pages.some((p) => p.id === targetPage.id)
          )
            break;
          commit(
            validateDocument({
              ...current.current,
              pages: current.current.pages.map((p) =>
                p.id === targetPage.id ? { ...p, shapes: [...p.shapes, s] } : p
              ),
            })
          );
          if (current.current.currentPageId === targetPage.id)
            setSelection([s.id]);
          notify(
            props.sourceTruncated
              ? `${file.name} 已导入前 10 万字，原文件未改动。`
              : `${file.name} 已作为材料导入，选中后可交给 AI。`
          );
          index++;
          continue;
        }
        if (!/^(image|video)\//.test(file.type)) {
          notify(
            `未导入 ${file.name}：支持图片、视频和文本 / Markdown / 代码文件；暂不解析 PDF、Word。`
          );
          continue;
        }
        const asset = await putAsset(file, file.name);
        const url = URL.createObjectURL(asset.blob);
        assetUrls.current[asset.id] = url;
        setAssetVersion((v) => v + 1);
        const s = createShape(
          file.type.startsWith('image/') ? 'image' : 'video_player',
          center.x + index * 24,
          center.y + index * 24,
          { assetId: asset.id, title: file.name }
        );
        if (file.type.startsWith('image/')) {
          const dimensions = await new Promise<{ w: number; h: number }>(
            (resolve) => {
              const img = new Image();
              img.onload = () =>
                resolve({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = () => resolve({ w: 320, h: 240 });
              img.src = url;
            }
          );
          const ratio = Math.min(1, 480 / dimensions.w, 400 / dimensions.h);
          s.w = dimensions.w * ratio;
          s.h = dimensions.h * ratio;
        }
        if (!point) {
          s.x -= s.w / 2;
          s.y -= s.h / 2;
        }
        if (
          current.current.id !== targetDocumentId ||
          !current.current.pages.some((p) => p.id === targetPage.id)
        ) {
          notify('导入目标页面已被删除，已停止添加媒体。');
          break;
        }
        commit(
          validateDocument({
            ...current.current,
            pages: current.current.pages.map((p) =>
              p.id === targetPage.id ? { ...p, shapes: [...p.shapes, s] } : p
            ),
          })
        );
        if (current.current.currentPageId === targetPage.id)
          setSelection([s.id]);
        index++;
      }
    } catch (error) {
      notify(
        `导入失败：${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  }
  async function importJSON(file: File) {
    setBusy(true);
    try {
      if (file.size > 96 * 1024 * 1024)
        throw new Error('JSON 备份超过 96 MB 上限');
      const imported = await importBoardJSON(await file.text());
      finishEditing();
      setRenderEpoch(++documentEpoch.current);
      commit(imported);
      setSelection([]);
      setStorageError('');
      notify('已导入完整白板，可撤销恢复导入前状态。');
    } catch (error) {
      notify(
        `无法导入：${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: 'json' | 'svg' | 'png' | 'jpeg' | 'webp') {
    setBusy(true);
    setMenu(null);
    try {
      const d = current.current;
      const blob =
        format === 'json'
          ? await exportBoardJSON(d)
          : await exportBoardImage(d, d.currentPageId, format);
      downloadBlob(
        blob,
        `${d.name.replace(/[\\/:*?"<>|]/g, '-') || '白板'}.${format}`
      );
      notify(
        format === 'json'
          ? '已导出含媒体的可编辑备份。'
          : '已导出当前页。动态卡片以摘要展示，完整内容保存在 JSON 中。'
      );
    } catch (error) {
      notify(
        `导出失败：${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  }
  function bindingAt(
    point: Point,
    all: BoardShape[],
    exclude: string
  ): Binding | undefined {
    const target = [...all]
      .reverse()
      .find(
        (s) =>
          s.id !== exclude &&
          !['arrow', 'line', 'draw', 'highlight', 'frame'].includes(s.type) &&
          hitTest(s, point, 10 / camera.zoom, all)
      );
    if (!target) return;
    const angle = (-target.rotation * Math.PI) / 180;
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    return {
      shapeId: target.id,
      anchor: {
        x: Math.max(
          0,
          Math.min(
            1,
            (dx * Math.cos(angle) - dy * Math.sin(angle) + target.w / 2) /
              target.w
          )
        ),
        y: Math.max(
          0,
          Math.min(
            1,
            (dx * Math.sin(angle) + dy * Math.cos(angle) + target.h / 2) /
              target.h
          )
        ),
      },
    };
  }

  function pointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!ready || e.button === 2 || (typing(e.target) && !space.current))
      return;
    const target = e.target as Element;
    if (
      target.closest('.owb-card-body') &&
      interactiveId &&
      !space.current &&
      tool === 'select'
    )
      return;
    finishEditing();
    setContext(null);
    setMenu(null);
    const screen = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, screen);
    surface.current!.setPointerCapture(e.pointerId);
    const d = current.current;
    const p = activePage(d);
    const world = screenToWorld(screen, p.camera);
    if (pointers.current.size === 2) {
      if (gesture.current) preview(gesture.current.before);
      gesture.current = null;
      setMarquee(null);
      setGuides({});
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        camera: activePage(current.current).camera,
        point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      return;
    }
    if (space.current || tool === 'hand' || e.button === 1) {
      gesture.current = {
        kind: 'pan',
        before: d,
        start: world,
        screen,
        ids: [],
      };
      return;
    }
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle;
    if (handle && bounds && selected.some((s) => !s.locked)) {
      const ids = selectionClosure(p.shapes, selection).filter(
        (id) => !p.shapes.find((s) => s.id === id)?.locked
      );
      gesture.current = {
        kind: handle === 'rotate' ? 'rotate' : 'resize',
        before: d,
        start: world,
        screen,
        ids,
        bounds,
        handle,
        uniformScale:
          handle !== 'rotate' && selectionHasResizableCard(p.shapes, ids),
      };
      return;
    }
    if (tool === 'eraser') {
      gesture.current = {
        kind: 'erase',
        before: d,
        start: world,
        screen,
        ids: [],
      };
      preview(
        withShapes(
          d,
          withoutShapes(
            p.shapes,
            new Set(
              p.shapes
                .filter(
                  (s) =>
                    !s.locked && hitTest(s, world, 6 / camera.zoom, p.shapes)
                )
                .map((s) => s.id)
            )
          )
        )
      );
      return;
    }
    if (tool !== 'select') {
      const shape = createShape(tool as ShapeType, world.x, world.y);
      shape.style = {
        ...style,
        ...(tool === 'highlight'
          ? { strokeWidth: Math.max(12, style.strokeWidth * 5) }
          : {}),
        ...(tool === 'note' ? { fill: '#fff6bc' } : {}),
      };
      const isDraw = tool === 'draw' || tool === 'highlight';
      if (isDraw || tool === 'arrow' || tool === 'line')
        shape.points = [
          { x: 0, y: 0 },
          { x: 0.1, y: 0.1 },
        ];
      if (tool === 'arrow')
        shape.startBinding = bindingAt(world, p.shapes, shape.id);
      preview(withShapes(d, [...p.shapes, shape]));
      gesture.current = {
        kind: isDraw ? 'draw' : 'create',
        before: d,
        start: world,
        screen,
        ids: [shape.id],
        shapeId: shape.id,
        points: [world],
      };
      setSelection([shape.id]);
      return;
    }
    const targetId =
      target.closest<HTMLElement>('[data-shape-id]')?.dataset.shapeId;
    const found = targetId
      ? p.shapes.find((s) => s.id === targetId)
      : [...p.shapes]
          .reverse()
          .find((s) => hitTest(s, world, 5 / p.camera.zoom, p.shapes));
    if (found) {
      const hitIds = selectionClosure(p.shapes, [found.id]);
      const ids = e.shiftKey
        ? selection.includes(found.id)
          ? selection.filter((id) => !hitIds.includes(id))
          : [...new Set([...selection, ...hitIds])]
        : selection.includes(found.id)
          ? selection
          : hitIds;
      setSelection(ids);
      setInteractiveId(null);
      const movingIds = selectionClosure(p.shapes, ids).filter(
        (id) => !p.shapes.find((s) => s.id === id)?.locked
      );
      gesture.current = {
        kind: 'move',
        before: d,
        start: world,
        screen,
        ids: movingIds,
        bounds:
          getSelectionBounds(
            p.shapes.filter((s) => movingIds.includes(s.id)),
            p.shapes
          ) || undefined,
      };
    } else {
      if (!e.shiftKey) setSelection([]);
      setInteractiveId(null);
      gesture.current = {
        kind: 'marquee',
        before: d,
        start: world,
        screen,
        ids: e.shiftKey ? selection : [],
      };
      setMarquee({ ...world, w: 0, h: 0 });
    }
  }
  function pointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const screen = localPoint(e.clientX, e.clientY);
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, screen);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const initial = pinch.current;
      const next = zoomAt(
        initial.camera,
        initial.point,
        Math.max(
          ZOOM_MIN,
          Math.min(
            ZOOM_MAX,
            (initial.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              Math.max(1, initial.distance)
          )
        )
      );
      next.x += center.x - initial.point.x;
      next.y += center.y - initial.point.y;
      preview(withCamera(current.current, next));
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = activePage(g.before);
    const world = screenToWorld(screen, p.camera);
    let dx = world.x - g.start.x;
    let dy = world.y - g.start.y;
    if (g.kind === 'pan') {
      preview(
        withCamera(g.before, {
          ...p.camera,
          x: p.camera.x + screen.x - g.screen.x,
          y: p.camera.y + screen.y - g.screen.y,
        })
      );
      return;
    }
    if (g.kind === 'marquee') {
      const box = boxFrom(g.start, world);
      setMarquee(box);
      const hits = p.shapes
        .filter((s) =>
          s.type === 'frame'
            ? contained(box, getShapeBounds(s))
            : overlaps(box, getShapeBounds(s, p.shapes))
        )
        .map((s) => s.id);
      setSelection([
        ...new Set([...g.ids, ...selectionClosure(p.shapes, hits)]),
      ]);
      return;
    }
    if (g.kind === 'erase') {
      const all = activePage(current.current).shapes;
      preview(
        withShapes(
          current.current,
          withoutShapes(
            all,
            new Set(
              all
                .filter(
                  (s) => !s.locked && hitTest(s, world, 8 / p.camera.zoom, all)
                )
                .map((s) => s.id)
            )
          )
        )
      );
      return;
    }
    if (g.kind === 'move') {
      const guide: { x?: number; y?: number } = {};
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (snap && !e.altKey && g.bounds) {
        const b = g.bounds;
        const movingX = [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx];
        const movingY = [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy];
        let bestX = 6 / p.camera.zoom;
        let bestY = bestX;
        let adjustX = 0;
        let adjustY = 0;
        for (const other of p.shapes.filter((s) => !g.ids.includes(s.id))) {
          const ob = getShapeBounds(other, p.shapes);
          for (const x of [ob.x, ob.x + ob.w / 2, ob.x + ob.w])
            for (const mx of movingX)
              if (Math.abs(x - mx) < bestX) {
                bestX = Math.abs(x - mx);
                adjustX = x - mx;
                guide.x = x;
              }
          for (const y of [ob.y, ob.y + ob.h / 2, ob.y + ob.h])
            for (const my of movingY)
              if (Math.abs(y - my) < bestY) {
                bestY = Math.abs(y - my);
                adjustY = y - my;
                guide.y = y;
              }
        }
        dx += adjustX;
        dy += adjustY;
      }
      setGuides(guide);
      preview(withShapes(g.before, translateShapes(p.shapes, g.ids, dx, dy)));
      return;
    }
    if (g.kind === 'resize' && g.bounds) {
      const b = g.bounds;
      const h = g.handle!;
      if (g.uniformScale) {
        preview(
          withShapes(
            g.before,
            scaleShapesFromHandle(p.shapes, g.ids, b, h, { x: dx, y: dy })
          )
        );
        return;
      }
      let left = b.x,
        top = b.y,
        right = b.x + b.w,
        bottom = b.y + b.h;
      if (h.includes('w')) left = Math.min(right - 16, left + dx);
      if (h.includes('e')) right = Math.max(left + 16, right + dx);
      if (h.includes('n')) top = Math.min(bottom - 16, top + dy);
      if (h.includes('s')) bottom = Math.max(top + 16, bottom + dy);
      if (e.shiftKey) {
        const ratio = b.w / Math.max(1, b.h);
        bottom = top + (right - left) / ratio;
      }
      preview(
        withShapes(
          g.before,
          resizeShapes(p.shapes, g.ids, b, {
            x: left,
            y: top,
            w: right - left,
            h: bottom - top,
          })
        )
      );
      return;
    }
    if (g.kind === 'rotate' && g.bounds) {
      const center = {
        x: g.bounds.x + g.bounds.w / 2,
        y: g.bounds.y + g.bounds.h / 2,
      };
      let angle =
        ((Math.atan2(world.y - center.y, world.x - center.x) -
          Math.atan2(g.start.y - center.y, g.start.x - center.x)) *
          180) /
        Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      preview(
        withShapes(g.before, rotateShapes(p.shapes, g.ids, angle, center))
      );
      return;
    }
    const draft = activePage(current.current).shapes.find(
      (s) => s.id === g.shapeId
    );
    if (!draft) return;
    let next = { ...draft };
    if (g.kind === 'draw') {
      const previous = g.points!.at(-1)!;
      if (
        Math.hypot(world.x - previous.x, world.y - previous.y) <
        1 / p.camera.zoom
      )
        return;
      if (g.points!.length >= 10000) return;
      g.points!.push({ ...world, pressure: e.pressure });
      const xs = g.points!.map((v) => v.x),
        ys = g.points!.map((v) => v.y);
      const x = Math.min(...xs),
        y = Math.min(...ys);
      next = {
        ...next,
        x,
        y,
        w: Math.max(1, Math.max(...xs) - x),
        h: Math.max(1, Math.max(...ys) - y),
        points: g.points!.map((v) => ({ ...v, x: v.x - x, y: v.y - y })),
      };
    } else {
      if (e.shiftKey) {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * side;
        dy = Math.sign(dy || 1) * side;
      }
      const end = { x: g.start.x + dx, y: g.start.y + dy };
      const b = boxFrom(g.start, end);
      next = { ...next, ...b, w: Math.max(1, b.w), h: Math.max(1, b.h) };
      if (next.type === 'line' || next.type === 'arrow') {
        next.points = [
          { x: g.start.x - b.x, y: g.start.y - b.y },
          { x: end.x - b.x, y: end.y - b.y },
        ];
        if (next.type === 'arrow')
          next.endBinding = bindingAt(end, p.shapes, next.id);
      }
    }
    preview(
      withShapes(
        current.current,
        activePage(current.current).shapes.map((s) =>
          s.id === next.id ? next : s
        )
      )
    );
  }
  function pointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (surface.current?.hasPointerCapture(e.pointerId))
      surface.current.releasePointerCapture(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      gesture.current = null;
      preview({ ...current.current });
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setGuides({});
    if (!g || g.kind === 'marquee') return;
    if (g.kind === 'pan') {
      preview({ ...current.current });
      return;
    }
    let next = current.current;
    let ps = activePage(next).shapes;
    if (g.kind === 'create') {
      const created = ps.find((s) => s.id === g.shapeId);
      if (
        created &&
        Math.hypot(
          e.clientX -
            surface.current!.getBoundingClientRect().left -
            g.screen.x,
          e.clientY - surface.current!.getBoundingClientRect().top - g.screen.y
        ) < 4
      ) {
        const defaults = createShape(created.type, g.start.x, g.start.y);
        ps = ps.map((s) =>
          s.id === created.id
            ? { ...s, w: defaults.w, h: defaults.h, points: defaults.points }
            : s
        );
      }
    }
    if (g.kind === 'move' || g.kind === 'create') {
      ps = ps.map((s) => {
        if (!g.ids.includes(s.id) || s.type === 'frame') return s;
        if (s.parentId && g.ids.includes(s.parentId)) return s;
        const parent = [...ps]
          .reverse()
          .find(
            (frame) =>
              frame.type === 'frame' &&
              !g.ids.includes(frame.id) &&
              contained(getShapeBounds(frame), getShapeBounds(s))
          );
        return { ...s, parentId: parent?.id };
      });
      const frame = ps.find((s) => s.id === g.shapeId && s.type === 'frame');
      if (frame) ps = adoptFrameContents(ps, frame.id);
    }
    next = withShapes(next, ps);
    commit(next, g.before);
    if (g.kind === 'create') {
      setTool('select');
      const created = ps.find((s) => s.id === g.shapeId);
      if (created && ['text', 'note'].includes(created.type)) {
        textBefore.current = next;
        editingRef.current = created.id;
        setEditing(created.id);
      }
    }
  }
  function cancelGesture() {
    const g = gesture.current;
    gesture.current = null;
    if (g) preview(g.before);
    pointers.current.clear();
    pinch.current = null;
    setMarquee(null);
    setGuides({});
  }

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      if (
        typing(e.target) ||
        (e.target instanceof Element &&
          e.target.closest('.owb-card-body') &&
          interactiveId)
      )
        return;
      if (gesture.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const d = current.current;
      const c = activePage(d).camera;
      if (e.ctrlKey || e.metaKey || e.altKey)
        setZoom(
          c.zoom * Math.exp(-e.deltaY * 0.008),
          localPoint(e.clientX, e.clientY)
        );
      else
        preview(withCamera(d, { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [interactiveId]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
        surface.current?.classList.add('is-panning');
      }
      if (e.key === 'Escape') {
        cancelGesture();
        finishEditing();
        setInteractiveId(null);
        setMenu(null);
        setContext(null);
        setTool('select');
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        setSelection([]);
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelection(activePage(current.current).shapes.map((s) => s.id));
        return;
      }
      if (mod && ['c', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        void copySelection(e.key.toLowerCase() === 'x');
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        group(e.shiftKey);
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void exportFile('json');
        return;
      }
      if (['Delete', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (e.key.startsWith('Arrow') && selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        updateShapes(
          translateShapes(
            activePage(current.current).shapes,
            selectionClosure(activePage(current.current).shapes, selection),
            e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
            e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
          )
        );
        return;
      }
      if (mod) return;
      if (e.key === '0') {
        fit();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        setZoom(activePage(current.current).camera.zoom * 1.2);
        return;
      }
      if (e.key === '-') {
        setZoom(activePage(current.current).camera.zoom / 1.2);
        return;
      }
      const shortcuts: Record<string, Tool> = {
        v: 'select',
        h: 'hand',
        p: 'draw',
        r: 'rectangle',
        o: 'ellipse',
        t: 'text',
        n: 'note',
        a: 'arrow',
        e: 'eraser',
        l: 'line',
        f: 'frame',
      };
      if (shortcuts[e.key.toLowerCase()]) {
        setTool(shortcuts[e.key.toLowerCase()]);
        setInteractiveId(null);
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        surface.current?.classList.remove('is-panning');
      }
    };
    const blur = () => {
      space.current = false;
      cancelGesture();
      surface.current?.classList.remove('is-panning');
    };
    const paste = (e: ClipboardEvent) => {
      if (typing(e.target)) return;
      if (e.clipboardData?.files.length) {
        e.preventDefault();
        void addFiles(Array.from(e.clipboardData.files));
        return;
      }
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!text) {
        if (clipboard.current.length) {
          e.preventDefault();
          pasteShapes();
        }
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed.format === SELECTION_MIME) {
          e.preventDefault();
          pasteShapes(parsed.shapes);
          return;
        }
      } catch {
        /* Plain text. */
      }
      e.preventDefault();
      const url = safeURL(text.trim());
      if (url) insertShape('bookmark', { url, title: new URL(url).hostname });
      else insertShape('text', { text: text.slice(0, 100000) });
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('paste', paste);
    };
  });

  function changePage(id: string) {
    cancelGesture();
    finishEditing();
    preview({ ...current.current, currentPageId: id });
    setSelection([]);
    setInteractiveId(null);
    setMenu(null);
  }
  function addPage() {
    const d = current.current;
    if (d.pages.length >= DOCUMENT_LIMITS.pages) {
      notify(
        `每份白板最多 ${DOCUMENT_LIMITS.pages} 页，请导出备份后创建另一份白板。`
      );
      return;
    }
    const id = createId('page');
    commit({
      ...d,
      pages: [
        ...d.pages,
        {
          id,
          name: `画布 ${d.pages.length + 1}`,
          shapes: [],
          camera: { x: 0, y: 0, zoom: 1 },
        },
      ],
      currentPageId: id,
    });
    setSelection([]);
  }
  const visible = {
    x: -camera.x / camera.zoom - 200,
    y: -camera.y / camera.zoom - 200,
    w: (size.w + 400) / camera.zoom,
    h: (size.h + 400) / camera.zoom,
  };
  const baseGrid = 24 * camera.zoom;
  const gridSize =
    baseGrid < 12
      ? baseGrid * 2 ** Math.ceil(Math.log2(12 / baseGrid))
      : baseGrid;
  const handles = [
    ['nw', 0, 0],
    ['n', 50, 0],
    ['ne', 100, 0],
    ['e', 100, 50],
    ['se', 100, 100],
    ['s', 50, 100],
    ['sw', 0, 100],
    ['w', 0, 50],
  ] as const;

  return (
    <div
      className={`owb${assistantOpen ? ' owb-assistant-open' : ''}`}
      data-testid="own-whiteboard-v2"
      data-ready={ready}
    >
      <header className="owb-header" aria-label="白板菜单">
        <button
          type="button"
          aria-label="菜单"
          aria-expanded={menu === 'document'}
          title={doc.name}
          onClick={() => setMenu(menu === 'document' ? null : 'document')}
        >
          <MenuIcon size={15} />
        </button>
        <button
          type="button"
          className="owb-top-page"
          aria-label={`页面：${page.name}`}
          onClick={() => setMenu(menu === 'pages' ? null : 'pages')}
        >
          <span>{page.name}</span>
          <ChevronDown size={12} />
        </button>
        <div className="owb-header-actions">
          <button
            type="button"
            title="撤销 ⌘/Ctrl Z"
            aria-label="撤销"
            disabled={!history.canUndo}
            onClick={() => {
              undo();
              setSelection([]);
            }}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            title="重做"
            aria-label="重做"
            disabled={!history.canRedo}
            onClick={() => {
              redo();
              setSelection([]);
            }}
          >
            <Redo2 size={17} />
          </button>
          <button
            type="button"
            aria-label="删除选中"
            title="删除选中"
            disabled={!selected.length}
            onClick={removeSelected}
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            aria-label="复制副本"
            title="复制副本"
            disabled={!selected.length}
            onClick={duplicate}
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            aria-label="属性面板"
            className={inspector ? 'is-active' : ''}
            onClick={() => {
              setInspector(!inspector);
              setAssistantOpen(false);
            }}
          >
            <Layers size={15} />
          </button>
        </div>
        <output
          className={`owb-save-dot${storageError ? ' is-error' : ''}`}
          aria-label={storageError ? '未保存 · 请备份' : saveState}
          title={storageError ? '未保存 · 请备份' : saveState}
        />
      </header>
      {drawToolsOpen && !inspector && (
        <StylePalette
          style={single?.style || style}
          onChange={changeStyle}
          onMore={() => setInspector(true)}
        />
      )}
      <input
        type="file"
        accept="image/*,video/*,.txt,.md,.markdown,.csv,.json,.log,.js,.jsx,.ts,.tsx,.py,.yaml,.yml,.html,.htm,.css,.xml"
        multiple
        ref={fileInput}
        hidden
        onChange={(e) => {
          void addFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <input
        type="file"
        accept=".json,application/json"
        ref={jsonInput}
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void importJSON(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <div
        ref={surface}
        tabIndex={0}
        aria-label="白板画布"
        className={`owb-surface tool-${tool}`}
        data-testid="board-surface"
        style={{
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={cancelGesture}
        onDoubleClick={(e) => {
          if (typing(e.target)) return;
          const id = (e.target as Element).closest<HTMLElement>(
            '[data-shape-id]'
          )?.dataset.shapeId;
          const world = currentPoint(e.clientX, e.clientY);
          const s =
            shapes.find((v) => v.id === id) ||
            [...shapes]
              .reverse()
              .find((v) => hitTest(v, world, 5 / camera.zoom, shapes));
          if (!s || s.locked) return;
          setSelection([s.id]);
          if (['text', 'note'].includes(s.type)) {
            textBefore.current = current.current;
            editingRef.current = s.id;
            setEditing(s.id);
          } else {
            setInteractiveId(s.id);
            setInspector(!coursewareForShape(s));
          }
        }}
        onContextMenu={(e) => {
          if (typing(e.target)) return;
          e.preventDefault();
          setContext({
            x: Math.min(e.clientX, window.innerWidth - 190),
            y: Math.min(e.clientY, window.innerHeight - 260),
          });
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(
            Array.from(e.dataTransfer.files),
            currentPoint(e.clientX, e.clientY)
          );
        }}
      >
        <div
          className="owb-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
          data-asset-version={assetVersion}
        >
          {shapes
            .filter(
              (s) =>
                selection.includes(s.id) ||
                s.id === interactiveId ||
                overlaps(getShapeBounds(s, shapes), visible)
            )
            .map((shape) => (
              <ShapeView
                key={`${renderEpoch}:${shape.id}`}
                shape={shape}
                shapes={shapes}
                selected={selection.includes(shape.id)}
                editing={editing === shape.id}
                interactive={interactiveId === shape.id}
                onActivateCourseware={() => {
                  setTool('select');
                  setInteractiveId(shape.id);
                  setInspector(false);
                }}
                finishEditing={finishEditing}
                updateProps={(patch) =>
                  patchProps(shape.id, patch, renderEpoch)
                }
                updateShapeProps={(id, patch) => {
                  if (renderEpoch !== documentEpoch.current) return;
                  const target = activePage(current.current).shapes.find(
                    (s) => s.id === id
                  );
                  if (
                    target &&
                    ['preview_html', 'ai_result'].includes(target.type)
                  )
                    patchProps(id, patch);
                  else notify('只能更新现有 HTML 或 AI 结果卡片。');
                }}
                insertShape={(type, props) =>
                  renderEpoch === documentEpoch.current &&
                  current.current.currentPageId === page.id
                    ? insertShape(type, props)
                    : ''
                }
                notify={notify}
                resolveAsset={(id) => assetUrls.current[id]}
              />
            ))}
          {marquee && (
            <div
              className="owb-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
                borderWidth: 1 / camera.zoom,
              }}
            />
          )}
          {guides.x !== undefined && (
            <div
              className="owb-guide owb-guide-x"
              style={{
                left: guides.x,
                top: visible.y,
                height: visible.h,
                width: 1 / camera.zoom,
              }}
            />
          )}
          {guides.y !== undefined && (
            <div
              className="owb-guide owb-guide-y"
              style={{
                top: guides.y,
                left: visible.x,
                width: visible.w,
                height: 1 / camera.zoom,
              }}
            />
          )}
        </div>
        {bounds && !editing && (
          <div
            className={`owb-selection${selected.some((shape) => CARD_TYPES.includes(shape.type)) ? ' owb-selection--external-handles' : ''}`}
            style={{
              left: bounds.x * camera.zoom + camera.x,
              top: bounds.y * camera.zoom + camera.y,
              width: Math.max(1, bounds.w * camera.zoom),
              height: Math.max(1, bounds.h * camera.zoom),
              borderRadius:
                single &&
                CARD_TYPES.includes(single.type) &&
                single.rotation % 360 === 0
                  ? 13 * (single.cardScale ?? 1) * camera.zoom
                  : undefined,
            }}
          >
            <small className="owb-selection-label">
              {selected.length === 1
                ? SHAPE_LABELS[selected[0].type]
                : `${selected.length} 个对象`}
              {selected.every((s) => s.locked) ? ' · 已锁定' : ''}
            </small>
            {!selected.every((s) => s.locked) && (
              <>
                {handles.map(([name, x, y]) => (
                  <div
                    key={name}
                    data-handle={name}
                    className={`owb-handle handle-${name}`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  />
                ))}
                <div
                  data-handle="rotate"
                  className="owb-rotate-handle"
                  title="旋转，Shift 吸附 15°"
                >
                  <RotateCw size={12} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {drawToolsOpen && (
        <DrawingToolsPanel
          tool={tool}
          onSelect={(nextTool) => {
            finishEditing();
            setTool(nextTool);
            setInteractiveId(null);
            setMenu(null);
          }}
          onInsertMedia={() => fileInput.current?.click()}
          onClose={() => setDrawToolsOpen(false)}
        />
      )}
      {ready && articlePickerPageKey === articlePageKey && (
        <ArticlePicker
          key={articlePageKey}
          onSelect={insertArticle}
          onClose={() => setArticlePickerPageKey(null)}
        />
      )}
      {ready && (
        <ToolsDock
          selectedShape={single}
          onInsert={insertSavedTool}
          notify={notify}
          drawingToolsOpen={drawToolsOpen}
          dockActions={[
            {
              id: 'home',
              label: '返回首页',
              icon: '🏠',
              onClick: () => {
                window.location.href = '/';
              },
            },
            {
              id: 'assistant',
              label: 'AI 助手',
              icon: '✨',
              active: assistantOpen,
              onClick: () =>
                assistantOpen ? setAssistantOpen(false) : openAssistant(),
            },
            {
              id: 'article',
              label: '博客文章',
              icon: '📝',
              active: articlePickerPageKey === articlePageKey,
              onClick: toggleArticlePicker,
            },
            {
              id: 'html',
              label: 'HTML 应用',
              icon: '🌐',
              onClick: () => insertShape('preview_html'),
            },
            {
              id: 'drawing',
              label: '绘图工具',
              icon: '🧰',
              active: drawToolsOpen,
              onClick: () => {
                if (!drawToolsOpen) setInspector(false);
                setDrawToolsOpen(!drawToolsOpen);
              },
            },
          ]}
        />
      )}
      {assistantOpen && ready && (
        <AssistantPanel
          key={`${doc.id}:${page.id}:${renderEpoch}`}
          pageKey={`${doc.id}:${page.id}`}
          shapes={shapes}
          selectedIds={selection}
          appliedRequestIds={page.assistantAppliedRequests || []}
          viewportCenter={screenToWorld(
            { x: size.w / 2, y: size.h / 2 },
            camera
          )}
          onClose={() => setAssistantOpen(false)}
          onApply={applyAssistant}
          notify={notify}
        />
      )}
      <footer className="owb-footer">
        <button
          className="owb-page-button"
          onClick={() => setMenu(menu === 'pages' ? null : 'pages')}
        >
          <Layers size={14} />
          {page.name}
          <ChevronDown size={14} />
        </button>
        <span className="owb-hint">
          {interactiveId
            ? '正在操作卡片 · 点击空白退出'
            : tool === 'select'
              ? 'Shift 多选 · 双击编辑 · Alt 临时关闭吸附'
              : '拖动创建 · Shift 约束比例 · Esc 取消'}
        </span>
        <div className="owb-zoom">
          <button aria-label="缩小" onClick={() => setZoom(camera.zoom / 1.2)}>
            <Minus size={15} />
          </button>
          <button title="恢复 100%" onClick={() => setZoom(1)}>
            {Math.round(camera.zoom * 100)}%
          </button>
          <button aria-label="放大" onClick={() => setZoom(camera.zoom * 1.2)}>
            <Plus size={15} />
          </button>
          <button aria-label="适应全部内容" onClick={fit}>
            <Maximize size={15} />
          </button>
        </div>
      </footer>
      {menu === 'document' && (
        <section
          className="owb-popover owb-document-menu"
          aria-label="白板文件菜单"
        >
          <label htmlFor="owb-document-name">白板名称</label>
          <input
            id="owb-document-name"
            aria-label="白板名称"
            value={doc.name}
            onChange={(event) =>
              commit({
                ...current.current,
                name: event.target.value.slice(0, 80),
              })
            }
          />
          <small>{storageError ? '未保存 · 请备份' : saveState}</small>
          <hr />
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              fileInput.current?.click();
            }}
          >
            <ImagePlus size={15} />
            导入材料
          </button>
          <button
            type="button"
            aria-label="导入 JSON"
            onClick={() => {
              setMenu(null);
              jsonInput.current?.click();
            }}
          >
            <ArrowUpFromLine size={15} />
            导入白板备份
          </button>
          <button
            type="button"
            aria-label="导出白板"
            onClick={() => setMenu('export')}
          >
            <ArrowDownToLine size={15} />
            导出 / 备份
          </button>
          <hr />
          <button
            type="button"
            onClick={() => {
              const lesson = getCourseware('cao-chong');
              if (lesson) leaveCanvas(() => {
                window.location.assign(getLocalePathname({ locale, href: coursewareWhiteboardHref(lesson) }));
              });
            }}
          >
            <BookOpen size={15} />
            打开《曹冲称象》
          </button>
          <button type="button" onClick={() => leaveCanvas(onOpenLesson)}>
            <QrCode size={15} />
            原有课堂与家长绑定
          </button>
          <hr />
          <button
            type="button"
            aria-label="使用帮助"
            onClick={() => setMenu('help')}
          >
            <HelpCircle size={15} />
            使用帮助
          </button>
        </section>
      )}
      {menu === 'insert' && (
        <section className="owb-popover owb-insert" aria-label="添加内容">
          <div className="owb-panel-title">
            添加到画布
            <button aria-label="关闭添加菜单" onClick={() => setMenu(null)}>
              <X size={16} />
            </button>
          </div>
          <small>业务卡片 · 7 种</small>
          <div className="owb-card-grid">
            {CARD_TYPES.filter((t) => t !== 'math_quiz').map((t, i) => (
              <button key={t} onClick={() => insertShape(t)}>
                <span className="owb-card-number">0{i + 1}</span>
                <strong>{SHAPE_LABELS[t]}</strong>
                <small>
                  {
                    [
                      '提问、生成与协作',
                      '文字、图片与 HTML',
                      '编辑互动网页',
                      '连接你的知识文章',
                      '调用已有下载接口',
                      '持久化本地视频',
                      '选择视频、分析当前帧',
                    ][i]
                  }
                </small>
              </button>
            ))}
          </div>
          <div className="owb-insert-extra">
            <button onClick={() => fileInput.current?.click()}>
              图片 / 视频 / 文本文件
            </button>
            <button onClick={() => insertShape('bookmark')}>链接卡片</button>
            <button onClick={() => insertShape('embed')}>网页嵌入</button>
          </div>
        </section>
      )}
      {menu === 'export' && (
        <section className="owb-popover owb-export" aria-label="导出选项">
          <strong>保存你的作品</strong>
          <button onClick={() => void exportFile('json')}>
            完整 JSON 备份 <small>可编辑 · 包含媒体</small>
          </button>
          {(['png', 'svg', 'jpeg', 'webp'] as const).map((f) => (
            <button key={f} onClick={() => void exportFile(f)}>
              {f.toUpperCase()} 图片
            </button>
          ))}
          <p>
            图片导出中的互动卡片、视频以摘要呈现。完整交互内容请使用 JSON 备份。
          </p>
        </section>
      )}
      {menu === 'pages' && (
        <section className="owb-popover owb-pages" aria-label="画布页面">
          <strong>画布页面</strong>
          {doc.pages.map((p) => (
            <div key={p.id}>
              <button
                className={p.id === page.id ? 'is-active' : ''}
                onClick={() => changePage(p.id)}
              >
                {p.name}
                <small>{p.shapes.length} 个对象</small>
              </button>
              {p.id === page.id && (
                <input
                  aria-label="页面名称"
                  value={p.name}
                  onChange={(e) =>
                    commit({
                      ...current.current,
                      pages: current.current.pages.map((v) =>
                        v.id === p.id
                          ? { ...v, name: e.target.value.slice(0, 40) }
                          : v
                      ),
                    })
                  }
                />
              )}
            </div>
          ))}
          <button onClick={addPage}>
            <Plus size={15} />
            新增页面
          </button>
          {doc.pages.length > 1 && (
            <button
              className="owb-danger"
              onClick={() => {
                const d = current.current;
                const next = d.pages.filter((p) => p.id !== d.currentPageId);
                commit({ ...d, pages: next, currentPageId: next[0].id });
                setSelection([]);
              }}
            >
              删除当前页（可撤销）
            </button>
          )}
        </section>
      )}
      {inspector && (
        <aside className="owb-inspector" aria-label="对象属性">
          <div className="owb-panel-title">
            {single
              ? SHAPE_LABELS[single.type]
              : selection.length
                ? `${selection.length} 个对象`
                : '创作样式'}
            <button aria-label="关闭属性" onClick={() => setInspector(false)}>
              <X size={16} />
            </button>
          </div>
          <label>描边 / 文字</label>
          <div className="owb-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`颜色 ${c}`}
                style={{ background: c }}
                className={
                  (single?.style.stroke || style.stroke) === c
                    ? 'is-chosen'
                    : ''
                }
                onClick={() => changeStyle({ stroke: c })}
              />
            ))}
            <input
              aria-label="自定义颜色"
              type="color"
              value={single?.style.stroke || style.stroke}
              onChange={(e) => changeStyle({ stroke: e.target.value })}
            />
          </div>
          <label>填充</label>
          <div className="owb-row">
            <button onClick={() => changeStyle({ fill: 'transparent' })}>
              无填充
            </button>
            <input
              type="color"
              aria-label="填充颜色"
              value={
                single?.style.fill === 'transparent'
                  ? '#ffffff'
                  : single?.style.fill || '#ffffff'
              }
              onChange={(e) => changeStyle({ fill: e.target.value })}
            />
          </div>
          <label>
            线条粗细{' '}
            <output>{single?.style.strokeWidth || style.strokeWidth}</output>
          </label>
          <input
            aria-label="线条粗细"
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={single?.style.strokeWidth || style.strokeWidth}
            onChange={(e) =>
              changeStyle({ strokeWidth: Number(e.target.value) })
            }
          />
          <label>透明度</label>
          <input
            aria-label="透明度"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={single?.style.opacity ?? style.opacity}
            onChange={(e) => changeStyle({ opacity: Number(e.target.value) })}
          />
          <label className="owb-check">
            <input
              type="checkbox"
              checked={single?.style.dash ?? style.dash}
              onChange={(e) => changeStyle({ dash: e.target.checked })}
            />
            虚线
          </label>
          <label className="owb-check">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            智能对齐吸附
          </label>
          {single && (
            <>
              <hr />
              <label>位置和尺寸</label>
              <div className="owb-fields">
                {(['x', 'y', 'w', 'h', 'rotation'] as const).map((key) => (
                  <label key={key}>
                    {
                      { x: 'X', y: 'Y', w: '宽', h: '高', rotation: '角度' }[
                        key
                      ]
                    }
                    <input
                      aria-label={`对象${key}`}
                      type="number"
                      value={Math.round(single[key])}
                      disabled={single.locked}
                      onChange={(e) =>
                        changeGeometry(key, Number(e.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
              {['text', 'note', 'arrow'].includes(single.type) && (
                <>
                  <label>文字内容</label>
                  <textarea
                    aria-label="文字内容"
                    value={single.props.text || ''}
                    onChange={(e) =>
                      patchProps(single.id, { text: e.target.value })
                    }
                  />
                  <label>字号</label>
                  <input
                    type="number"
                    aria-label="字号"
                    min="8"
                    max="144"
                    value={single.style.fontSize}
                    onChange={(e) =>
                      changeStyle({
                        fontSize: Math.max(
                          8,
                          Math.min(144, Number(e.target.value) || 24)
                        ),
                      })
                    }
                  />
                  <div className="owb-row">
                    <button
                      onClick={() =>
                        patchProps(single.id, { bold: !single.props.bold })
                      }
                    >
                      粗体
                    </button>
                    <button
                      onClick={() =>
                        patchProps(single.id, { italic: !single.props.italic })
                      }
                    >
                      斜体
                    </button>
                    <button
                      onClick={() =>
                        patchProps(single.id, {
                          align:
                            single.props.align === 'center' ? 'left' : 'center',
                        })
                      }
                    >
                      居中
                    </button>
                  </div>
                </>
              )}
              {['bookmark', 'embed', 'frame'].includes(single.type) && (
                <>
                  <label>标题</label>
                  <input
                    aria-label="对象标题"
                    value={single.props.title || ''}
                    onChange={(e) =>
                      patchProps(single.id, { title: e.target.value })
                    }
                  />
                </>
              )}
              {['bookmark', 'embed'].includes(single.type) && (
                <>
                  <label>网页地址（HTTPS）</label>
                  <URLField
                    key={single.id}
                    value={single.props.url || ''}
                    onSave={(url) => patchProps(single.id, { url })}
                  />
                  <small>部分网站禁止 iframe 嵌入，可改用链接卡片。</small>
                </>
              )}
              {single.type === 'image' && (
                <>
                  <label>居中裁剪</label>
                  <input
                    aria-label="图片裁剪"
                    type="range"
                    min="0"
                    max="0.4"
                    step="0.01"
                    value={single.props.crop?.x || 0}
                    onChange={(e) => {
                      const inset = Number(e.target.value);
                      patchProps(single.id, {
                        crop: {
                          x: inset,
                          y: inset,
                          w: 1 - inset * 2,
                          h: 1 - inset * 2,
                        },
                      });
                    }}
                  />
                </>
              )}
              {(CARD_TYPES.includes(single.type) ||
                ['video', 'embed', 'bookmark'].includes(single.type)) && (
                <button
                  className="owb-primary owb-wide"
                  onClick={() =>
                    setInteractiveId(
                      interactiveId === single.id ? null : single.id
                    )
                  }
                >
                  {interactiveId === single.id
                    ? '结束卡片交互'
                    : '操作这张卡片'}
                </button>
              )}
            </>
          )}
          {selection.length > 0 && (
            <>
              <hr />
              <label>排列</label>
              <div className="owb-align-grid">
                {(
                  [
                    ['left', '左对齐'],
                    ['center', '水平居中'],
                    ['right', '右对齐'],
                    ['top', '顶对齐'],
                    ['middle', '垂直居中'],
                    ['bottom', '底对齐'],
                    ['horizontal', '水平等距'],
                    ['vertical', '垂直等距'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() =>
                      updateShapes(alignShapes(shapes, selection, mode))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="owb-row">
                <button onClick={() => group()}>分组</button>
                <button onClick={() => group(true)}>取消分组</button>
              </div>
              <div className="owb-row">
                <button onClick={() => order(true)}>置于顶层</button>
                <button onClick={() => order(false)}>置于底层</button>
              </div>
              <div className="owb-row">
                <button onClick={setLocked}>
                  {selected.every((s) => s.locked) ? (
                    <Unlock size={14} />
                  ) : (
                    <LockKeyhole size={14} />
                  )}
                  锁定 / 解锁
                </button>
              </div>
              <div className="owb-row">
                <button onClick={duplicate}>
                  <Copy size={14} />
                  副本
                </button>
                <button className="owb-danger" onClick={removeSelected}>
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </>
          )}
        </aside>
      )}
      {menu === 'help' && (
        <div className="owb-modal-backdrop" onPointerDown={() => setMenu(null)}>
          <section
            className="owb-help"
            role="dialog"
            aria-modal="true"
            aria-label="白板使用帮助"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="owb-panel-title">
              让想法流动起来
              <button aria-label="关闭帮助" onClick={() => setMenu(null)}>
                <X size={18} />
              </button>
            </div>
            <p>
              滚轮 / 双指滑动平移；⌘/Ctrl +
              滚轮、触控板捏合或左下角按钮缩放。触摸屏支持双指平移缩放。
            </p>
            <p>
              空格拖动平移，Shift 多选或保持比例，Alt
              临时暂停吸附。框架会带着内部对象一起移动。
            </p>
            <p>
              双击文字编辑；双击卡片或点击“操作这张卡片”启用输入、播放和网页交互。点击空白退出交互。
            </p>
            <p>
              ⌘/Ctrl Z 撤销，Shift Z 重做，C / V 复制粘贴，D 副本，G 分组，0
              适应全部。右键也可操作。
            </p>
            <p>
              内容只保存在此浏览器。换电脑请导出完整 JSON。媒体存入
              IndexedDB；清除网站数据会清除本地白板。
            </p>
            <p>
              AI、文章库、视频下载沿用原接口与登录权限，不自动调用付费服务。视频分析是当前帧，不是整段视频理解。
            </p>
            <button
              className="owb-primary owb-wide"
              onClick={() => setMenu(null)}
            >
              开始创作
            </button>
          </section>
        </div>
      )}
      {context && (
        <div
          className="owb-context"
          style={{ left: context.x, top: context.y }}
        >
          <button onClick={() => void copySelection()}>复制</button>
          <button
            onClick={() => {
              pasteShapes();
              setContext(null);
            }}
          >
            粘贴
          </button>
          <button onClick={duplicate}>创建副本</button>
          <button
            onClick={() => {
              group();
              setContext(null);
            }}
          >
            分组
          </button>
          <button
            onClick={() => {
              setLocked();
              setContext(null);
            }}
          >
            锁定 / 解锁
          </button>
          <button className="owb-danger" onClick={removeSelected}>
            删除
          </button>
        </div>
      )}
      {storageError && (
        <div className="owb-storage-error" role="alert">
          {storageError}
          <button onClick={() => void exportFile('json')}>导出备份</button>
        </div>
      )}
      {(toast || busy) && (
        <div className="owb-toast" role="status">
          {busy ? '正在处理文件…' : toast}
        </div>
      )}
    </div>
  );
}
