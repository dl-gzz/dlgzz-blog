import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(
  new URL('../public/courseware/zhi-shu/index.html', import.meta.url), 'utf8'
);

// Run the shipped inline handlers against elements declared by the lesson.
// This exercises the same controls as a student without a browser dependency.
function openLesson() {
  function makeNode(markup: string) {
    const attributes = new Map(Array.from(
      markup.matchAll(/\s([\w-]+)="([^"]*)"/g), m => [m[1], m[2]] as const
    ));
    const handlers = new Map<string, () => void>();
    return {
      disabled: /\sdisabled(?=[\s>])/.test(markup),
      hidden: /\shidden(?=[\s>])/.test(markup),
      open: false, value: '', textContent: '', innerHTML: '',
      dataset: {} as Record<string, string>,
      getAttribute: (name: string) => attributes.get(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      addEventListener: (event: string, handler: () => void) => handlers.set(event, handler),
      focus() {},
      dispatch(event: string) { handlers.get(event)?.(); },
    };
  }
  const nodes = new Map(Array.from(
    html.split('<script')[0].matchAll(/<[^!/<][^<>]*\sid="([^"]+)"[^<>]*>/g),
    ([markup, id]) => [id, makeNode(markup)] as const
  ));
  function node(id: string) {
    const n = nodes.get(id);
    assert.ok(n, `missing lesson element: ${id}`);
    return n;
  }
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(source.length, 'the published lesson must ship its control handlers');
  runInNewContext(source.join('\n;\n'), { document: { getElementById: node } });
  function click(id: string) {
    const n = node(id);
    if (!n.disabled && !n.hidden) n.dispatch('click');
  }
  function take(count: number) {
    node('seed-count').value = String(count);
    node('seed-count').dispatch('change');
    click('take-seeds');
  }
  const plot = (i: number) => click(`plot-${i}`);
  const planted = () => [0, 1, 2, 3, 4].filter(
    i => node(`plot-${i}`).getAttribute('aria-pressed') === 'true'
  );
  const stage = () => node('challenge-panel').dataset.stage;
  return { node, click, take, plot, planted, stage };
}

test('students can try zero or too few seedlings and top up without losing trees', () => {
  const { node, click, take, plot, planted, stage } = openLesson();
  assert.equal(node('challenge-panel').hidden, true);
  click('challenge-mode');
  assert.equal(node('explore-panel').hidden, true);
  assert.equal(stage(), 'plan');
  assert.equal(node('seed-count').value, '');
  click('move-gate');
  assert.equal(stage(), 'plan');
  take(0);
  plot(1);
  assert.deepEqual(planted(), []);
  take(3);
  plot(0); // The gate cannot be planted.
  [1, 2, 3, 4].forEach(plot);
  assert.deepEqual(planted(), [1, 2, 3]);
  click('check-layout');
  assert.equal(stage(), 'plant');
  assert.ok(node('challenge-feedback').textContent);
  click('move-gate');
  assert.equal(stage(), 'plant');
  take(4);
  assert.deepEqual(planted(), [1, 2, 3]);
  plot(4);
  click('check-layout');
  assert.equal(stage(), 'ready');
});

test('unused seedlings matter; moving the gate preserves the trees and requires relocating one', () => {
  const { node, click, take, plot, planted, stage } = openLesson();
  click('challenge-mode');
  take(5);
  [1, 2, 3, 4].forEach(plot);
  click('check-layout');
  assert.equal(stage(), 'plant', 'one unused seedling must be returned');
  take(3);
  assert.deepEqual(planted(), [1, 2, 3, 4], 'adjusting stock must never erase planted trees');
  assert.equal(stage(), 'plant');
  take(4);
  click('check-layout');
  assert.equal(stage(), 'ready');
  click('move-gate');
  assert.equal(stage(), 'move');
  assert.deepEqual(planted(), [1, 2, 3, 4]);
  assert.equal(node('plot-4').dataset.gate, 'true');
  assert.match(node('plot-4').innerHTML, /门前有树/);
  assert.equal(node('take-seeds').hidden, true, 'the nursery is closed in the relocation round');
  click('check-layout');
  assert.equal(stage(), 'move', 'the tree in the new entrance still blocks the gate');
  plot(4);
  plot(4); // Once removed it cannot be replanted at the right-hand gate.
  assert.deepEqual(planted(), [1, 2, 3]);
  plot(0);
  click('check-layout');
  assert.deepEqual(planted(), [0, 1, 2, 3]);
  assert.equal(stage(), 'done');
});

test('switching modes preserves both activities and restarting the challenge only resets the game', () => {
  const { node, click, take, plot, planted, stage } = openLesson();
  click('more');
  click('neither');
  const expectedCounts = node('counts').textContent;
  click('challenge-mode');
  take(4);
  plot(2);
  click('explore-mode');
  assert.equal(node('explore-panel').hidden, false);
  assert.equal(node('challenge-panel').hidden, true);
  assert.equal(node('counts').textContent, expectedCounts);
  click('challenge-mode');
  assert.deepEqual(planted(), [2]);
  assert.equal(stage(), 'plant');
  click('restart-challenge');
  assert.equal(stage(), 'plan');
  assert.deepEqual(planted(), []);
  assert.equal(node('seed-count').value, '');
  click('explore-mode');
  assert.equal(node('counts').textContent, expectedCounts);
  assert.equal(node('neither').getAttribute('aria-pressed'), 'true');
});
