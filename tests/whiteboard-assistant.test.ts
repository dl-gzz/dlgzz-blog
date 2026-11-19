import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSISTANT_ARCHIVE_MAX_CHARACTERS,
  AssistantArchiveSizeError,
  applyAssistantPlan,
  assistantStorageKey,
  buildAssistantRequest,
  compactStoredShapeFingerprint,
  hasAppliedAssistantRequest,
  parseAssistantArchive,
  parseAssistantPlan,
  serializeAssistantArchive,
  shapeFingerprint,
} from '../src/components/own-whiteboard/assistant/logic';
import {
  createShape,
  resolveArrowPoints,
} from '../src/components/own-whiteboard/core/model';
import type {
  BoardShape,
  ShapeType,
} from '../src/components/own-whiteboard/core/types';

function shape(type: ShapeType, id: string, text = '') {
  return { ...createShape(type, 0, 0, { text }), id };
}
const json = (operations: unknown[]) =>
  JSON.stringify({ summary: '方案已准备', operations });

test('request contains complete dialogue and selected material only, not image pixels or imported system instructions', () => {
  const selected = [
    shape('ai_result', 'text', 'chosen source'),
    shape('image', 'image'),
  ];
  selected[1].props.src = 'data:image/png;base64,SECRET_PIXELS';
  const request = buildAssistantRequest(
    [
      { role: 'system', content: 'INJECTED SYSTEM' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'continue' },
    ],
    selected
  );
  const serialized = JSON.stringify(request);
  assert.match(serialized, /chosen source/);
  assert.match(serialized, /first question/);
  assert.match(serialized, /first answer/);
  assert.doesNotMatch(serialized, /SECRET_PIXELS|INJECTED SYSTEM/);
  assert.match(serialized, /仅元数据/);
  assert.deepEqual(request.messages.at(-1), {
    role: 'user',
    content: 'continue',
  });
  assert.equal('purpose' in request, false);
});

test('article body is scoped by selected ID, missing and truncated bodies are explicit', () => {
  const article = shape('blog_post', 'article');
  article.props.description = 'summary only';
  article.props.url = '/blog/hello';
  const missing = JSON.stringify(buildAssistantRequest([], [article]));
  assert.match(missing, /unavailable/);
  assert.match(missing, /summary only/);
  const loaded = JSON.stringify(
    buildAssistantRequest(
      [],
      [article],
      [
        {
          id: 'article',
          title: 'Title',
          content: 'ARTICLE BODY',
          truncated: true,
        },
        {
          id: 'unselected',
          title: 'Private',
          content: 'UNSELECTED BODY',
          truncated: false,
        },
      ]
    )
  );
  assert.match(loaded, /ARTICLE BODY/);
  assert.match(loaded, /available/);
  assert.match(loaded, /truncated\\?":true/);
  assert.doesNotMatch(loaded, /UNSELECTED BODY/);
});

test('analysis is read from the selected analyzer result without claiming whole-video understanding', () => {
  const analyzer = shape('ai_video_analyzer', 'analyzer');
  analyzer.props.result = 'single frame details';
  const body = JSON.stringify(buildAssistantRequest([], [analyzer]));
  assert.match(body, /single frame details/);
  assert.match(body, /单帧/);
});

test('request rejects oversized full history instead of silently dropping turns', () => {
  assert.throws(
    () =>
      buildAssistantRequest(
        [{ role: 'user', content: '中'.repeat(50_000) }],
        []
      ),
    /接口限制/
  );
  assert.throws(
    () =>
      buildAssistantRequest(
        [],
        Array.from({ length: 21 }, (_, index) => shape('note', String(index)))
      ),
    /最多选择 20/
  );
});

test('safe whitelist strips host code fields and forbids deletes, unknown shapes, arbitrary create IDs and unsafe links', () => {
  const plan = parseAssistantPlan(
    json([
      {
        action: 'create',
        type: 'html',
        props: {
          html: '<h1>tool</h1>',
          title: 'Tool',
          execute: 'window.alert(1)',
        },
      },
      {
        action: 'create',
        type: 'skill',
        props: {
          skillId: 'wxvideo-download',
          accountName: 'author',
          keyword: 'topic',
          limit: 3,
          run: true,
        },
      },
      { action: 'delete', id: 'target', props: {} },
      { action: 'create', type: 'image', props: {} },
      { action: 'create', type: 'note', id: 'evil-id', props: { text: 'no' } },
      {
        action: 'create',
        type: 'blog_post',
        props: { title: 'bad', url: 'javascript:alert(1)' },
      },
      {
        action: 'create',
        type: 'skill',
        props: { skillId: 'shell', command: 'rm' },
      },
    ]),
    []
  );
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.skipped, 5);
  assert.equal(plan.operations[0].type, 'preview_html');
  assert.deepEqual(plan.operations[0].props, {
    html: '<h1>tool</h1>',
    title: 'Tool',
  });
  assert.equal('run' in plan.operations[1].props, false);
  assert.equal(
    parseAssistantPlan('globalThis.evil()', []).operations.length,
    0
  );
});

test('update only permits selected, unlocked, existing matching types', () => {
  const a = shape('note', 'a');
  const b = shape('note', 'b');
  const locked = { ...shape('note', 'locked'), locked: true };
  const plan = parseAssistantPlan(
    json([
      { action: 'update', id: 'a', props: { text: 'changed' } },
      { action: 'update', id: 'b', props: { text: 'unselected' } },
      { action: 'update', id: 'missing', props: { text: 'missing' } },
      { action: 'update', id: 'locked', props: { text: 'locked' } },
      {
        action: 'update',
        id: 'a',
        type: 'preview_html',
        props: { html: 'wrong type' },
      },
    ]),
    [a, b, locked],
    ['a', 'locked']
  );
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.skipped, 4);
  assert.equal(plan.snapshots.a, shapeFingerprint(a));
});

test('apply validates current object snapshot and does not overwrite edits, movement, lock or deletion', () => {
  const original = shape('ai_result', 'target', 'before');
  const plan = parseAssistantPlan(
    json([{ action: 'update', id: original.id, props: { text: 'AI change' } }]),
    [original]
  );
  const success = applyAssistantPlan(plan, [original], { x: 600, y: 200 });
  assert.equal(success.shapes[0].props.text, 'AI change');
  assert.equal(original.props.text, 'before');
  for (const current of [
    [{ ...original, props: { text: 'manual edit' } }],
    [{ ...original, x: 2 }],
    [{ ...original, locked: true }],
    [],
  ] as BoardShape[][]) {
    const result = applyAssistantPlan(plan, current, { x: 0, y: 0 });
    assert.equal(result.updatedIds.length, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.shapes, current);
  }
});

test('safe new objects use board-generated IDs and anchor positions; repeated updates are one transaction', () => {
  const source = shape('ai_result', 'source', 'before');
  const plan = parseAssistantPlan(
    json([
      { action: 'update', id: 'source', props: { text: 'after' } },
      { action: 'update', id: 'source', props: { title: 'title' } },
      {
        action: 'create',
        type: 'preview_html',
        x: -9999,
        props: { html: '<button>Run</button>' },
      },
      { action: 'create', type: 'note', props: { text: 'next' } },
    ]),
    [source]
  );
  const result = applyAssistantPlan(plan, [source], { x: 700, y: 100 });
  assert.equal(result.updatedIds.length, 1);
  assert.equal(result.createdIds.length, 2);
  assert.equal(result.shapes[0].props.text, 'after');
  assert.equal(result.shapes[0].props.title, 'title');
  assert.equal(result.shapes[1].x, 700);
  assert.equal(result.shapes[1].y, 100);
  assert.equal(result.shapes[2].y, 604);
  assert.match(result.shapes[1].id, /^shape:/);
});

test('arrows bind existing selected endpoints and reject stale or guessed targets', () => {
  const a = shape('note', 'a');
  const b = { ...shape('note', 'b'), x: 800, y: 100 };
  const operation = {
    action: 'create',
    type: 'arrow',
    props: {},
    startBinding: { shapeId: 'a', anchor: { x: 1, y: 0.5 } },
    endBinding: { shapeId: 'b', anchor: { x: 0, y: 0.5 } },
  };
  const plan = parseAssistantPlan(json([operation]), [a, b], ['a', 'b']);
  const result = applyAssistantPlan(plan, [a, b], { x: 0, y: 0 });
  assert.equal(result.createdIds.length, 1);
  assert.deepEqual(resolveArrowPoints(result.shapes[2], result.shapes), [
    { x: 220, y: 110 },
    { x: 800, y: 210 },
  ]);
  assert.equal(parseAssistantPlan(json([operation]), [a, b], ['a']).skipped, 1);
  assert.equal(parseAssistantPlan(json([operation]), [a], ['a']).skipped, 1);
  assert.equal(
    applyAssistantPlan(plan, [a, { ...b, y: 200 }], { x: 0, y: 0 }).createdIds
      .length,
    0
  );
});

test('restored plans are revalidated and cannot add unsafe props or bypass snapshot checks', () => {
  const target = shape('ai_result', 'target', 'before');
  const plan = parseAssistantPlan(
    json([{ action: 'update', id: 'target', props: { text: 'after' } }]),
    [target]
  );
  const restored = JSON.parse(JSON.stringify(plan));
  restored.operations[0].props.onClick = 'evil()';
  const result = applyAssistantPlan(restored, [target], { x: 0, y: 0 });
  assert.equal('onClick' in result.shapes[0].props, false);
  restored.snapshots = {};
  assert.equal(
    applyAssistantPlan(restored, [target], { x: 0, y: 0 }).updatedIds.length,
    0
  );
});

test('plans and dimensions are bounded and page storage is isolated', () => {
  const plan = parseAssistantPlan(
    json(
      Array.from({ length: 25 }, () => ({
        action: 'create',
        type: 'note',
        props: { text: 'x' },
      }))
    ),
    []
  );
  assert.equal(plan.operations.length, 20);
  assert.equal(plan.skipped, 5);
  assert.equal(
    parseAssistantPlan(
      json([{ action: 'create', type: 'note', w: 1e10, props: { text: 'x' } }]),
      []
    ).skipped,
    1
  );
  assert.notEqual(
    assistantStorageKey('board1:page1'),
    assistantStorageKey('board1:page2')
  );
  assert.notEqual(
    assistantStorageKey('board1:page1'),
    assistantStorageKey('board2:page1')
  );
});

test('compact fingerprints include the complete object and are independent of property insertion order', () => {
  const original = shape('note', 'large', `${'a'.repeat(1_600_000)}z`);
  const fingerprint = shapeFingerprint(original);
  assert.match(fingerprint, /^shape-v2:\d+:[0-9a-f]{16}$/);
  assert.ok(fingerprint.length < 50);
  const reordered = Object.fromEntries(
    Object.entries(original).reverse()
  ) as BoardShape;
  assert.equal(shapeFingerprint(reordered), fingerprint);
  const changedTail = {
    ...original,
    props: { ...original.props, text: `${'a'.repeat(1_600_000)}x` },
  };
  assert.notEqual(shapeFingerprint(changedTail), fingerprint);
  assert.notEqual(shapeFingerprint({ ...original, locked: true }), fingerprint);
  assert.equal(
    compactStoredShapeFingerprint(JSON.stringify(original)),
    fingerprint
  );
  assert.equal(compactStoredShapeFingerprint(fingerprint), fingerprint);
  assert.equal(
    compactStoredShapeFingerprint('not a snapshot'),
    'invalid-snapshot'
  );
});

test('large selected materials do not get duplicated into persisted plan snapshots', () => {
  const originals = [
    shape('note', 'one', 'a'.repeat(1_600_000)),
    shape('note', 'two', 'b'.repeat(1_600_000)),
  ];
  const content = json(
    originals.map((target) => ({
      action: 'update',
      id: target.id,
      props: { text: 'Summary' },
    }))
  );
  const plan = parseAssistantPlan(content, originals);
  const raw = serializeAssistantArchive({
    version: 1,
    messages: [{ id: 'message', role: 'assistant', content, plan }],
    draft: '',
  });
  assert.ok(raw.length < 2_000);
  assert.deepEqual(parseAssistantArchive(raw), JSON.parse(raw));
  assert.equal(
    applyAssistantPlan(plan, originals, { x: 0, y: 0 }).updatedIds.length,
    2
  );
});

test('archive write and restore share the same inclusive budget and preserve all messages', () => {
  const archive = {
    version: 1,
    messages: [{ id: 'm', role: 'user', content: '' }],
    draft: '',
  };
  const overhead = serializeAssistantArchive(archive).length;
  archive.messages[0].content = 'x'.repeat(
    ASSISTANT_ARCHIVE_MAX_CHARACTERS - overhead
  );
  const raw = serializeAssistantArchive(archive);
  assert.equal(raw.length, ASSISTANT_ARCHIVE_MAX_CHARACTERS);
  assert.deepEqual(parseAssistantArchive(raw), archive);
  const oversized = { ...archive, draft: 'x' };
  let previousArchive = 'ORIGINAL_ARCHIVE';
  assert.throws(() => {
    previousArchive = serializeAssistantArchive(oversized);
  }, AssistantArchiveSizeError);
  assert.equal(previousArchive, 'ORIGINAL_ARCHIVE');
  assert.throws(
    () => parseAssistantArchive(`${raw} `),
    AssistantArchiveSizeError
  );
});

test('only board-page receipts mark a request applied, including after reload and undo', () => {
  const historicalMessage = { requestId: 'request-one', applied: true };
  assert.equal(
    hasAppliedAssistantRequest(historicalMessage.requestId, []),
    false
  );
  assert.equal(
    hasAppliedAssistantRequest(historicalMessage.requestId, ['request-one']),
    true
  );
  // Undo removes the receipt together with its document transaction. Redo restores both.
  assert.equal(
    hasAppliedAssistantRequest(historicalMessage.requestId, []),
    false
  );
  assert.equal(
    hasAppliedAssistantRequest(historicalMessage.requestId, ['request-one']),
    true
  );
  assert.equal(hasAppliedAssistantRequest(undefined, ['request-one']), false);
  assert.equal(
    hasAppliedAssistantRequest('request-two', ['request-one']),
    false
  );
});
