import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import configLib from '../public/courseware/zhi-shu-shi-yan/config.js';
import model from '../public/courseware/zhi-shu-shi-yan/model.js';
import {
  applyAssistantPlan,
  buildAssistantRequest,
  parseAssistantPlan,
} from '../src/components/own-whiteboard/assistant/logic';
import {
  buildStandaloneCoursewareHtml,
  coursewareForShape,
  coursewareWhiteboardHref,
  escapeJsonForScript,
  getCourseware,
  prepareCoursewareBoard,
} from '../src/components/own-whiteboard/core/courseware';
import { createDocument, validateDocument } from '../src/components/own-whiteboard/core/model';

test('zhi-shu-shi-yan is registered in whiteboard courseware catalog with article and static files', () => {
  const product = getCourseware('zhi-shu-shi-yan');
  assert.ok(product);
  assert.equal(product.title, '植树大冒险');
  assert.equal(product.entryHref, '/courseware/zhi-shu-shi-yan/index.html');
  assert.equal(
    coursewareWhiteboardHref(product),
    '/whiteboard?courseware=zhi-shu-shi-yan'
  );

  const dir = new URL('../public/courseware/zhi-shu-shi-yan/', import.meta.url);
  for (const file of ['index.html', 'lesson.css', 'lesson.js', 'model.js', 'config.js', 'cover.svg']) {
    assert.ok(existsSync(new URL(file, dir)), `missing ${file}`);
  }

  const articlePath = new URL(`../content${product.articleHref}.zh.mdx`, import.meta.url);
  assert.ok(existsSync(articlePath), 'missing blog article for 返回文章 link');
  const article = readFileSync(articlePath, 'utf8');
  assert.match(article, /<CoursewareLaunch id="zhi-shu-shi-yan" \/>/);

  const board = prepareCoursewareBoard(createDocument(), product, { w: 1000, h: 760 });
  const card = board.document.pages[0].shapes.find((s) => s.id === board.shapeId);
  assert.ok(card);
  assert.equal(coursewareForShape(card)?.id, 'zhi-shu-shi-yan');
});

test('planting model supports custom route length, click-to-remove, and preserves math rules', () => {
  let state = model.initialState(120);
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    state = model.plant(state, model.pointAt('line', 0, t));
  }
  assert.equal(state.plants.length, 5);
  // 5 trees both ends => 4 intervals => 120 / 4 = 30.0m
  assert.equal(model.readout(state).totalIntervals, 4);
  assert.equal(model.readout(state).average, '30.0');

  // Remove one tree => 4 trees => 3 intervals => 120 / 3 = 40.0m
  state = model.removeAt(state, 2);
  assert.equal(state.plants.length, 4);
  assert.equal(model.readout(state).totalIntervals, 3);
  assert.equal(model.readout(state).average, '40.0');
});

test('changing routeLength to 120m keeps mission story, targetGap, and strict grading 100% consistent', () => {
  const base = configLib.defaultConfig();
  const edited = configLib.normalizeConfig({ routeLength: 120 }, base);
  const m1 = edited.missions[0];
  assert.equal(m1.routeLength, 120);
  assert.equal(m1.targetGap, 30);
  assert.equal(m1.targetCount, 5);
  assert.match(m1.story, /120 米/);
  assert.match(m1.story, /每 30 米/);
  assert.doesNotMatch(m1.story, /100 米/);

  // Strict grading rejects mismatched spacing (e.g. 120m with 30m gap against a 25m-gap mission)
  const mismatchedMission = { ...base.missions[0], routeLength: 120, targetGap: 25, targetCount: 5 };
  let s = model.initialState(120);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    s = model.plant(s, model.pointAt('line', 0, t));
  }
  const wrongResult = model.evaluateMission(model.uniform(s), mismatchedMission);
  assert.equal(wrongResult.passed, false);
  assert.match(wrongResult.feedback, /平均间距/);

  // Exact match passes with 3 stars
  const rightResult = model.evaluateMission(model.uniform(s), m1);
  assert.equal(rightResult.passed, true);
  assert.equal(rightResult.stars, 3);
});

test('all 5 default Renjiao missions evaluate accurately before and after uniform spacing', () => {
  const cfg = configLib.defaultConfig();
  assert.equal(cfg.missions.length, 5);

  const m1 = cfg.missions[0]; // line, both, 100m, 25m gap => 5 trees
  let s1 = model.initialState(m1.routeLength);
  for (const t of [0.05, 0.2, 0.4, 0.6, 0.8]) {
    s1 = model.plant(s1, model.pointAt('line', 0, t));
  }
  const beforeUniform = model.evaluateMission(s1, m1);
  assert.equal(beforeUniform.passed, false);
  assert.equal(beforeUniform.stars, 2);

  const afterUniform = model.evaluateMission(model.uniform(s1), m1);
  assert.equal(afterUniform.passed, true);
  assert.equal(afterUniform.stars, 3);

  const m5 = cfg.missions[4]; // circle, 100m, 20m gap => 5 trees
  let s5 = model.setShape(model.initialState(m5.routeLength), 'circle');
  for (const t of [0, 0.2, 0.4, 0.6, 0.8]) {
    s5 = model.plant(s5, model.pointAt('circle', 0, t));
  }
  const res5 = model.evaluateMission(model.uniform(s5), m5);
  assert.equal(res5.passed, true);
  assert.equal(res5.stars, 3);
});

test('offline HTML packaging neutralizes script-closing injection in teacher input', () => {
  const maliciousTitle = '植树课</script><img src=x onerror=alert(1)>';
  const escaped = escapeJsonForScript({ title: maliciousTitle });
  assert.doesNotMatch(escaped, /<\/script/i);
  assert.match(escaped, /\\u003c\/script\\u003e/);

  const dir = new URL('../public/courseware/zhi-shu-shi-yan/', import.meta.url);
  const templateHtml = readFileSync(new URL('index.html', dir), 'utf8');
  const css = readFileSync(new URL('lesson.css', dir), 'utf8');
  const configJs = readFileSync(new URL('config.js', dir), 'utf8');
  const modelJs = readFileSync(new URL('model.js', dir), 'utf8');
  const lessonJs = readFileSync(new URL('lesson.js', dir), 'utf8');

  const cfg = configLib.normalizeConfig({ title: maliciousTitle }, configLib.defaultConfig());
  const standalone = buildStandaloneCoursewareHtml(
    templateHtml,
    { css, configJs, modelJs, lessonJs },
    cfg
  );
  assert.doesNotMatch(standalone, /<img src=x onerror=/i);
  assert.match(standalone, /Content-Security-Policy/);
  assert.doesNotMatch(standalone, /<script[^>]+src=/i);
});

test('teacher quick parameter edit updates missions consistently and exports cross-agent pack', () => {
  const base = configLib.defaultConfig();
  const { config: preview, summary } = configLib.applyNaturalLanguageEdit(
    base,
    '把全长改成 120 米，切换金秋银杏主题，标题改成「五(2)班植树课」，默认放路灯，新增一道 6 盏路灯的题'
  );
  assert.equal(preview.routeLength, 120);
  assert.equal(preview.theme, 'autumn');
  assert.equal(preview.title, '五(2)班植树课');
  assert.equal(preview.defaultSkin, 'lamp');
  assert.equal(preview.missions.length, 6);
  assert.match(preview.missions[0].story, /120 米/);
  assert.match(summary, /120 米/);

  const pack = configLib.buildAgentPromptPack(preview);
  assert.match(pack, /五\(2\)班植树课/);
  assert.match(pack, /"routeLength": 120/);
  assert.match(pack, /不能带动部分的降维替代说明/);
  assert.match(pack, /DeepSeek/);
});

test('whiteboard AI assistant can read and safely update selected courseware shape config, while blocking embed injection', () => {
  const product = getCourseware('zhi-shu-shi-yan')!;
  const board = prepareCoursewareBoard(createDocument(), product, { w: 1000, h: 760 });
  const shapes = board.document.pages[0].shapes;
  const card = shapes.find((s) => s.id === board.shapeId)!;

  // 1. Assistant request exposes courseware metadata & editable fields
  const req = buildAssistantRequest(
    [{ role: 'user', content: '把路线全长改成 120 米，切换金秋主题' }],
    [card]
  );
  const materialMsg = req.messages.find((m) => m.content.includes('本轮选中材料快照'))!;
  assert.match(materialMsg.content, /"courseware"/);
  assert.match(materialMsg.content, /"zhi-shu-shi-yan"/);

  // 2. Valid update plan updates title + coursewareConfig cleanly
  const validReply = JSON.stringify({
    summary: '已改为 120 米金秋银杏主题',
    operations: [
      {
        action: 'update',
        type: 'embed',
        id: card.id,
        props: {
          title: '五(2)班植树大冒险',
          coursewareConfig: {
            title: '五(2)班植树大冒险',
            routeLength: 120,
            theme: 'autumn',
          },
        },
      },
    ],
  });
  const plan = parseAssistantPlan(validReply, shapes, [card.id]);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.skipped, 0);

  const applied = applyAssistantPlan(plan, shapes, { x: 100, y: 100 });
  assert.deepEqual(applied.updatedIds, [card.id]);
  const updatedCard = applied.shapes.find((s) => s.id === card.id)!;
  assert.equal(updatedCard.props.title, '五(2)班植树大冒险');
  assert.deepEqual(updatedCard.props.coursewareConfig, {
    title: '五(2)班植树大冒险',
    routeLength: 120,
    theme: 'autumn',
  });
  // Updated document stays 100% valid for BoardDocument v2 persistence
  validateDocument({
    ...board.document,
    pages: [{ ...board.document.pages[0], shapes: applied.shapes }],
  });

  // 3. Security: AI cannot create arbitrary embed shapes or tamper with coursewareId/url
  const maliciousReply = JSON.stringify({
    summary: 'inject',
    operations: [
      { action: 'create', type: 'embed', props: { url: 'https://evil.example', title: 'bad' } },
      { action: 'update', type: 'embed', id: card.id, props: { coursewareId: 'evil', url: 'https://evil.example' } },
    ],
  });
  const blocked = parseAssistantPlan(maliciousReply, shapes, [card.id]);
  assert.equal(blocked.operations.length, 0);
  assert.equal(blocked.skipped, 2);
});
