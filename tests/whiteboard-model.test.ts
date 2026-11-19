import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DOCUMENT_LIMITS,
  adoptFrameContents,
  alignShapes,
  createDocument,
  createId,
  createShape,
  detachShapeBindings,
  duplicateShapes,
  getBoundPoint,
  getSelectionBounds,
  getShapeBounds,
  hitTest,
  migrateLegacyShapes,
  resizeShapes,
  resolveArrowPoints,
  rotateShapes,
  scaleShapesFromHandle,
  screenToWorld,
  selectionClosure,
  selectionHasResizableCard,
  translateShapes,
  validateDocument,
  worldToScreen,
  zoomAt,
} from '../src/components/own-whiteboard/core/model';
import { SHAPE_TYPES, type BoardShape, type Bounds, type Point } from '../src/components/own-whiteboard/core/types';

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `expected ${actual} to be approximately ${expected}`);
}

function nearPoint(actual: Point | undefined, expected: Point) {
  assert.ok(actual);
  near(actual.x, expected.x);
  near(actual.y, expected.y);
}

function nearBounds(actual: Bounds | null, expected: Bounds) {
  assert.ok(actual);
  nearPoint(actual, expected);
  near(actual.w, expected.w);
  near(actual.h, expected.h);
}

function rect(id: string, x = 0, y = 0, w = 100, h = 50): BoardShape {
  return { ...createShape('rectangle', x, y), id, w, h };
}

function documentWith(...shapes: BoardShape[]) {
  const document = createDocument();
  document.pages[0].shapes = shapes;
  return document;
}

test('factory creates every supported type and an independently mutable document', () => {
  assert.equal(new Set(Array.from({ length: 300 }, () => createId())).size, 300);
  for (const type of SHAPE_TYPES) {
    const shape = createShape(type, 5, 7);
    assert.equal(shape.type, type);
    assert.ok(shape.w > 0 && shape.h > 0);
    validateDocument(documentWith(shape));
  }
  const first = createShape('note', 0, 0);
  const second = createShape('note', 0, 0);
  first.style.stroke = 'red';
  assert.notEqual(first.style.stroke, second.style.stroke);
  const props = { text: 'hello', metadata: { labels: ['a'] } };
  const shape = createShape('text', 0, 0, props);
  (shape.props.metadata as { labels: string[] }).labels.push('b');
  assert.deepEqual(props.metadata.labels, ['a']);
});

test('camera world/screen mapping round trips and zoom anchors stay stationary', () => {
  const camera = { x: -120, y: 75, zoom: 1.8 };
  const world = { x: -88, y: 312 };
  nearPoint(screenToWorld(worldToScreen(world, camera), camera), world);
  const cursor = { x: 350, y: 140 };
  const anchored = screenToWorld(cursor, camera);
  for (const zoom of [0.05, 0.2, 1, 8]) {
    nearPoint(worldToScreen(anchored, zoomAt(camera, cursor, zoom)), cursor);
  }
  assert.equal(zoomAt(camera, cursor, 0).zoom, 0.05);
  assert.equal(zoomAt(camera, cursor, Infinity).zoom, camera.zoom);
  assert.equal(zoomAt(camera, cursor, 100).zoom, 8);
});

test('bounds include rotation and empty selections are null', () => {
  const shape = { ...rect('r', 10, 20, 100, 40), rotation: 90 };
  nearBounds(getShapeBounds(shape), { x: 40, y: -10, w: 40, h: 100 });
  nearBounds(getSelectionBounds([shape, rect('s', 100, 100, 10, 10)]), { x: 40, y: -10, w: 70, h: 120 });
  assert.equal(getSelectionBounds([]), null);
  const ellipse = { ...shape, type: 'ellipse' as const, rotation: 45 };
  const bound = getShapeBounds(ellipse);
  near(bound.w, Math.sqrt(5800));
  near(bound.h, Math.sqrt(5800));
});

test('draw geometry uses local points and precise strokes, not their bounding rectangle', () => {
  const shape: BoardShape = { ...createShape('draw', 100, 200), w: 100, h: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] };
  nearBounds(getShapeBounds(shape), { x: 100, y: 200, w: 100, h: 100 });
  assert.equal(hitTest(shape, { x: 150, y: 250 }, 1), true);
  assert.equal(hitTest(shape, { x: 150, y: 205 }, 1), false);
  const dot = { ...shape, points: [{ x: 0, y: 0 }] };
  assert.equal(hitTest(dot, { x: 100, y: 200 }), true);
  assert.equal(hitTest(dot, { x: 200, y: 200 }), false);
});

test('hit testing rotates into local space and respects ellipse, triangle and diamond geometry', () => {
  const shape = { ...rect('r', 0, 0, 100, 20), rotation: 90 };
  assert.equal(hitTest(shape, { x: 50, y: 50 }, 0), true);
  assert.equal(hitTest(shape, { x: 90, y: 10 }, 0), false);
  for (const type of ['ellipse', 'triangle', 'diamond'] as const) {
    const polygon = { ...rect(type, 0, 0, 100, 100), type };
    assert.equal(hitTest(polygon, { x: 50, y: 50 }, 0), true, type);
    assert.equal(hitTest(polygon, { x: 2, y: 2 }, 0), false, type);
  }
});

test('frame interior does not intercept children but caption and borders do', () => {
  const frame = { ...rect('frame'), type: 'frame' as const };
  assert.equal(hitTest(frame, { x: 50, y: 25 }, 1), false);
  assert.equal(hitTest(frame, { x: 50, y: -15 }, 1), true);
  assert.equal(hitTest(frame, { x: 0, y: 25 }, 1), true);
});

test('bindings use normalized anchors in rotated target space and survive target moves', () => {
  const target = { ...rect('target', 10, 20, 100, 40), rotation: 90 };
  const arrow = createShape('arrow', 0, 0);
  arrow.endBinding = { shapeId: target.id, anchor: { x: 1, y: 0.5 } };
  nearPoint(getBoundPoint(arrow.endBinding, [target]), { x: 60, y: 90 });
  nearPoint(resolveArrowPoints(arrow, [target])[1], { x: 60, y: 90 });
  const moved = translateShapes([target, arrow], [target.id], 50, -10);
  nearPoint(resolveArrowPoints(moved[1], moved)[1], { x: 110, y: 80 });
  nearPoint(resolveArrowPoints(arrow, [])[1], { x: 200, y: 0 });
  assert.equal(getBoundPoint({ shapeId: 'missing', anchor: { x: 0, y: 0 } }, [target]), undefined);
});

test('bound arrows compute full world bounds and hit their resolved geometry', () => {
  const target = rect('target', 500, 100);
  const arrow = createShape('arrow', 0, 0);
  arrow.endBinding = { shapeId: target.id, anchor: { x: 0, y: 0 } };
  nearBounds(getShapeBounds(arrow, [arrow, target]), { x: 0, y: 0, w: 500, h: 100 });
  assert.equal(hitTest(arrow, { x: 250, y: 50 }, 1, [arrow, target]), true);
  assert.equal(hitTest(arrow, { x: 250, y: 0 }, 1, [arrow, target]), false);
  const rotated = { ...arrow, endBinding: undefined, rotation: 90 };
  nearPoint(resolveArrowPoints(rotated, [])[0], { x: 100.5, y: -99.5 });
  nearPoint(resolveArrowPoints(rotated, [])[1], { x: 100.5, y: 100.5 });
});

test('detaching bindings bakes resolved endpoints in rotated local space without moving the line', () => {
  const start = { ...rect('start', 500, 100, 80, 120), rotation: 23 };
  const end = { ...rect('end', -100, 400, 100, 60), rotation: -45 };
  const arrow = {
    ...createShape('arrow', 30, -60),
    rotation: 71,
    points: [{ x: 0, y: 0 }, { x: 80, y: 50 }, { x: 200, y: 0 }],
    startBinding: { shapeId: start.id, anchor: { x: 1, y: 0.4 } },
    endBinding: { shapeId: end.id, anchor: { x: 0.1, y: 0.6 } },
  };
  const shapes = [start, end, arrow];
  const before = resolveArrowPoints(arrow, shapes);
  const detached = detachShapeBindings(arrow, shapes, new Set([start.id]));
  const remaining = [end, detached];
  assert.equal(detached.rotation, 71);
  assert.equal(detached.startBinding, undefined);
  assert.deepEqual(detached.endBinding, arrow.endBinding);
  resolveArrowPoints(detached, remaining).forEach((point, index) => nearPoint(point, before[index]));
  const movedEnd = translateShapes(remaining, [end.id], 50, 20);
  nearPoint(resolveArrowPoints(movedEnd[1], movedEnd)[0], before[0]);
  nearPoint(resolveArrowPoints(movedEnd[1], movedEnd)[2], { x: before[2].x + 50, y: before[2].y + 20 });
  assert.deepEqual(arrow.points, [{ x: 0, y: 0 }, { x: 80, y: 50 }, { x: 200, y: 0 }]);
  assert.ok(arrow.startBinding);
});

test('copying a bound arrow alone preserves geometry after detaching and duplicate offset', () => {
  const target = rect('target', 500, 100);
  const arrow = { ...createShape('arrow', 0, 0), endBinding: { shapeId: target.id, anchor: { x: 0, y: 0 } } };
  const detached = detachShapeBindings(arrow, [target, arrow], new Set([target.id]));
  const pasted = duplicateShapes([detached], [detached.id], { x: 24, y: 24 });
  const copy = pasted.shapes.find((shape) => pasted.ids.includes(shape.id))!;
  nearPoint(resolveArrowPoints(copy, [copy])[1], { x: 524, y: 124 });
  assert.equal(detachShapeBindings(arrow, [target, arrow], new Set()), arrow);
});

test('selection closure includes grouped peers and nested frames exactly once', () => {
  const frame = { ...rect('f'), type: 'frame' as const, groupId: 'g' };
  const child = { ...rect('child'), parentId: 'f' };
  const nested = { ...rect('nested'), type: 'frame' as const, parentId: 'f' };
  const grandchild = { ...rect('grandchild'), parentId: 'nested', groupId: 'other-group' };
  const otherPeer = { ...rect('peer'), groupId: 'other-group' };
  const groupPeer = { ...rect('groupPeer'), groupId: 'g' };
  const outsider = rect('outsider');
  const shapes = [frame, child, nested, grandchild, otherPeer, groupPeer, outsider];
  assert.deepEqual(selectionClosure(shapes, ['groupPeer', 'f', 'missing']), ['f', 'child', 'nested', 'grandchild', 'peer', 'groupPeer']);
  assert.deepEqual(selectionClosure(shapes, ['child']), ['child']);
  const moved = translateShapes(shapes, ['groupPeer'], 15, 20);
  for (let index = 0; index < shapes.length - 1; index++) nearPoint(moved[index], { x: 15, y: 20 });
  assert.equal(moved[6], outsider);
  assert.equal(child.x, 0);
});

test('new outer frame preserves existing nested ownership and inner-frame movement', () => {
  const inner = { ...rect('inner', 100, 100, 200, 200), type: 'frame' as const };
  const child = { ...rect('child', 120, 120, 50, 50), parentId: inner.id };
  const outer = { ...rect('outer', 0, 0, 500, 500), type: 'frame' as const };
  const original = [inner, child, outer];
  const adopted = adoptFrameContents(original, outer.id);
  assert.equal(adopted[0].parentId, outer.id);
  assert.equal(adopted[1].parentId, inner.id);
  assert.deepEqual(selectionClosure(adopted, [inner.id]), ['inner', 'child']);
  assert.deepEqual(selectionClosure(adopted, [outer.id]), ['inner', 'child', 'outer']);
  nearPoint(translateShapes(adopted, [inner.id], 50, 10)[1], { x: 170, y: 130 });
  assert.equal(original[0].parentId, undefined);
  validateDocument(documentWith(...adopted));
});

test('new inner frame attaches to nearest parent while adopting only its own contents', () => {
  const outer = { ...rect('outer', 0, 0, 800, 800), type: 'frame' as const };
  const middle = { ...rect('middle', 50, 50, 600, 600), type: 'frame' as const, parentId: outer.id };
  const inside = { ...rect('inside', 120, 120, 50, 50), parentId: middle.id };
  const outside = { ...rect('outside', 500, 500, 50, 50), parentId: middle.id };
  const inner = { ...rect('inner', 100, 100, 200, 200), type: 'frame' as const };
  const adopted = adoptFrameContents([outer, middle, inside, outside, inner], inner.id);
  assert.equal(adopted[2].parentId, inner.id);
  assert.equal(adopted[3].parentId, middle.id);
  assert.equal(adopted[4].parentId, middle.id);
  validateDocument(documentWith(...adopted));
});

test('frame adoption keeps locked ownership and cannot create equal-bounds cycles', () => {
  const inner = { ...rect('inner', 100, 100, 200, 200), type: 'frame' as const, locked: true };
  const child = { ...rect('child', 120, 120, 50, 50), parentId: inner.id };
  const outer = { ...rect('outer', 0, 0, 500, 500), type: 'frame' as const };
  const adopted = adoptFrameContents([inner, child, outer], outer.id);
  assert.equal(adopted[0].parentId, undefined);
  assert.equal(adopted[1].parentId, inner.id);
  const sameSize = { ...outer, id: 'other' };
  validateDocument(documentWith(...adoptFrameContents([outer, sameSize], sameSize.id)));
});

test('locked direct selections do not transform, locked frame contents travel with their frame', () => {
  const locked = { ...rect('locked'), locked: true };
  nearPoint(translateShapes([locked], [locked.id], 50, 50)[0], { x: 0, y: 0 });
  const frame = { ...rect('f'), type: 'frame' as const };
  const child = { ...locked, parentId: 'f' };
  nearPoint(translateShapes([frame, child], ['f'], 50, 50)[1], { x: 50, y: 50 });
});

test('resize scales positions, dimensions and local stroke points without input mutation', () => {
  const shape = { ...createShape('draw', 10, 20), w: 100, h: 50, points: [{ x: 0, y: 0, pressure: 0.3 }, { x: 100, y: 50, pressure: 0.8 }] };
  const output = resizeShapes([shape], [shape.id], { x: 10, y: 20, w: 100, h: 50 }, { x: 30, y: 40, w: 200, h: 200 })[0];
  nearBounds(output, { x: 30, y: 40, w: 200, h: 200 });
  assert.deepEqual(output.points, [{ x: 0, y: 0, pressure: 0.3 }, { x: 200, y: 200, pressure: 0.8 }]);
  assert.equal(shape.points[1].x, 100);
  assert.equal(shape.x, 10);
  const flat = { ...shape, h: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const resizedFlat = resizeShapes([flat], [flat.id], { x: 10, y: 20, w: 100, h: 0 }, { x: 30, y: 40, w: 200, h: 0 })[0];
  assert.ok(Number.isFinite(resizedFlat.y));
});

test('card corner resizing projects an off-diagonal drag onto one scale and preserves layout through serialization', () => {
  const card = createShape('preview_html', 50, 90, { title: 'Test' });
  const [scaled] = scaleShapesFromHandle([card], [card.id], card, 'se', { x: 160, y: 0 });
  const scale = 1 + (160 * card.w) / (card.w ** 2 + card.h ** 2);
  nearBounds(scaled, { ...card, w: card.w * scale, h: card.h * scale });
  near(scaled.cardScale!, scale);
  const [reloaded] = validateDocument(JSON.parse(JSON.stringify(documentWith(scaled)))).pages[0].shapes;
  near(reloaded.w / reloaded.cardScale!, card.w);
  near(reloaded.h / reloaded.cardScale!, card.h);
  assert.equal(card.cardScale, undefined);
  assert.equal(reloaded.rotation, card.rotation);
});

test('a rotated card scales about the opposite edge midpoint, preserving its angle and its contents', () => {
  const card = { ...createShape('blog_post', 100, 120), rotation: 30, cardScale: 2 };
  const b = getShapeBounds(card);
  const [scaled] = scaleShapesFromHandle([card], [card.id], b, 'w', { x: -b.w / 2, y: 99 });
  const result = getShapeBounds(scaled);
  nearBounds(result, { x: b.x - b.w / 2, y: b.y - b.h / 4, w: b.w * 1.5, h: b.h * 1.5 });
  assert.equal(scaled.rotation, 30);
  near(scaled.cardScale!, 3);
  near(scaled.h / scaled.cardScale!, card.h / card.cardScale);
});

test('card scale clamps before flipping and also applies when resizing an enclosing frame', () => {
  const frame = createShape('frame', 20, 30);
  const card = { ...createShape('blog_post', 100, 100), parentId: frame.id, locked: true };
  assert.equal(selectionHasResizableCard([frame, card], [frame.id]), true);
  assert.equal(selectionHasResizableCard([frame, card], [card.id]), false);
  const shapes = scaleShapesFromHandle([frame, card], [frame.id], frame, 'se', { x: -4000, y: -3000 });
  near(shapes[0].w / frame.w, 0.125);
  near(shapes[1].cardScale!, 0.125);
  near(shapes[1].w / card.w, shapes[1].h / card.h);
  validateDocument(documentWith(...shapes));
  assert.throws(() => validateDocument(documentWith({ ...card, parentId: undefined, cardScale: 0 })), /cardScale/);
});

test('rotation moves shape centers around the selection center and normalizes degrees', () => {
  const shape = rect('a', 100, 0, 20, 20);
  const rotated = rotateShapes([shape], ['a'], 90, { x: 0, y: 0 })[0];
  nearPoint(rotated, { x: -20, y: 100 });
  assert.equal(rotated.rotation, 90);
  assert.equal(rotateShapes([shape], ['a'], -90, { x: 0, y: 0 })[0].rotation, 270);
  assert.equal(shape.rotation, 0);
});

test('anisotropic resizing honors quarter-turned axes and maps rotated path points exactly', () => {
  const box = { ...rect('box', 0, 0, 100, 40), rotation: 90 };
  const before = getShapeBounds(box);
  const after = { x: before.x + 15, y: before.y - 25, w: before.w * 2, h: before.h * 3 };
  const resized = resizeShapes([box], [box.id], before, after)[0];
  nearBounds(getShapeBounds(resized), after);
  const line = { ...createShape('line', 50, 90), rotation: 37, w: 100, h: 70, points: [{ x: 0, y: 0 }, { x: 60, y: 30 }, { x: 100, y: 70 }] };
  const lineBounds = getShapeBounds(line);
  const nextBounds = { x: 5, y: 10, w: lineBounds.w * 2, h: lineBounds.h * 3 };
  const nextLine = resizeShapes([line], [line.id], lineBounds, nextBounds)[0];
  const beforePoints = resolveArrowPoints(line, []);
  const afterPoints = resolveArrowPoints(nextLine, []);
  beforePoints.forEach((point, index) => nearPoint(afterPoints[index], {
    x: nextBounds.x + (point.x - lineBounds.x) * 2,
    y: nextBounds.y + (point.y - lineBounds.y) * 3,
  }));
});

test('alignment supports every edge and center', () => {
  const shapes = [rect('a', 10, 20, 40, 30), rect('b', 100, 110, 70, 60)];
  const ids = shapes.map((shape) => shape.id);
  for (const mode of ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const) {
    const [a, b] = alignShapes(shapes, ids, mode).map((shape) => getShapeBounds(shape));
    if (mode === 'left') near(a.x, b.x);
    if (mode === 'center') near(a.x + a.w / 2, b.x + b.w / 2);
    if (mode === 'right') near(a.x + a.w, b.x + b.w);
    if (mode === 'top') near(a.y, b.y);
    if (mode === 'middle') near(a.y + a.h / 2, b.y + b.h / 2);
    if (mode === 'bottom') near(a.y + a.h, b.y + b.h);
  }
  assert.equal(shapes[0].x, 10);
});

test('alignment moves groups as units and distribution gives equal edge gaps', () => {
  const a = { ...rect('a', 0, 0, 20, 20), groupId: 'g' };
  const b = { ...rect('b', 40, 20, 20, 20), groupId: 'g' };
  const c = rect('c', 200, 100, 30, 30);
  const aligned = alignShapes([a, b, c], ['a', 'b', 'c'], 'left');
  near(aligned[1].x - aligned[0].x, 40);
  near(aligned[2].x, 0);
  for (const mode of ['horizontal', 'vertical'] as const) {
    const original = [rect('a', 0, 0, 20, 20), rect('b', 30, 30, 40, 40), rect('c', 200, 200, 30, 30)];
    const [first, middle, last] = alignShapes(original, ['c', 'a', 'b'], mode);
    if (mode === 'horizontal') near(middle.x - first.x - first.w, last.x - middle.x - middle.w);
    else near(middle.y - first.y - first.h, last.y - middle.y - middle.h);
    nearPoint(first, { x: 0, y: 0 });
    nearPoint(last, { x: 200, y: 200 });
  }
});

test('duplication deeply clones and remaps group, frame and internal connector relations', () => {
  const frame = { ...rect('f', 10, 20), type: 'frame' as const, groupId: 'g' };
  const target = { ...rect('t', 20, 30), parentId: 'f', props: { metadata: { labels: ['original'] } } };
  const arrow = { ...createShape('arrow', 0, 0), id: 'a', groupId: 'g', startBinding: { shapeId: 't', anchor: { x: 0, y: 0 } }, endBinding: { shapeId: 'external', anchor: { x: 1, y: 1 } } };
  const external = rect('external');
  const source = [frame, target, arrow, external];
  const result = duplicateShapes(source, ['f'], { x: 50, y: -10 });
  assert.equal(result.shapes.length, 7);
  assert.equal(result.ids.length, 3);
  const [frameCopy, targetCopy, arrowCopy] = result.shapes.slice(4);
  assert.equal(targetCopy.parentId, frameCopy.id);
  assert.equal(arrowCopy.startBinding?.shapeId, targetCopy.id);
  assert.equal(arrowCopy.endBinding?.shapeId, 'external');
  assert.equal(frameCopy.groupId, arrowCopy.groupId);
  assert.notEqual(frameCopy.groupId, frame.groupId);
  nearPoint(frameCopy, { x: 60, y: 10 });
  (targetCopy.props.metadata as { labels: string[] }).labels.push('copy');
  assert.deepEqual(target.props.metadata.labels, ['original']);
  arrowCopy.startBinding!.anchor.x = 0.5;
  assert.equal(arrow.startBinding.anchor.x, 0);
  validateDocument(documentWith(...result.shapes));
});

test('duplicated video analyzers select the copied video while external references stay intact', () => {
  const video = { ...createShape('video_player', 0, 0), id: 'video:original' };
  const analyzer = { ...createShape('ai_video_analyzer', 500, 0, { videoId: video.id, result: 'saved analysis' }), id: 'analyzer:original' };
  const duplicated = duplicateShapes([video, analyzer], [video.id, analyzer.id]);
  const [copiedVideo, copiedAnalyzer] = duplicated.shapes.slice(2);
  assert.equal(copiedAnalyzer.props.videoId, copiedVideo.id);
  assert.notEqual(copiedAnalyzer.props.videoId, video.id);
  assert.equal(copiedAnalyzer.props.result, 'saved analysis');
  assert.equal(analyzer.props.videoId, video.id);
  validateDocument(documentWith(copiedVideo, copiedAnalyzer));
  const onlyAnalyzer = duplicateShapes([video, analyzer], [analyzer.id]);
  assert.equal(onlyAnalyzer.shapes.at(-1)!.props.videoId, video.id);
});

test('valid document returns a deep safe clone and retains app-specific metadata', () => {
  const shape = createShape('preview_html', 0, 0, { html: '<script>interactive content</script>', custom: { state: [1, true, null] } });
  const input = documentWith(shape);
  const output = validateDocument(input);
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
  assert.notEqual(output.pages[0].shapes[0].props.custom, shape.props.custom);
  assert.equal(output.pages[0].shapes[0].props.html, shape.props.html);
});

test('validation rejects missing current page, duplicate IDs, unknown types and versions', () => {
  const document = documentWith(rect('a'));
  assert.throws(() => validateDocument({ ...document, version: 99 }), /版本/);
  assert.throws(() => validateDocument({ ...document, currentPageId: 'missing' }), /当前页面/);
  assert.throws(() => validateDocument(documentWith(rect('a'), rect('a'))), /重复/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), type: 'tldraw-record' as never })), /图形类型/);
  assert.throws(() => validateDocument({ ...document, pages: [document.pages[0], document.pages[0]] }), /重复/);
});

test('validation rejects non-finite numbers and numeric ranges everywhere', () => {
  for (const x of [NaN, Infinity, -Infinity, DOCUMENT_LIMITS.coordinate + 1]) {
    assert.throws(() => validateDocument(documentWith({ ...rect('a'), x })), /有限数字/);
  }
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), w: 0 })), /有限数字/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), style: { ...rect('a').style, opacity: 2 } })), /opacity/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { nested: { invalid: NaN } } })), /有限数字/);
  const document = createDocument();
  document.pages[0].camera.zoom = 0;
  assert.throws(() => validateDocument(document), /zoom/);
});

test('import limits cap pages, shapes, points, string sizes and recursive content', () => {
  const document = createDocument();
  assert.throws(() => validateDocument({ ...document, pages: Array.from({ length: 51 }, (_, i) => ({ ...document.pages[0], id: `page:${i}` })) }), /页面数/);
  const tooManyShapes = Array.from({ length: DOCUMENT_LIMITS.shapes + 1 }, (_, index) => ({ ...rect('a'), id: `s:${index}` }));
  assert.throws(() => validateDocument(documentWith(...tooManyShapes)), /图形总数/);
  const stroke = createShape('draw', 0, 0);
  stroke.points = Array.from({ length: DOCUMENT_LIMITS.pointsPerShape + 1 }, () => ({ x: 0, y: 0 }));
  assert.throws(() => validateDocument(documentWith(stroke)), /点数量/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { text: 'x'.repeat(DOCUMENT_LIMITS.stringLength + 1) } })), /文本数据过大/);
  let deep: unknown = 'leaf';
  for (let i = 0; i < 40; i++) deep = { deep };
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { deep } })), /嵌套层级/);
});

test('validation blocks pollution, accessors, prototypes and circular data without executing them', () => {
  const polluted = JSON.parse(JSON.stringify(documentWith(rect('a'))));
  polluted.pages[0].shapes[0].props = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => validateDocument(polluted), /禁止的属性名/);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  for (const key of ['constructor', 'prototype']) {
    assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { nested: { [key]: {} } } })), /禁止的属性名/);
  }
  let executed = false;
  const props = Object.defineProperty({}, 'text', { enumerable: true, get() { executed = true; return 'bad'; } });
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props })), /访问器/);
  assert.equal(executed, false);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: Object.create({ inherited: true }) })), /自定义原型/);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: cyclic })), /循环引用/);
});

test('URL validation allows HTTP and raster media but rejects script and active content schemes', () => {
  for (const url of ['https://example.com/a', 'http://example.com/a', '/images/a.png', './a.png', '#part', 'data:image/png;base64,aGVsbG8=', 'blob:https://example.com/123']) {
    validateDocument(documentWith({ ...rect('a'), props: { url } }));
  }
  for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'data:image/svg+xml;base64,PHN2Zz4=', '//external.example', '\\external.example', 'file:///etc/passwd', ' https://example.com']) {
    assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { url } })), /URL/, url);
    assert.throws(() => validateDocument(documentWith({ ...rect('a'), props: { metadata: { thumbnailUrl: url } } })), /URL/, url);
  }
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), style: { ...rect('a').style, fill: 'url(https://example.com)' } })), /CSS/);
});

test('validation checks crop bounds, message roles and point pressure', () => {
  validateDocument(documentWith(createShape('image', 0, 0, { crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.7 } })));
  assert.throws(() => createShape('image', 0, 0, { crop: { x: 0.8, y: 0, w: 0.8, h: 1 } }), /裁切/);
  assert.throws(() => createShape('ai_terminal', 0, 0, { messages: [{ role: 'malicious' as never, content: 'a' }] }), /角色/);
  const draw = createShape('draw', 0, 0);
  draw.points![0].pressure = 2;
  assert.throws(() => validateDocument(documentWith(draw)), /pressure/);
});

test('validation rejects orphan bindings, self bindings, invalid parents and frame cycles', () => {
  const arrow = createShape('arrow', 0, 0);
  arrow.startBinding = { shapeId: 'missing', anchor: { x: 0, y: 0 } };
  assert.throws(() => validateDocument(documentWith(arrow)), /绑定目标/);
  arrow.startBinding.shapeId = arrow.id;
  assert.throws(() => validateDocument(documentWith(arrow)), /绑定目标/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), parentId: 'missing' })), /父级/);
  assert.throws(() => validateDocument(documentWith(rect('a'), { ...rect('b'), parentId: 'a' })), /框架/);
  const a = { ...rect('a'), type: 'frame' as const, parentId: 'b' };
  const b = { ...rect('b'), type: 'frame' as const, parentId: 'a' };
  assert.throws(() => validateDocument(documentWith(a, b)), /循环父子/);
  assert.throws(() => validateDocument(documentWith({ ...a, parentId: 'a' })), /循环父子/);
  assert.throws(() => validateDocument(documentWith({ ...rect('a'), groupId: 'a' })), /分组 ID/);
});

test('legacy migration preserves ids, payloads and old dimensions without mutating originals', () => {
  const input = [
    { id: 'shape:original', type: 'preview_html', x: 20, y: 40, props: { w: 600, h: 400, html: '<h1>lesson</h1>', color: '#abc', custom: { progress: 7 } } },
    { id: 'shape:result', type: 'ai_result', x: -20, y: 80, props: { w: 300, h: 200, text: '中文内容' } },
  ];
  const before = JSON.stringify(input);
  const migrated = migrateLegacyShapes(input);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.pages[0].shapes[0].id, input[0].id);
  assert.equal(migrated.pages[0].shapes[0].w, 600);
  assert.equal(migrated.pages[0].shapes[0].h, 400);
  assert.deepEqual(migrated.pages[0].shapes[0].props, input[0].props);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(migrateLegacyShapes(migrated), migrated);
  assert.equal(migrateLegacyShapes([]).pages[0].shapes.length, 0);
  assert.throws(() => migrateLegacyShapes([{ ...input[0], type: 'unknown' }]), /旧版图形类型/);
  assert.throws(() => migrateLegacyShapes([{ ...input[0], props: { ...input[0].props, w: -1 } }]), /有限数字/);
});
