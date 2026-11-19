import {
  CARD_TYPES,
  DEFAULT_STYLE,
  SHAPE_TYPES,
  type Binding,
  type BoardDocument,
  type BoardShape,
  type Bounds,
  type Camera,
  type Point,
  type ShapeProps,
  type ShapeStyle,
  type ShapeType,
} from './types';

/** Deliberately independent of any third-party board schema or runtime. */
export const DOCUMENT_LIMITS = {
  pages: 50,
  shapes: 10_000,
  pointsPerShape: 20_000,
  points: 200_000,
  coordinate: 10_000_000,
  dimension: 1_000_000,
  stringLength: 2_000_000,
  totalStringLength: 20_000_000,
  depth: 30,
  nodes: 1_000_000,
} as const;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
const MIN_CARD_SCALE = 0.125;
const MAX_CARD_SCALE = 16;
const EPSILON = 1e-9;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
let fallbackSequence = 0;

export function createId(prefix = 'shape'): string {
  const random = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${(++fallbackSequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function createDocument(): BoardDocument {
  const pageId = createId('page');
  return {
    format: 'oneworker-whiteboard', version: 2, id: createId('board'), name: '未命名白板',
    currentPageId: pageId,
    pages: [{ id: pageId, name: '页面 1', shapes: [], camera: { x: 0, y: 0, zoom: 1 } }],
  };
}

export function createShape(type: ShapeType, x: number, y: number, props: ShapeProps = {}): BoardShape {
  if (!SHAPE_TYPES.includes(type)) fail('shape.type', '不支持的图形类型');
  number(x, 'shape.x', -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
  number(y, 'shape.y', -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
  const dimensions: Partial<Record<ShapeType, [number, number]>> = {
    text: [240, 60], note: [220, 220], image: [320, 240], video: [480, 300],
    bookmark: [320, 180], embed: [640, 420], frame: [640, 420],
    ai_terminal: [440, 480], ai_result: [420, 320], preview_html: [640, 480],
    blog_post: [360, 280], skill: [420, 300], video_player: [480, 320],
    ai_video_analyzer: [480, 380], math_quiz: [480, 420],
    line: [200, 1], arrow: [200, 1], draw: [1, 1], highlight: [1, 1],
  };
  const [w, h] = dimensions[type] ?? [200, 140];
  const nextProps = cloneData(props) as ShapeProps;
  validateProps(nextProps, 'shape.props');
  const style = { ...DEFAULT_STYLE };
  if (type === 'note') style.fill = '#fef08a';
  if (type === 'frame') style.fill = '#ffffff';
  if (type === 'highlight') {
    style.stroke = '#facc15';
    style.strokeWidth = 18;
    style.opacity = 0.45;
  }
  const shape: BoardShape = { id: createId(), type, x, y, w, h, rotation: 0, style, props: nextProps };
  if (type === 'line' || type === 'arrow') shape.points = [{ x: 0, y: 0 }, { x: w, y: 0 }];
  if (type === 'draw' || type === 'highlight') shape.points = [{ x: 0, y: 0 }];
  return shape;
}

export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function worldToScreen(point: Point, camera: Camera): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

export function zoomAt(camera: Camera, screenPoint: Point, nextZoom: number): Camera {
  const zoom = Number.isFinite(nextZoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) : camera.zoom;
  const point = screenToWorld(screenPoint, camera);
  return { x: screenPoint.x - point.x * zoom, y: screenPoint.y - point.y * zoom, zoom };
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { ...point, x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}

function centerOf(shape: Bounds): Point {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
}

function localToWorld(point: Point, shape: BoardShape): Point {
  return rotatePoint({ ...point, x: shape.x + point.x, y: shape.y + point.y }, centerOf(shape), shape.rotation);
}

function worldToLocal(point: Point, shape: BoardShape): Point {
  const rotated = rotatePoint(point, centerOf(shape), -shape.rotation);
  return { ...rotated, x: rotated.x - shape.x, y: rotated.y - shape.y };
}

export function getBoundPoint(binding: Binding, allShapes: readonly BoardShape[]): Point | undefined {
  const target = allShapes.find((shape) => shape.id === binding.shapeId);
  return target ? localToWorld({ x: target.w * binding.anchor.x, y: target.h * binding.anchor.y }, target) : undefined;
}

/** Arrow and line points are local offsets. Returned points are fully rotated world positions. */
export function resolveArrowPoints(shape: BoardShape, allShapes: readonly BoardShape[]): Point[] {
  const localPoints = shape.points?.length && shape.points.length >= 2
    ? shape.points : [{ x: 0, y: 0 }, { x: shape.w, y: shape.h }];
  const points = localPoints.map((point) => localToWorld(point, shape));
  const start = shape.startBinding && getBoundPoint(shape.startBinding, allShapes);
  const end = shape.endBinding && getBoundPoint(shape.endBinding, allShapes);
  if (start) points[0] = start;
  if (end) points[points.length - 1] = end;
  return points;
}

/** Remove specified target links without moving the connector's visible endpoints. */
export function detachShapeBindings(shape: BoardShape, allShapes: readonly BoardShape[], targetIds: ReadonlySet<string>): BoardShape {
  const detachStart = Boolean(shape.startBinding && targetIds.has(shape.startBinding.shapeId));
  const detachEnd = Boolean(shape.endBinding && targetIds.has(shape.endBinding.shapeId));
  if (!detachStart && !detachEnd) return shape;
  return {
    ...shape,
    points: resolveArrowPoints(shape, allShapes).map((point) => worldToLocal(point, shape)),
    startBinding: detachStart ? undefined : shape.startBinding,
    endBinding: detachEnd ? undefined : shape.endBinding,
  };
}

function pointBounds(points: readonly Point[]): Bounds {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function getShapeBounds(shape: BoardShape, allShapes: readonly BoardShape[] = []): Bounds {
  if (shape.type === 'arrow' || shape.type === 'line') return pointBounds(resolveArrowPoints(shape, allShapes));
  if ((shape.type === 'draw' || shape.type === 'highlight') && shape.points?.length) {
    return pointBounds(shape.points.map((point) => localToWorld(point, shape)));
  }
  // The ellipse's exact axis-aligned bounds, rather than its rotated rectangle.
  if (shape.type === 'ellipse') {
    const angle = shape.rotation * Math.PI / 180;
    const rx = shape.w / 2; const ry = shape.h / 2;
    const w = 2 * Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
    const h = 2 * Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle));
    const center = centerOf(shape);
    return { x: center.x - w / 2, y: center.y - h / 2, w, h };
  }
  const points = polygon(shape) ?? [
    { x: 0, y: 0 }, { x: shape.w, y: 0 }, { x: shape.w, y: shape.h }, { x: 0, y: shape.h },
  ];
  return pointBounds(points.map((point) => localToWorld(point, shape)));
}

export function getSelectionBounds(shapes: readonly BoardShape[], allShapes: readonly BoardShape[] = shapes): Bounds | null {
  if (!shapes.length) return null;
  const bounds = shapes.map((shape) => getShapeBounds(shape, allShapes));
  return pointBounds(bounds.flatMap((box) => [
    { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y + box.h },
  ]));
}

function segmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared < EPSILON ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

function polygon(shape: BoardShape): Point[] | undefined {
  if (shape.type === 'triangle') return [{ x: shape.w / 2, y: 0 }, { x: shape.w, y: shape.h }, { x: 0, y: shape.h }];
  if (shape.type === 'diamond') return [{ x: shape.w / 2, y: 0 }, { x: shape.w, y: shape.h / 2 }, { x: shape.w / 2, y: shape.h }, { x: 0, y: shape.h / 2 }];
  return undefined;
}

function insidePolygon(point: Point, points: readonly Point[], tolerance: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]; const b = points[j];
    if (segmentDistance(point, a, b) <= tolerance) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Supply allShapes for bound-connector hit testing. Rectangular cards include their interior. */
export function hitTest(shape: BoardShape, worldPoint: Point, tolerance = 5, allShapes: readonly BoardShape[] = []): boolean {
  const padding = Math.max(0, tolerance) + shape.style.strokeWidth / 2;
  const local = worldToLocal(worldPoint, shape);
  if (['line', 'arrow', 'draw', 'highlight'].includes(shape.type)) {
    const points = shape.type === 'line' || shape.type === 'arrow'
      ? resolveArrowPoints(shape, allShapes)
      : (shape.points ?? [{ x: 0, y: 0 }]).map((point) => localToWorld(point, shape));
    if (points.length === 1) return Math.hypot(worldPoint.x - points[0].x, worldPoint.y - points[0].y) <= padding;
    for (let i = 1; i < points.length; i++) {
      if (segmentDistance(worldPoint, points[i - 1], points[i]) <= padding) return true;
    }
    return false;
  }
  if (shape.type === 'ellipse') {
    const rx = shape.w / 2 + padding; const ry = shape.h / 2 + padding;
    return ((local.x - shape.w / 2) / rx) ** 2 + ((local.y - shape.h / 2) / ry) ** 2 <= 1;
  }
  const vertices = polygon(shape);
  if (vertices) return insidePolygon(local, vertices, padding);
  if (shape.type === 'frame') {
    // Frame bodies don't intercept their children. The border and caption do.
    const inBox = local.x >= -padding && local.x <= shape.w + padding && local.y >= -padding - 28 && local.y <= shape.h + padding;
    return inBox && (local.y <= padding || local.y >= shape.h - padding || local.x <= padding || local.x >= shape.w - padding);
  }
  return local.x >= -padding && local.x <= shape.w + padding && local.y >= -padding && local.y <= shape.h + padding;
}

/** Group peers and frame descendants travel together; children do not implicitly select their parent. */
export function selectionClosure(shapes: readonly BoardShape[], ids: readonly string[]): string[] {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const groups = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const shape of shapes) {
    if (shape.groupId) {
      const peers = groups.get(shape.groupId) ?? [];
      peers.push(shape.id);
      groups.set(shape.groupId, peers);
    }
    if (shape.parentId) {
      const descendants = children.get(shape.parentId) ?? [];
      descendants.push(shape.id);
      children.set(shape.parentId, descendants);
    }
  }
  const selected = new Set<string>();
  const expandedGroups = new Set<string>();
  const queue = [...ids];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    const shape = byId.get(id);
    if (!shape || selected.has(id)) continue;
    selected.add(id);
    if (shape.groupId && !expandedGroups.has(shape.groupId)) {
      expandedGroups.add(shape.groupId);
      queue.push(...(groups.get(shape.groupId) ?? []));
    }
    if (shape.type === 'frame') queue.push(...(children.get(id) ?? []));
  }
  return shapes.filter((shape) => selected.has(shape.id)).map((shape) => shape.id);
}

/** A newly drawn frame adopts only top-level contained items, not their descendants. */
export function adoptFrameContents(shapes: readonly BoardShape[], frameId: string): BoardShape[] {
  const frame = shapes.find((shape) => shape.id === frameId && shape.type === 'frame');
  if (!frame) return [...shapes];
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const bounds = new Map(shapes.map((shape) => [shape.id, getShapeBounds(shape, shapes)]));
  const frameBounds = bounds.get(frameId)!;
  const contains = (outer: Bounds, inner: Bounds) => inner.x >= outer.x - EPSILON && inner.y >= outer.y - EPSILON &&
    inner.x + inner.w <= outer.x + outer.w + EPSILON && inner.y + inner.h <= outer.y + outer.h + EPSILON;
  const isDescendant = (shape: BoardShape, ancestorId: string) => {
    const visited = new Set<string>();
    let parentId = shape.parentId;
    while (parentId && !visited.has(parentId)) {
      if (parentId === ancestorId) return true;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
    return false;
  };
  // Prefer the nearest enclosing frame; equal-size frames are not mutual parents.
  const parent = shapes.filter((shape) => shape.id !== frameId && shape.type === 'frame' &&
    !isDescendant(shape, frameId) && contains(bounds.get(shape.id)!, frameBounds) &&
    !contains(frameBounds, bounds.get(shape.id)!))
    .sort((a, b) => {
      const first = bounds.get(a.id)!; const second = bounds.get(b.id)!;
      return first.w * first.h - second.w * second.h;
    })[0];
  return shapes.map((shape) => {
    if (shape.id === frameId) return { ...shape, parentId: parent?.id };
    if (shape.locked || !contains(frameBounds, bounds.get(shape.id)!)) return shape;
    // Preserve nested ownership, including children of a locked enclosed frame.
    const existingParent = shape.parentId && byId.get(shape.parentId);
    if (existingParent && contains(frameBounds, bounds.get(existingParent.id)!)) return shape;
    // Never turn an existing ancestor into a child of its descendant.
    if (parent && (shape.id === parent.id || isDescendant(parent, shape.id))) return shape;
    return { ...shape, parentId: frameId };
  });
}

function movableIds(shapes: readonly BoardShape[], ids: readonly string[]): Set<string> {
  const unlocked = new Set(shapes.filter((shape) => !shape.locked).map((shape) => shape.id));
  const unlockedSeeds = ids.filter((id) => unlocked.has(id));
  // A locked child still travels with its selected frame, just like its visual contents.
  return new Set(selectionClosure(shapes, unlockedSeeds));
}

export function translateShapes(shapes: readonly BoardShape[], ids: readonly string[], dx: number, dy: number): BoardShape[] {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [...shapes];
  const selected = movableIds(shapes, ids);
  return shapes.map((shape) => selected.has(shape.id) ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape);
}

export function selectionHasResizableCard(shapes: readonly BoardShape[], ids: readonly string[]): boolean {
  const selected = movableIds(shapes, ids);
  return shapes.some((shape) => selected.has(shape.id) && CARD_TYPES.includes(shape.type));
}

/** Uniformly scale around a fixed anchor, without changing card layout or rotation. */
export function scaleShapes(shapes: readonly BoardShape[], ids: readonly string[], anchor: Point, requested: number): BoardShape[] {
  if (![anchor.x, anchor.y, requested].every(Number.isFinite)) return [...shapes];
  const selected = movableIds(shapes, ids);
  let minimum = 0;
  let maximum = Infinity;
  for (const shape of shapes) {
    if (!selected.has(shape.id)) continue;
    minimum = Math.max(minimum, 0.01 / Math.min(shape.w, shape.h));
    maximum = Math.min(maximum, DOCUMENT_LIMITS.dimension / Math.max(shape.w, shape.h));
    if (CARD_TYPES.includes(shape.type)) {
      minimum = Math.max(minimum, MIN_CARD_SCALE / (shape.cardScale ?? 1));
      maximum = Math.min(maximum, MAX_CARD_SCALE / (shape.cardScale ?? 1));
    }
  }
  const factor = Math.max(minimum, Math.min(maximum, requested));
  if (factor === 1 || factor <= 0) return [...shapes];
  return shapes.map((shape) => {
    if (!selected.has(shape.id)) return shape;
    return {
      ...shape,
      x: anchor.x + (shape.x - anchor.x) * factor,
      y: anchor.y + (shape.y - anchor.y) * factor,
      w: shape.w * factor,
      h: shape.h * factor,
      ...(CARD_TYPES.includes(shape.type) && {
        cardScale: Math.max(MIN_CARD_SCALE, Math.min(MAX_CARD_SCALE, (shape.cardScale ?? 1) * factor)),
      }),
      ...(shape.points && { points: shape.points.map((point) => ({ ...point, x: point.x * factor, y: point.y * factor })) }),
    };
  });
}

export function scaleShapesFromHandle(shapes: readonly BoardShape[], ids: readonly string[], bounds: Bounds, handle: string, delta: Point): BoardShape[] {
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const vx = hx * bounds.w;
  const vy = hy * bounds.h;
  const distanceSquared = vx * vx + vy * vy;
  if (distanceSquared <= EPSILON) return [...shapes];
  // Project the pointer onto the resize diagonal (or edge axis) instead of stretching independently.
  const factor = 1 + (delta.x * vx + delta.y * vy) / distanceSquared;
  return scaleShapes(shapes, ids, {
    x: bounds.x + bounds.w * (1 - hx) / 2,
    y: bounds.y + bounds.h * (1 - hy) / 2,
  }, factor);
}

export function resizeShapes(shapes: readonly BoardShape[], ids: readonly string[], fromBounds: Bounds, toBounds: Bounds): BoardShape[] {
  const selected = movableIds(shapes, ids);
  const sx = fromBounds.w > EPSILON ? Math.max(1, toBounds.w) / fromBounds.w : 1;
  const sy = fromBounds.h > EPSILON ? Math.max(1, toBounds.h) / fromBounds.h : 1;
  if (![sx, sy, toBounds.x, toBounds.y].every(Number.isFinite)) return [...shapes];
  return shapes.map((shape) => {
    if (!selected.has(shape.id)) return shape;
    const center = centerOf(shape);
    const angle = shape.rotation * Math.PI / 180;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    // Transform the local axes, not just w/h: a quarter-turned box swaps scale axes.
    // A box has no shear field, so oblique nonuniform transforms retain an orthogonal
    // approximation. Paths below retain the exact affine-transformed world points.
    const w = Math.max(1, shape.w * Math.hypot(sx * cos, sy * sin));
    const h = Math.max(1, shape.h * Math.hypot(sx * sin, sy * cos));
    const rotation = ((Math.atan2(sy * sin, sx * cos) * 180 / Math.PI) % 360 + 360) % 360;
    const next: BoardShape = {
      ...shape,
      x: toBounds.x + (center.x - fromBounds.x) * sx - w / 2,
      y: toBounds.y + (center.y - fromBounds.y) * sy - h / 2,
      w, h, rotation,
    };
    if (shape.points) next.points = shape.points.map((point) => {
      const world = localToWorld(point, shape);
      return worldToLocal({ ...point, x: toBounds.x + (world.x - fromBounds.x) * sx, y: toBounds.y + (world.y - fromBounds.y) * sy }, next);
    });
    return next;
  });
}

export function rotateShapes(shapes: readonly BoardShape[], ids: readonly string[], degrees: number, center: Point): BoardShape[] {
  if (![degrees, center.x, center.y].every(Number.isFinite)) return [...shapes];
  const selected = movableIds(shapes, ids);
  return shapes.map((shape) => {
    if (!selected.has(shape.id)) return shape;
    const rotated = rotatePoint(centerOf(shape), center, degrees);
    return { ...shape, x: rotated.x - shape.w / 2, y: rotated.y - shape.h / 2, rotation: ((shape.rotation + degrees) % 360 + 360) % 360 };
  });
}

type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical';

export function alignShapes(shapes: readonly BoardShape[], ids: readonly string[], mode: Alignment): BoardShape[] {
  // Merge overlapping closures so one group/frame is an alignment unit, not scattered members.
  const units: Set<string>[] = [];
  for (const id of ids) {
    if (shapes.find((shape) => shape.id === id)?.locked) continue;
    const unit = new Set(selectionClosure(shapes, [id]));
    if (!unit.size) continue;
    for (let index = units.length - 1; index >= 0; index--) {
      if ([...units[index]].some((key) => unit.has(key))) {
        for (const key of units[index]) unit.add(key);
        units.splice(index, 1);
      }
    }
    units.push(unit);
  }
  if (units.length < 2) return [...shapes];
  const items = units.map((unit) => ({ ids: unit, bounds: getSelectionBounds(shapes.filter((shape) => unit.has(shape.id)), shapes)! }));
  const total = getSelectionBounds(shapes.filter((shape) => items.some((item) => item.ids.has(shape.id))), shapes)!;
  const shifts = new Map<string, Point>();
  if (mode === 'horizontal' || mode === 'vertical') {
    if (items.length < 3) return [...shapes];
    const axis = mode === 'horizontal' ? 'x' : 'y';
    const size = mode === 'horizontal' ? 'w' : 'h';
    items.sort((a, b) => a.bounds[axis] - b.bounds[axis]);
    const first = items[0].bounds;
    const last = items[items.length - 1].bounds;
    const gap = (last[axis] + last[size] - first[axis] - items.reduce((sum, item) => sum + item.bounds[size], 0)) / (items.length - 1);
    let cursor = first[axis];
    for (const item of items) {
      const delta = cursor - item.bounds[axis];
      for (const id of item.ids) shifts.set(id, axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta });
      cursor += item.bounds[size] + gap;
    }
  } else {
    for (const item of items) {
      const box = item.bounds;
      const dx = mode === 'left' ? total.x - box.x : mode === 'right' ? total.x + total.w - box.x - box.w : mode === 'center' ? total.x + total.w / 2 - box.x - box.w / 2 : 0;
      const dy = mode === 'top' ? total.y - box.y : mode === 'bottom' ? total.y + total.h - box.y - box.h : mode === 'middle' ? total.y + total.h / 2 - box.y - box.h / 2 : 0;
      for (const id of item.ids) shifts.set(id, { x: dx, y: dy });
    }
  }
  return shapes.map((shape) => {
    const shift = shifts.get(shape.id);
    return shift ? { ...shape, x: shape.x + shift.x, y: shape.y + shift.y } : shape;
  });
}

export function duplicateShapes(shapes: readonly BoardShape[], ids: readonly string[], offset: Point = { x: 24, y: 24 }): { shapes: BoardShape[]; ids: string[] } {
  const selected = new Set(selectionClosure(shapes, ids));
  const source = shapes.filter((shape) => selected.has(shape.id));
  const idMap = new Map(source.map((shape) => [shape.id, createId()]));
  const groupMap = new Map(source.filter((shape) => shape.groupId).map((shape) => [shape.groupId!, createId('group')]));
  const copied = source.map((shape) => {
    const copy = cloneData(shape) as BoardShape;
    copy.id = idMap.get(shape.id)!;
    copy.x += Number.isFinite(offset.x) ? offset.x : 24;
    copy.y += Number.isFinite(offset.y) ? offset.y : 24;
    if (copy.parentId) copy.parentId = idMap.get(copy.parentId) ?? copy.parentId;
    if (copy.groupId) copy.groupId = groupMap.get(copy.groupId)!;
    if (copy.type === 'ai_video_analyzer' && typeof copy.props.videoId === 'string') {
      copy.props.videoId = idMap.get(copy.props.videoId) ?? copy.props.videoId;
    }
    for (const key of ['startBinding', 'endBinding'] as const) {
      if (copy[key]) copy[key]!.shapeId = idMap.get(copy[key]!.shapeId) ?? copy[key]!.shapeId;
    }
    return copy;
  });
  return { shapes: [...shapes, ...copied], ids: copied.map((shape) => shape.id) };
}

function fail(path: string, reason: string): never {
  throw new Error(`白板文件无效：${path} ${reason}`);
}

function record(input: unknown, path: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(path, '必须是对象');
  return input as Record<string, unknown>;
}

function number(input: unknown, path: string, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) fail(path, `必须是 ${min} 到 ${max} 之间的有限数字`);
  return input;
}

function string(input: unknown, path: string, max = 256, empty = false): string {
  if (typeof input !== 'string' || (!empty && !input.trim()) || input.length > max) fail(path, `必须是长度不超过 ${max} 的${empty ? '' : '非空'}字符串`);
  return input;
}

function identifier(input: unknown, path: string): string {
  const value = string(input, path);
  if (FORBIDDEN_KEYS.has(value) || /[\u0000-\u0020\u007f]/.test(value)) fail(path, '标识符包含不安全字符');
  return value;
}

/** Cloning untrusted JSON also rejects pollution keys, getters, cycles and hostile prototypes. */
function cloneData(input: unknown): unknown {
  let nodeCount = 0; let textLength = 0;
  const visited = new WeakSet<object>();
  const clone = (value: unknown, path: string, depth: number): unknown => {
    if (++nodeCount > DOCUMENT_LIMITS.nodes) fail(path, '数据节点过多');
    if (depth > DOCUMENT_LIMITS.depth) fail(path, '嵌套层级过深');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return number(value, path, -1e15, 1e15);
    if (typeof value === 'string') {
      textLength += value.length;
      if (value.length > DOCUMENT_LIMITS.stringLength || textLength > DOCUMENT_LIMITS.totalStringLength) fail(path, '文本数据过大');
      return value;
    }
    if (!value || typeof value !== 'object') fail(path, '必须是 JSON 数据');
    if (visited.has(value)) fail(path, '数据存在循环引用');
    visited.add(value);
    let result: unknown;
    if (Array.isArray(value)) {
      if (value.length > DOCUMENT_LIMITS.points) fail(path, '数组过长');
      const next: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor)) fail(`${path}[${i}]`, '不允许稀疏数组或访问器');
        next.push(clone(descriptor.value, `${path}[${i}]`, depth + 1));
      }
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) fail(path, '包含禁止的属性名');
      }
      result = next;
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) fail(path, '不允许自定义原型');
      const next: Record<string, unknown> = {};
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.keys(descriptors).length > 1_000) fail(path, '对象属性过多');
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (FORBIDDEN_KEYS.has(key)) fail(`${path}.${key}`, '包含禁止的属性名');
        textLength += key.length;
        if (key.length > 256 || textLength > DOCUMENT_LIMITS.totalStringLength) fail(path, '属性名过长或文本数据过大');
        if (!('value' in descriptor)) fail(`${path}.${key}`, '不允许访问器');
        if (descriptor.value !== undefined) next[key] = clone(descriptor.value, `${path}.${key}`, depth + 1);
      }
      result = next;
    }
    visited.delete(value);
    return result;
  };
  return clone(input, 'document', 0);
}

function validateUrl(value: string, path: string): void {
  if (!value) return;
  if (value !== value.trim() || /[\u0000-\u001f\u007f\\]/.test(value)) fail(path, 'URL 包含不安全字符');
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('./') || value.startsWith('../') || value.startsWith('#')) return;
  if (/^data:(?:image\/(?:png|jpeg|gif|webp|avif|bmp)|video\/(?:mp4|webm|ogg)|audio\/(?:mpeg|mp3|mp4|ogg|wav|webm));base64,[A-Za-z0-9+/=\r\n]+$/i.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return;
    if (url.protocol === 'blob:' && /^(?:https?:\/\/|null\/)/.test(value.slice(5))) return;
  } catch { /* Report the same useful error for malformed and unsafe schemes. */ }
  fail(path, '仅支持 HTTP(S)、站内路径或安全媒体 URL');
}

function validateProps(props: ShapeProps, path: string): void {
  record(props, path);
  const textFields = ['text', 'html', 'title', 'url', 'src', 'assetId', 'description', 'image', 'date', 'category', 'result', 'videoId'];
  for (const key of textFields) {
    if (props[key] !== undefined) string(props[key], `${path}.${key}`, DOCUMENT_LIMITS.stringLength, true);
  }
  const scanUrls = (value: unknown, currentPath: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => scanUrls(item, `${currentPath}[${index}]`));
    else if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (typeof nested === 'string' && /(?:url$|^(?:src|image|href|poster)$)/i.test(key)) validateUrl(nested, `${currentPath}.${key}`);
        else scanUrls(nested, `${currentPath}.${key}`);
      }
    }
  };
  scanUrls(props, path);
  if (props.assetId !== undefined) identifier(props.assetId, `${path}.assetId`);
  if (props.crop !== undefined) {
    const crop = record(props.crop, `${path}.crop`);
    for (const key of ['x', 'y', 'w', 'h']) number(crop[key], `${path}.crop.${key}`, 0, 1);
    if ((crop.x as number) + (crop.w as number) > 1 + EPSILON || (crop.y as number) + (crop.h as number) > 1 + EPSILON || crop.w === 0 || crop.h === 0) fail(`${path}.crop`, '裁切区域超出图片范围');
  }
  if (props.messages !== undefined) {
    if (!Array.isArray(props.messages) || props.messages.length > 2_000) fail(`${path}.messages`, '对话列表无效或过长');
    props.messages.forEach((message, index) => {
      const item = record(message, `${path}.messages[${index}]`);
      if (!['user', 'assistant', 'system'].includes(item.role as string)) fail(`${path}.messages[${index}].role`, '角色无效');
      string(item.content, `${path}.messages[${index}].content`, DOCUMENT_LIMITS.stringLength, true);
    });
  }
}

function validateStyle(value: unknown, path: string): ShapeStyle {
  const style = record(value, path);
  for (const key of ['stroke', 'fill']) {
    const color = string(style[key], `${path}.${key}`, 100);
    if (!/^(?:#[\da-f]{3,8}|[a-z]{1,30}|(?:rgb|hsl)a?\([\d\s.,%+\-/deg]+\))$/i.test(color)) fail(`${path}.${key}`, '必须是安全的 CSS 颜色');
  }
  number(style.strokeWidth, `${path}.strokeWidth`, 0, 100);
  number(style.fontSize, `${path}.fontSize`, 1, 1_000);
  number(style.opacity, `${path}.opacity`, 0, 1);
  if (typeof style.dash !== 'boolean') fail(`${path}.dash`, '必须是布尔值');
  return style as ShapeStyle;
}

function validateBinding(value: unknown, path: string): Binding {
  const binding = record(value, path);
  identifier(binding.shapeId, `${path}.shapeId`);
  const anchor = record(binding.anchor, `${path}.anchor`);
  number(anchor.x, `${path}.anchor.x`, 0, 1);
  number(anchor.y, `${path}.anchor.y`, 0, 1);
  return binding as Binding;
}

export function validateDocument(input: unknown): BoardDocument {
  const document = record(cloneData(input), 'document');
  if (document.format !== 'oneworker-whiteboard' || document.version !== 2) fail('document', '不支持的格式或版本（需要 oneworker-whiteboard v2）');
  identifier(document.id, 'document.id');
  string(document.name, 'document.name', 500, true);
  identifier(document.currentPageId, 'document.currentPageId');
  if (!Array.isArray(document.pages) || document.pages.length < 1 || document.pages.length > DOCUMENT_LIMITS.pages) fail('document.pages', `页面数必须为 1–${DOCUMENT_LIMITS.pages}`);
  const pageIds = new Set<string>(); const shapeIds = new Set<string>();
  let shapeCount = 0; let pointCount = 0;
  document.pages.forEach((pageValue, pageIndex) => {
    const path = `pages[${pageIndex}]`;
    const page = record(pageValue, path);
    const pageId = identifier(page.id, `${path}.id`);
    if (pageIds.has(pageId)) fail(`${path}.id`, '页面 ID 重复');
    pageIds.add(pageId);
    string(page.name, `${path}.name`, 500, true);
    if (page.assistantAppliedRequests !== undefined) {
      if (!Array.isArray(page.assistantAppliedRequests) || page.assistantAppliedRequests.length > 1000)
        fail(`${path}.assistantAppliedRequests`, 'AI 操作回执必须为不超过 1000 条的数组');
      page.assistantAppliedRequests.forEach((id, index) => identifier(id, `${path}.assistantAppliedRequests[${index}]`));
    }
    const camera = record(page.camera, `${path}.camera`);
    number(camera.x, `${path}.camera.x`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
    number(camera.y, `${path}.camera.y`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
    number(camera.zoom, `${path}.camera.zoom`, MIN_ZOOM, MAX_ZOOM);
    if (!Array.isArray(page.shapes)) fail(`${path}.shapes`, '必须是图形数组');
    shapeCount += page.shapes.length;
    if (shapeCount > DOCUMENT_LIMITS.shapes) fail(`${path}.shapes`, `图形总数超过 ${DOCUMENT_LIMITS.shapes}`);
    const byId = new Map<string, BoardShape>();
    page.shapes.forEach((shapeValue, shapeIndex) => {
      const shapePath = `${path}.shapes[${shapeIndex}]`;
      const shape = record(shapeValue, shapePath);
      const id = identifier(shape.id, `${shapePath}.id`);
      if (shapeIds.has(id)) fail(`${shapePath}.id`, '图形 ID 重复');
      shapeIds.add(id);
      if (!SHAPE_TYPES.includes(shape.type as ShapeType)) fail(`${shapePath}.type`, '不支持的图形类型');
      for (const key of ['x', 'y']) number(shape[key], `${shapePath}.${key}`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
      for (const key of ['w', 'h']) number(shape[key], `${shapePath}.${key}`, 0.01, DOCUMENT_LIMITS.dimension);
      number(shape.rotation, `${shapePath}.rotation`, -360_000, 360_000);
      if (shape.cardScale !== undefined) {
        if (!CARD_TYPES.includes(shape.type as ShapeType)) fail(`${shapePath}.cardScale`, '只有产品卡片支持内容缩放');
        number(shape.cardScale, `${shapePath}.cardScale`, MIN_CARD_SCALE, MAX_CARD_SCALE);
      }
      validateStyle(shape.style, `${shapePath}.style`);
      validateProps(record(shape.props, `${shapePath}.props`) as ShapeProps, `${shapePath}.props`);
      if (shape.locked !== undefined && typeof shape.locked !== 'boolean') fail(`${shapePath}.locked`, '必须是布尔值');
      for (const key of ['groupId', 'parentId']) if (shape[key] !== undefined) identifier(shape[key], `${shapePath}.${key}`);
      for (const key of ['startBinding', 'endBinding']) {
        if (shape[key] !== undefined) {
          if (shape.type !== 'arrow' && shape.type !== 'line') fail(`${shapePath}.${key}`, '只有连接线支持绑定');
          validateBinding(shape[key], `${shapePath}.${key}`);
        }
      }
      if (shape.points !== undefined) {
        if (!Array.isArray(shape.points) || shape.points.length < 1 || shape.points.length > DOCUMENT_LIMITS.pointsPerShape) fail(`${shapePath}.points`, '点数量无效或过多');
        pointCount += shape.points.length;
        if (pointCount > DOCUMENT_LIMITS.points) fail(`${shapePath}.points`, '笔画点总数过多');
        shape.points.forEach((pointValue, pointIndex) => {
          const point = record(pointValue, `${shapePath}.points[${pointIndex}]`);
          for (const key of ['x', 'y']) number(point[key], `${shapePath}.points[${pointIndex}].${key}`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate);
          if (point.pressure !== undefined) number(point.pressure, `${shapePath}.points[${pointIndex}].pressure`, 0, 1);
        });
      }
      byId.set(id, shape as BoardShape);
    });
    for (const shape of byId.values()) {
      if (shape.groupId && byId.has(shape.groupId)) fail(`${path}.${shape.id}.groupId`, '分组 ID 不能引用图形（分组不是父子关系）');
      if (shape.parentId && byId.get(shape.parentId)?.type !== 'frame') fail(`${path}.${shape.id}.parentId`, '父级必须是同页存在的框架');
      for (const key of ['startBinding', 'endBinding'] as const) {
        const binding = shape[key];
        if (binding && (binding.shapeId === shape.id || !byId.has(binding.shapeId))) fail(`${path}.${shape.id}.${key}`, '绑定目标不存在或指向自身');
      }
    }
    // Linear-time parent-cycle check; no recursion even on a hostile long frame chain.
    const complete = new Set<string>();
    for (const shape of byId.values()) {
      const chain = new Set<string>();
      let current: BoardShape | undefined = shape;
      while (current && !complete.has(current.id)) {
        if (chain.has(current.id)) fail(`${path}.${current.id}.parentId`, '框架存在循环父子关系');
        chain.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      for (const id of chain) complete.add(id);
    }
  });
  if (!pageIds.has(document.currentPageId as string)) fail('document.currentPageId', '当前页面不存在');
  return document as BoardDocument;
}

/** Reads the old app's shape array without modifying the input or old storage key. */
export function migrateLegacyShapes(input: unknown): BoardDocument {
  const cloned = cloneData(input);
  if (cloned && !Array.isArray(cloned) && typeof cloned === 'object' && 'format' in cloned) return validateDocument(cloned);
  const source = Array.isArray(cloned) ? cloned : record(cloned, 'legacy').shapes;
  if (!Array.isArray(source) || source.length > DOCUMENT_LIMITS.shapes) fail('legacy.shapes', '旧白板必须是有效的图形数组');
  const document = createDocument();
  document.name = '迁移的白板';
  document.pages[0].shapes = source.map((inputShape, index) => {
    const path = `legacy.shapes[${index}]`;
    const old = record(inputShape, path);
    if (!['preview_html', 'ai_result', 'math_quiz'].includes(old.type as string)) fail(`${path}.type`, '不支持的旧版图形类型');
    const props = record(old.props, `${path}.props`) as ShapeProps;
    const coursewareId = old.type === 'preview_html' && props.publishedCoursewareId === 'cao-chong' ? 'cao-chong' : undefined;
    const shape = createShape(coursewareId ? 'embed' : old.type as ShapeType,
      number(old.x, `${path}.x`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate),
      number(old.y, `${path}.y`, -DOCUMENT_LIMITS.coordinate, DOCUMENT_LIMITS.coordinate),
      coursewareId ? { coursewareId, title: '曹冲称象' } : props);
    shape.id = identifier(old.id, `${path}.id`);
    if (props.w !== undefined) shape.w = number(props.w, `${path}.props.w`, 0.01, DOCUMENT_LIMITS.dimension);
    if (props.h !== undefined) shape.h = number(props.h, `${path}.props.h`, 0.01, DOCUMENT_LIMITS.dimension);
    return shape;
  });
  return validateDocument(document);
}
