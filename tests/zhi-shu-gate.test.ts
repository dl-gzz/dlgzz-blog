import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(
  new URL('../public/courseware/zhi-shu/index.html', import.meta.url), 'utf8'
);

// Run the shipped inline handlers against elements declared by the lesson.
// This exercises the same controls as a student without a browser dependency.
function openLesson(hash = '') {
  const markupIds = /<[^!/<][^<>]*\sid="([^"]+)"[^<>]*>/g;
  function makeNode(markup: string) {
    const attributes = new Map(Array.from(
      markup.matchAll(/\s([\w-]+)="([^"]*)"/g), m => [m[1], m[2]] as const
    ));
    const handlers = new Map<string, () => void>();
    let content = '';
    return {
      disabled: /\sdisabled(?=[\s>])/.test(markup),
      hidden: /\shidden(?=[\s>])/.test(markup),
      open: false, value: '', textContent: '',
      style: { setProperty(_name: string, _value: string) {} },
      get innerHTML() { return content; },
      set innerHTML(value: string) {
        content = value;
        if (attributes.get('id') === 'plots') {
          for (const key of nodes.keys()) if (/^plot-\d+$/.test(key)) nodes.delete(key);
          for (const [tag, id] of value.matchAll(markupIds)) nodes.set(id, makeNode(tag));
        }
      },
      dataset: {} as Record<string, string>,
      getAttribute: (name: string) => attributes.get(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      addEventListener: (event: string, handler: () => void) => handlers.set(event, handler),
      focus() {},
      dispatch(event: string) { handlers.get(event)?.(); },
    };
  }
  const nodes: Map<string, ReturnType<typeof makeNode>> = new Map(Array.from(
    html.split('<script')[0].matchAll(markupIds),
    ([markup, id]) => [id, makeNode(markup)] as const
  ));
  function node(id: string) {
    const n = nodes.get(id);
    assert.ok(n, `missing lesson element: ${id}`);
    return n;
  }
  const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(source.length, 'the published lesson must ship its control handlers');
  const docEvents = new Map<string, () => void>();
  const document = {
    getElementById: node,
    addEventListener: (event: string, handler: () => void) => docEvents.set(event, handler),
    fullscreenEnabled: true,
    fullscreenElement: null as object | null,
    documentElement: {
      async requestFullscreen() { document.fullscreenElement = this; docEvents.get('fullscreenchange')?.(); },
    },
    async exitFullscreen() { document.fullscreenElement = null; docEvents.get('fullscreenchange')?.(); },
  };
  runInNewContext(source.join('\n;\n'), { document, location: { hash }, URLSearchParams });
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
  const plotIndexes = () => Array.from(nodes.keys())
    .filter(id => /^plot-\d+$/.test(id)).map(id => Number(id.slice(5)))
    .sort((a,b) => a-b);
  const planted = () => plotIndexes().filter(
    i => node(`plot-${i}`).getAttribute('aria-pressed') === 'true'
  );
  const stage = () => node('challenge-panel').dataset.stage;
  return { node, click, take, plot, planted, stage, plotIndexes, document };
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

test('a 30 m copy asks for a prediction, draws seven positions and reveals its formula only on completion', () => {
  const { node, plotIndexes, stage, take, plot, click } = openLesson('#road=30&spacing=5');
  assert.equal(node('challenge-panel').hidden, false);
  assert.equal(node('explore-panel').hidden, true);
  assert.equal(stage(), 'plan');
  assert.match(node('mission').textContent, /30\s*米/);
  assert.match(node('spacing-label').textContent, /5\s*米/);
  assert.deepEqual(plotIndexes(), [0,1,2,3,4,5,6]);
  for (const index of plotIndexes()) {
    const plot = node('plot-' + index);
    assert.match(plot.getAttribute('aria-label') || '', new RegExp('^' + index * 5 + '\\s*米'));
    assert.equal(plot.dataset.gate, String(index === 0));
  }
  const choices = [...node('seed-count').innerHTML.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(choices, [0,1,2,3,4,5,6,7,8]);
  const formula = /30\s*÷\s*5\s*=\s*6/;
  const noReveal = () => {
    assert.doesNotMatch(node('mission').textContent + node('challenge-feedback').textContent, formula);
  };
  noReveal();
  take(9); assert.equal(stage(), 'plan', 'stock outside this copy’s range is not accepted');
  take(6);
  [1,2,3,4,5,6].forEach(plot);
  click('check-layout'); assert.equal(stage(), 'ready'); noReveal();
  click('move-gate'); assert.equal(stage(), 'move'); noReveal();
  assert.equal(node('plot-6').dataset.gate, 'true');
  plot(6); plot(0);
  click('check-layout'); assert.equal(stage(), 'done');
  assert.match(node('challenge-feedback').textContent, formula);
  assert.match(node('challenge-feedback').textContent, /6\s*棵/);
  click('undo'); assert.equal(stage(), 'move'); noReveal();
});

test('only valid road/spacing settings change the defaults, including at interval bounds', () => {
  for (const hash of ['', '#seed=8', '#road=30', '#spacing=5', '#road=0&spacing=5',
    '#road=4&spacing=2', '#road=101&spacing=1', '#road=50&spacing=25', '#road=30&spacing=0',
    '#road=20&spacing=6', '#road=5&spacing=5', '#road=55&spacing=5',
    '#road=30.5&spacing=5', '#road=2e1&spacing=5']) {
    const { node, plotIndexes } = openLesson(hash);
    assert.equal(node('challenge-panel').hidden, true, 'original exploration on ' + hash);
    assert.deepEqual(plotIndexes(), [0,1,2,3,4]);
    assert.match(node('mission').textContent, /20\s*米/);
  }
  for (const [hash, length] of [['#road=10&spacing=5', 3], ['#road=100&spacing=10', 11]] as const) {
    const { node, plotIndexes } = openLesson(hash);
    assert.equal(node('challenge-panel').hidden, false);
    assert.equal(plotIndexes().length, length);
  }
});

test('undo restores real actions, including checking, moving the gate, restarting and exploring, by mode', () => {
  const { node, click, plot, planted, stage, take } = openLesson();
  const undo = () => click('undo');
  assert.equal(node('undo').disabled, true);
  click('more');
  click('neither'); click('neither'); // Re-selecting the same kind is not a step.
  click('reset');
  assert.equal(Number(node('interval-count').textContent), 5);
  undo();
  assert.equal(Number(node('interval-count').textContent), 6);
  assert.equal(node('neither').getAttribute('aria-pressed'), 'true');
  click('challenge-mode');
  assert.equal(node('undo').disabled, true);
  take(4); plot(1);
  plot(0); // A blocked move must not consume an undo.
  undo(); assert.deepEqual(planted(), []);
  undo(); assert.equal(stage(), 'plan');
  assert.equal(node('undo').disabled, true);
  take(4); [1,2,3,4].forEach(plot);
  click('check-layout'); click('move-gate');
  assert.equal(node('plot-4').dataset.gate, 'true');
  undo(); assert.equal(stage(), 'ready');
  assert.equal(node('plot-0').dataset.gate, 'true');
  undo(); assert.equal(stage(), 'plant');
  assert.deepEqual(planted(), [1,2,3,4]);
  click('restart-challenge'); assert.equal(stage(), 'plan');
  undo(); assert.equal(stage(), 'plant'); assert.deepEqual(planted(), [1,2,3,4]);
  click('explore-mode');
  undo();
  assert.equal(node('both').getAttribute('aria-pressed'), 'true');
  assert.equal(Number(node('interval-count').textContent), 6);
  undo();
  assert.equal(node('undo').disabled, true);
  click('challenge-mode');
  assert.deepEqual(planted(), [1,2,3,4]);
});

test('toggling native fullscreen never replaces the state of the active lesson', async () => {
  const { node, document, click, take, plot, planted, stage } = openLesson();
  click('challenge-mode'); take(4); plot(1);
  click('fullscreen'); await Promise.resolve();
  assert.equal(document.fullscreenElement, document.documentElement);
  assert.match(node('fullscreen').textContent, /退出/);
  assert.equal(stage(), 'plant'); assert.deepEqual(planted(), [1]);
  click('fullscreen'); await Promise.resolve();
  assert.equal(document.fullscreenElement, null);
  assert.equal(stage(), 'plant'); assert.deepEqual(planted(), [1]);
  click('undo'); assert.deepEqual(planted(), []);
});
