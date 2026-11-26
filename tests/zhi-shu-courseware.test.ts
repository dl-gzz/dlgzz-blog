import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  coursewareForShape,
  coursewareWhiteboardHref,
  getCourseware,
  prepareCoursewareBoard,
} from '../src/components/own-whiteboard/core/courseware';
import { createDocument } from '../src/components/own-whiteboard/core/model';
import { findPublishedCourseware } from '../src/lib/courseware-catalog';

const html = readFileSync(
  new URL('../public/courseware/zhi-shu/index.html', import.meta.url),
  'utf8'
);

test('直线植树 can be found, launched from its published guide, and embedded', () => {
  const product = getCourseware('zhi-shu');
  assert.ok(product);
  assert.equal(product.entryHref, '/courseware/zhi-shu/index.html');
  assert.ok(findPublishedCourseware('植树').includes(product));
  for (const query of ['直线植树', '找一下《直线植树》的课件']) {
    assert.deepEqual(findPublishedCourseware(query), [product]);
  }
  assert.equal(coursewareWhiteboardHref(product), '/whiteboard?courseware=zhi-shu');
  const article = readFileSync(
    new URL(`../content${product.articleHref}.zh.mdx`, import.meta.url),
    'utf8'
  );
  assert.match(article, /\npublished: true\n/);
  assert.match(article, /\npremium: false\n/);
  assert.match(article.trimEnd(), /<CoursewareLaunch id="zhi-shu" \/>$/);
  const cover = article.match(/\nimage: "(\/courseware\/zhi-shu\/[^"]+)"/)?.[1];
  assert.ok(cover && existsSync(new URL(`../public${cover}`, import.meta.url)));

  const board = prepareCoursewareBoard(createDocument(), product, {
    w: 900,
    h: 640,
  });
  const card = board.document.pages[0].shapes.find(({ id }) => id === board.shapeId);
  assert.ok(card);
  assert.equal(coursewareForShape(card)?.entryHref, product.entryHref);
});

function openLesson() {
  const buttons = ['less', 'more', 'both', 'left', 'right', 'neither', 'reset'];
  const nodes = new Map(
    [...buttons, 'internal-trees', 'endpoints', 'segments', 'interval-count', 'counts', 'explanation', 'reason']
      .map((id) => [id, {
        innerHTML: '',
        textContent: '' as string | number,
        open: false,
        attributes: new Map<string, string>(),
        events: new Map<string, () => void>(),
        setAttribute(name: string, value: string) {
          this.attributes.set(name, value);
        },
        addEventListener(name: string, handler: () => void) {
          this.events.set(name, handler);
        },
      }])
  );
  for (const id of buttons) {
    const button = html.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0];
    assert.ok(button);
    assert.match(button, / type="button"/);
    assert.doesNotMatch(button, /\s(?:disabled|hidden|inert)(?=[\s=>])/);
  }
  function node(id: string) {
    const value = nodes.get(id);
    assert.ok(value, `unexpected element: ${id}`);
    return value;
  }
  const script = html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  assert.ok(script);
  runInNewContext(script, { document: { getElementById: node } });
  return {
    node,
    click(id: string) {
      const click = node(id).events.get('click');
      assert.ok(click);
      click();
    },
    treeIndexes() {
      const markup = node('internal-trees').innerHTML + node('endpoints').innerHTML;
      return Array.from(markup.matchAll(/data-tree="(\d+)"/g), ([, index]) =>
        Number(index)
      ).sort((a, b) => a - b);
    },
  };
}

test('native controls work immediately, preserve internal trees, and reset the scene', () => {
  const lesson = openLesson();
  const { node, click, treeIndexes } = lesson;
  assert.match(html, /<details id="explanation">/);
  assert.equal(node('explanation').open, false);

  const selections = [
    ['both', true, true],
    ['left', true, false],
    ['right', false, true],
    ['neither', false, false],
  ] as const;

  for (const intervals of [5, 1, 10]) {
    while (Number(node('interval-count').textContent) > intervals) click('less');
    while (Number(node('interval-count').textContent) < intervals) click('more');
    const segments = node('segments').innerHTML;
    assert.equal([...segments.matchAll(/data-segment=/g)].length, intervals);
    const internalTrees = node('internal-trees').innerHTML;
    assert.equal([...internalTrees.matchAll(/data-tree=/g)].length, intervals - 1);

    for (const [mode, left, right] of selections) {
      click(mode);
      const count = intervals - 1 + Number(left) + Number(right);
      assert.equal(node('interval-count').textContent, intervals);
      assert.equal(node('segments').innerHTML, segments);
      assert.equal(node('internal-trees').innerHTML, internalTrees);
      assert.equal(treeIndexes().includes(0), left);
      assert.equal(treeIndexes().includes(intervals), right);
      assert.equal(treeIndexes().length, count);
      assert.equal(node('counts').textContent, `${count} 棵树 · ${intervals} 段间隔`);
      for (const [id] of selections) {
        assert.equal(node(id).attributes.get('aria-pressed'), String(id === mode));
      }
      if (intervals === 1 && mode === 'neither') {
        assert.match(node('endpoints').innerHTML, /data-empty-end="0".*data-empty-end="1"/);
        assert.match(node('reason').textContent as string, /0 \+ 0 = 0 棵/);
        click('less');
        assert.equal(node('segments').innerHTML, segments);
      }
    }
  }
  click('more');
  assert.equal(node('interval-count').textContent, 10);
  node('explanation').open = true;
  click('reset');
  assert.equal(node('explanation').open, false);
  assert.equal(node('both').attributes.get('aria-pressed'), 'true');
  assert.equal(node('interval-count').textContent, 5);
  assert.deepEqual(treeIndexes(), [0, 1, 2, 3, 4, 5]);
  assert.equal([...node('segments').innerHTML.matchAll(/data-segment=/g)].length, 5);
  assert.equal(node('counts').textContent, '6 棵树 · 5 段间隔');
});
