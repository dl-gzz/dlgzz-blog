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
import {
  createDocument,
  createShape,
  migrateLegacyShapes,
  validateDocument,
} from '../src/components/own-whiteboard/core/model';

test('courseware resolves only authored IDs and not user-supplied URLs or object keys', () => {
  const lesson = getCourseware('cao-chong');
  assert.ok(lesson);
  assert.equal(
    coursewareWhiteboardHref(lesson),
    '/whiteboard?courseware=cao-chong'
  );
  assert.equal(lesson.articleHref, '/blog/cao-chong-weighs-elephant');
  for (const unknown of [
    'constructor',
    '../index.html',
    'https://example.com',
    null,
  ]) {
    assert.equal(getCourseware(unknown), undefined);
  }
});

test('the lesson is a reusable embed and reopening it preserves notes without duplicates', () => {
  const product = getCourseware('cao-chong');
  assert.ok(product);
  const original = createDocument();
  const note = createShape('note', 0, 0, { text: '自己的观察' });
  original.pages[0].shapes.push(note);
  const first = prepareCoursewareBoard(original, product, { w: 950, h: 983 });
  validateDocument(first.document);
  assert.deepEqual(original.pages[0].shapes, [note]);
  const [retained, card] = first.document.pages[0].shapes;
  assert.equal(retained, note);
  assert.equal(card.id, first.shapeId);
  assert.equal(coursewareForShape(card)?.entryHref, product.entryHref);
  assert.equal(first.document.pages[0].camera.y % 1, 0);
  assert.equal(
    prepareCoursewareBoard(first.document, product, { w: 800, h: 600 }).shapeId,
    card.id
  );
  assert.equal(
    prepareCoursewareBoard(first.document, product, { w: 800, h: 600 }).document
      .pages[0].shapes.length,
    2
  );
});

test('the authored lesson ships every picture and narration clip beside its entry page', () => {
  const dir = new URL('../public/courseware/cao-chong/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  const images = new Set(html.match(/\b[a-z-]+\.webp\b/g));
  assert.equal(images.size, 6);
  for (const file of [
    ...images,
    ...Array.from({ length: 9 }, (_, i) => `audio/${i}.mp3`),
  ]) {
    assert.ok(existsSync(new URL(file, dir)), `missing lesson asset: ${file}`);
  }
});

test('the published lesson guide ends with its registered whiteboard launcher and has a real cover', () => {
  const lesson = getCourseware('cao-chong');
  assert.ok(lesson);
  const source = readFileSync(
    new URL(`../content${lesson.articleHref}.zh.mdx`, import.meta.url),
    'utf8'
  );
  assert.match(source, /\npublished: true\n/);
  assert.match(source.trimEnd(), /<CoursewareLaunch id="cao-chong"\s*\/>$/);
  const cover = source.match(
    /\nimage: "(\/courseware\/cao-chong\/[^"\n]+)"\n/
  )?.[1];
  assert.ok(cover);
  assert.ok(existsSync(new URL(`../public${cover}`, import.meta.url)));
});

test('an existing published lesson remains an interactive embed after legacy migration', () => {
  const legacy = [{
    id: 'shape:published-courseware-cao-chong',
    type: 'preview_html',
    x: 20,
    y: 66,
    props: { w: 900, h: 560, publishedCoursewareId: 'cao-chong' },
  }];
  const shape = migrateLegacyShapes(legacy).pages[0].shapes[0];
  assert.equal(shape.id, legacy[0].id);
  assert.equal(shape.w, 900);
  assert.equal(coursewareForShape(shape)?.id, 'cao-chong');
  assert.equal(legacy[0].type, 'preview_html');
});

test('fullscreen expands the scene view without distorting or cutting off the draggable area', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const source = html.match(
    /function sceneViewBox\(width, height\) \{[\s\S]+?\n\}/
  )?.[0];
  assert.ok(source);
  const viewBox = runInNewContext(`(${source})`) as (
    w: number,
    h: number
  ) => [number, number, number, number];
  for (const [width, height] of [
    [940, 850],
    [1080, 540],
    [1248, 600],
    [320, 200],
  ]) {
    const [x, y, w, h] = viewBox(width, height);
    assert.ok(x <= 0 && y <= 0 && x + w >= 900 && y + h >= 560);
    assert.ok(Math.abs(w / h - width / height) < 1e-9);
  }
  assert.match(
    html,
    /document\.addEventListener\('fullscreenchange', updateFullscreenButton\)/
  );
});

test('boat depth moves continuously in both directions and settles exactly on the model depth', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const source = html.match(
    /function easeBoatDepth\(from, to, progress\) \{[\s\S]+?\n\}/
  )?.[0];
  assert.ok(source);
  const ease = runInNewContext(`(${source})`) as (
    from: number,
    to: number,
    fraction: number
  ) => number;
  assert.equal(ease(0, 30, 0), 0);
  assert.equal(ease(0, 30, 0.5), 15);
  assert.equal(ease(0, 30, 1), 30);
  assert.equal(ease(30, 0, 2), 0);
  assert.ok(ease(30, 0, 0.25) > ease(30, 0, 0.75));
  assert.match(html, /\['boat', 'submergedHull', 'markGroup'\]/);
  assert.match(html, /id="belowWater"[\s\S]*?y="283"/);
  assert.match(html, /id="impactRipples"/);
  assert.match(html, /prefers-reduced-motion: reduce/);
});

test('the elephant lands from its release pose without changing the feet anchor or stretching', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const source = html.match(
    /function easeElephantPose\(from, to, progress\) \{[\s\S]+?\n\}/
  )?.[0];
  assert.ok(source);
  type Pose = { x: number; y: number; k: number };
  const ease = runInNewContext(`(${source})`) as (
    from: Pose,
    to: Pose,
    progress: number
  ) => Pose;
  const from = { x: 310, y: 345, k: 1 };
  const to = { x: 280, y: 319, k: 0.88 };
  assert.deepEqual({ ...ease(from, to, -1) }, from);
  assert.deepEqual({ ...ease(from, to, 2) }, to);
  const between = ease(from, to, 0.5);
  assert.ok(between.x > to.x && between.x < from.x);
  assert.ok(between.y > to.y && between.y < from.y);
  assert.ok(between.k > to.k && between.k < from.k);
});

test('the lower shore and upper boat accept the new drag directions without changing the weight model', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const source = html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  assert.ok(source);
  const result = runInNewContext(`${source}
    const model = new LessonModel();
    const drop = (kind, x, y) => lessonDropTarget(kind, model.stage, {x, y});
    const tests = [drop('elephant', 275, 451), drop('elephant', 275, 201)];
    model.elephant();
    tests.push(model.draw([{x:250,y:486},{x:480,y:486}]));
    tests.push(model.draw([{x:250,y:LESSON.waterY},{x:480,y:LESSON.waterY}]));
    tests.push(model.mark.y + model.sink === LESSON.waterY);
    tests.push(drop('elephant', 275, 451));
    model.elephant();
    tests.push(drop('rock', 420, 222), drop('rock', 690, 480));
    for (let i = 0; i < 9; i++) model.rock(i, 'boat');
    tests.push(model.startWeigh(), drop('rock', 650, 465), drop('rock', 750, 397), drop('rock', 420, 222));
    JSON.stringify(tests);
  `);
  assert.deepEqual(JSON.parse(result), [
    null,
    'boat',
    false,
    true,
    true,
    'shore',
    'boat',
    'shore',
    true,
    'scale',
    null,
    'boat',
  ]);
});

test('weighing begins with a visible empty ledger and live mass; recorded batches remain visible', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const script = html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  const render = html.match(/function renderWeighingLog\(\) \{[\s\S]+?\n\}/)?.[0];
  assert.ok(script && render);
  const result = runInNewContext(`${script}
    ${render}
    const model = new LessonModel();
    let formulaShown = true;
    const elements = new Map();
    const $ = id => {
      if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '',
        classList: { toggle: (_, hide) => { elements.get(id).hidden = hide; } } });
      return elements.get(id);
    };
    const state = () => {
      renderWeighingLog();
      return [$('ledger').hidden, $('liveReading').hidden, $('liveWeight').textContent,
        $('scaleValue').textContent, $('recordList').innerHTML, $('sum').textContent,
        $('lessonLayout').hidden, $('mathCard').hidden, $('equation').innerHTML,
        $('resultCard').hidden, $('classroomTotal').textContent, $('answerBox').hidden,
        model.sink, model.elephantAboard, model.mark?.y + model.sink];
    };
    const samples = [state()];
    model.elephant();
    model.draw([{x:250,y:LESSON.waterY},{x:480,y:LESSON.waterY}]);
    model.elephant();
    for (let i = 0; i < 9; i++) model.rock(i, 'boat');
    model.startWeigh();
    samples.push(state());
    model.rock(0, 'scale');
    model.rock(1, 'scale');
    samples.push(state());
    model.rock(1, 'boat');
    samples.push(state());
    model.record();
    samples.push(state());
    for (let i = 1; i < 9; i++) {
      model.rock(i, 'scale');
      if (model.batch.length === LESSON.maxBatch || i === 8) model.record();
    }
    samples.push(state());
    model.answer(3500);
    samples.push(state());
    model.answer(3600);
    samples.push(state());
    model.undo();
    samples.push(state());
    JSON.stringify(samples);
  `);
  const [
    initial, ready, loaded, unloaded, recorded, solving, incorrect, completed, undone,
  ] = JSON.parse(result);
  assert.equal(initial[0], true);
  assert.equal(initial[6], false);
  assert.deepEqual(ready.slice(0, 4), [false, false, '0', '0']);
  assert.equal(ready[6], true);
  assert.deepEqual(loaded.slice(0, 4), [false, false, '600', '600']);
  assert.deepEqual(unloaded.slice(0, 4), [false, false, '200', '200']);
  assert.deepEqual(recorded.slice(0, 4), [false, false, '0', '0']);
  assert.match(recorded[4], /第 1 批.*200 千克/);
  assert.equal(recorded[5], '已记录合计 200 千克');
  assert.equal(solving[7], false);
  assert.match(solving[8], /200<\/span>.*= ？/);
  assert.equal(solving[9], true);
  assert.equal(solving[10], '');
  assert.equal(solving[11], false);
  assert.deepEqual(incorrect, solving);
  assert.equal(solving[12], 0);
  assert.equal(completed[7], true);
  assert.equal(completed[9], false);
  assert.equal(completed[10], '3600');
  assert.equal(completed[11], true);
  assert.equal(completed[12], 30);
  assert.equal(completed[13], true);
  assert.equal(completed[14], 283);
  assert.equal(completed[4], solving[4]);
  assert.deepEqual(undone, solving);
});

test('the single formula cue follows the narration clock and has a silent fallback', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const helpers = [
    'clearFormulaCueTimer',
    'revealFormulaCue',
    'updateFormulaCue',
    'bindFormulaVoiceCue',
  ].map((name) => {
    const source = html.match(
      new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]+?\\n\\}')
    )?.[0];
    assert.ok(source);
    return source;
  });
  const samples = runInNewContext(`${helpers.join('\n')}
    let formulaShown = false, formulaCueTimer = 0, muted = false, flashes = 0;
    const FORMULA_VOICE_START = .215, model = { stage: 5 };
    let fallback;
    const setTimeout = callback => { fallback = callback; return 1; };
    const clearTimeout = () => { fallback = null; };
    const frames = [];
    const requestAnimationFrame = callback => frames.push(callback);
    const fitScene = () => {};
    const $ = () => ({classList:{add: (n) => { if(n==='cue-once') flashes++; }, remove: () => {}}});
    const values = [];
    const snapshot = () => values.push([formulaShown, flashes, Boolean(fallback)]);
    const clip = {paused:false, ended:false, currentTime:0,
      addEventListener: (_, callback) => { clip.playing = callback; }};
    let audio = clip;
    updateFormulaCue(true); snapshot();
    bindFormulaVoiceCue(clip); clip.playing();
    clip.currentTime = .16; frames.shift()(); snapshot();
    clip.currentTime = .23; frames.shift()(); snapshot();
    clip.playing(); snapshot();
    model.stage = 4; updateFormulaCue(false); snapshot();
    model.stage = 5; muted = true; updateFormulaCue(true); snapshot();
    model.stage = 4; updateFormulaCue(false);
    model.stage = 5; muted = false; updateFormulaCue(true); fallback(); snapshot();
    JSON.stringify(values);
  `);
  assert.deepEqual(JSON.parse(samples), [
    [false, 0, true],
    [false, 0, true],
    [true, 1, false],
    [true, 1, false],
    [false, 1, false],
    [true, 2, false],
    [true, 3, false],
  ]);
  assert.match(html, /\.formulaMarker\.cue-once \{ animation: formula-cue 800ms ease-out 1; \}/);
});

test('the caption is anchored above Cao Chong and has a reserved gap before the hull', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const placement = html.match(
    /function speechBubblePlacement\(bounds, pixelWidth, pixelHeight\) \{[\s\S]+?\n\}/
  )?.[0];
  const scene = html.match(/const SCENE=\{[\s\S]+?\n\};/)?.[0];
  assert.ok(placement && scene);
  const examples = runInNewContext(`${scene}
    ${placement}
    JSON.stringify([[[0,0,900,560],680,423], [[-210,-20,1262,580],1262,580]]
      .map(([bounds,w,h]) => {
        const p = speechBubblePlacement(bounds,w,h);
        return [p.left, (SCENE.boatDrop.left-bounds[0])*w/bounds[2] - p.left-p.width,
          Math.abs((SCENE.speakerHead.x-bounds[0])*w/bounds[2] - p.left-p.tail),
          p.bottom - (h-(SCENE.speakerHead.y-bounds[1])*h/bounds[3])];
      }));
  `);
  for (const [left, gap, tailError, aboveHead] of JSON.parse(examples)) {
    assert.ok(left >= 8);
    assert.ok(gap >= 8);
    assert.ok(tailError <= 1);
    assert.ok(aboveHead > 12);
  }
});

test('narration starts and stops the mouth and dots together, ignoring events from an old clip', () => {
  const html = readFileSync(
    new URL('../public/courseware/cao-chong/index.html', import.meta.url),
    'utf8'
  );
  const functions = ['setVoiceAnimation', 'stopVoice', 'bindVoiceAnimation'].map(
    (name) => {
      const source = html.match(
        new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]+?\\n\\}')
      )?.[0];
      assert.ok(source);
      return source;
    }
  );
  const result = runInNewContext(`${functions.join('\n')}
    let audio = null, muted = false;
    const state = { speechBubble: false, caoChong: false };
    const $ = (id) => ({ classList: { toggle: (_, active) => { state[id] = active; } } });
    const makeClip = () => {
      const events = new Map();
      return { paused: false, ended: false, addEventListener: (name, callback) => events.set(name, callback),
        fire: (name) => events.get(name)?.(),
        pause() { this.paused = true; this.fire('pause'); } };
    };
    const snapshots = [];
    const take = () => snapshots.push(Object.values(state));
    const first = audio = makeClip();
    bindVoiceAnimation(first);
    take();
    first.fire('playing'); take();
    first.fire('waiting'); take();
    first.fire('playing'); take();
    stopVoice();
    first.fire('playing'); take();
    const second = audio = makeClip();
    bindVoiceAnimation(second);
    second.fire('playing'); take();
    first.fire('ended'); take();
    second.fire('ended'); take();
    JSON.stringify(snapshots);
  `);
  assert.deepEqual(JSON.parse(result), [
    [false, false],
    [true, true],
    [false, false],
    [true, true],
    [false, false],
    [true, true],
    [true, true],
    [false, false],
  ]);
});
