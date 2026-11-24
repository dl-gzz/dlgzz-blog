import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addTreeLessonCopy,
  coursewareSource,
  getCourseware,
  prepareCoursewareBoard,
  treeSettingsForShape,
} from '../src/components/own-whiteboard/core/courseware';
import {
  createDocument,
  createShape,
  validateDocument,
} from '../src/components/own-whiteboard/core/model';

const viewport = { w: 900, h: 680 };
const product = getCourseware('zhi-shu')!;
function fixture() {
  const origin = prepareCoursewareBoard(createDocument(), product, viewport);
  const { document: doc, shapeId } = origin;
  return {
    doc,
    target: { boardId: doc.id, pageId: doc.currentPageId, shapeId },
  };
}
test('confirmation adds a separate configured embed; a persisted board retains both and reopens the published original', () => {
  const { doc, target } = fixture();
  const source = doc.pages[0].shapes[0];
  const fixed = JSON.stringify(source);
  const sibling = createShape('note', source.x + source.w + 36, source.y, {
    text: '备课笔记',
  });
  doc.pages[0].shapes.push(sibling);
  const result = addTreeLessonCopy(
    doc,
    target,
    { road: 30, spacing: 5 },
    viewport
  );
  assert.equal(doc.pages[0].shapes.length, 2);
  const restored = validateDocument(
    JSON.parse(JSON.stringify(result.document))
  );
  const copy = restored.pages[0].shapes.find((s) => s.id === result.shapeId)!;
  assert.ok(copy && copy.id !== source.id && copy.x >= sibling.x + sibling.w);
  assert.deepEqual(treeSettingsForShape(copy), { road: 30, spacing: 5 });
  assert.equal(
    coursewareSource(copy),
    '/courseware/zhi-shu/index.html#road=30&spacing=5'
  );
  assert.deepEqual(treeSettingsForShape(source), { road: 20, spacing: 5 });
  assert.equal(
    JSON.stringify(restored.pages[0].shapes.find((s) => s.id === source.id)),
    fixed
  );
  restored.pages[0].shapes.reverse();
  assert.equal(
    prepareCoursewareBoard(restored, product, viewport).shapeId,
    source.id
  );
  const second = addTreeLessonCopy(
    restored,
    { ...target, shapeId: copy.id },
    { road: 40, spacing: 5 },
    viewport
  );
  assert.equal(second.document.pages[0].shapes.length, 4);
  assert.deepEqual(treeSettingsForShape(copy), { road: 30, spacing: 5 });
});
test('a stale context or invalid model settings cannot create any card', () => {
  const { doc, target } = fixture();
  const original = JSON.stringify(doc);
  for (const mismatch of [
    { boardId: 'other' },
    { pageId: 'other' },
    { shapeId: 'removed' },
  ]) {
    assert.throws(() =>
      addTreeLessonCopy(
        doc,
        { ...target, ...mismatch },
        { road: 30, spacing: 5 },
        viewport
      )
    );
  }
  assert.throws(() =>
    addTreeLessonCopy(doc, target, { src: 'javascript:alert(1)' }, viewport)
  );
  assert.equal(JSON.stringify(doc), original);
});
