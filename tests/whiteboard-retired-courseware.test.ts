import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  coursewareBoardKey,
  findPublishedCourseware,
  getCourseware,
  isRetiredCoursewareId,
} from '../src/lib/courseware-catalog';

test('the retired lesson cannot be launched or discovered from the public catalog', () => {
  assert.equal(getCourseware('zhi-shu'), undefined);
  assert.deepEqual(findPublishedCourseware('直线植树'), []);
  assert.deepEqual(findPublishedCourseware().map(({ id }) => id), ['cao-chong', 'zhi-shu-shi-yan']);
  assert.deepEqual(findPublishedCourseware('植树').map(({ id }) => id), ['zhi-shu-shi-yan']);
});

test('an old bookmark still opens its own saved board namespace, not another lesson', () => {
  assert.equal(isRetiredCoursewareId('zhi-shu'), true);
  assert.equal(isRetiredCoursewareId('zhi-shu-shi-yan'), false);
  assert.equal(coursewareBoardKey('zhi-shu'), 'oneworker-board-v2:courseware:zhi-shu');
  assert.equal(coursewareBoardKey('zhi-shu-shi-yan'), 'oneworker-board-v2:courseware:zhi-shu-shi-yan');
  assert.equal(coursewareBoardKey('unknown'), null);
});

test('only the retired courseware and its dedicated generation endpoint are removed', () => {
  for (const path of ['public/courseware/zhi-shu/index.html', 'src/app/api/whiteboard/tree-lesson-draft/route.ts']) {
    assert.equal(existsSync(new URL('../' + path, import.meta.url)), false);
  }
  const guide = readFileSync(new URL('../content/blog/zhi-shu-wen-ti.zh.mdx', import.meta.url), 'utf8');
  assert.match(guide, /《直线植树》互动课件已下线/);
  assert.doesNotMatch(guide, /^subcategory:\s*"courseware"/m);
  assert.doesNotMatch(guide, /<CoursewareLaunch id="zhi-shu"\s*\/>/);
  assert.match(guide, /<CoursewareLaunch id="zhi-shu-shi-yan"\s*\/>/);
});
