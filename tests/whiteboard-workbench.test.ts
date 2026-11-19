import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDocument,
  createShape,
  validateDocument,
} from '../src/components/own-whiteboard/core/model';
import {
  buildAssistantRequest,
  parseAssistantPlan,
  applyAssistantPlan,
} from '../src/components/own-whiteboard/assistant/logic';
import {
  createToolTemplate,
  instantiateTool,
  emptyToolsLibrary,
  parseToolsLibrary,
} from '../src/components/own-whiteboard/dock/templates';

test('material to interactive result to reusable tool retains original material and creates fresh instances', () => {
  const document = createDocument();
  const material = createShape('ai_result', 100, 100, {
    title: '工作清单',
    text: '准备资料\n整理思路\n检查交付',
  });
  const unrelated = createShape('note', 600, 800, {
    text: '不应发送的未选中资料',
  });
  document.pages[0].shapes = [material, unrelated];
  const body = buildAssistantRequest(
    [{ role: 'user', content: '把清单做成可勾选的小工具' }],
    [material]
  );
  assert.ok(JSON.stringify(body).includes('准备资料'));
  assert.ok(!JSON.stringify(body).includes('不应发送的未选中资料'));
  // A deterministic contract fixture, not a real model response.
  const reply = JSON.stringify({
    summary: '生成清单工具',
    operations: [
      {
        action: 'create',
        type: 'preview_html',
        props: {
          title: '工作清单工具',
          html: '<!doctype html><html><body><label><input type="checkbox">准备资料</label></body></html>',
        },
      },
    ],
  });
  const plan = parseAssistantPlan(reply, document.pages[0].shapes, [
    material.id,
  ]);
  const applied = applyAssistantPlan(plan, document.pages[0].shapes, {
    x: 568,
    y: 100,
  });
  assert.deepEqual(applied.shapes[0], material);
  assert.equal(applied.createdIds.length, 1);
  const result = applied.shapes.find(
    (shape) => shape.id === applied.createdIds[0]
  )!;
  assert.equal(result.x, 568);
  const template = createToolTemplate(result);
  const library = { ...emptyToolsLibrary(), items: [template] };
  const reopened = parseToolsLibrary(JSON.stringify(library));
  const reused = instantiateTool(reopened.items[0]);
  assert.notEqual(reused.id, result.id);
  assert.equal(reused.props.html, result.props.html);
  assert.equal(reused.startBinding, undefined);
  document.pages[0].shapes = [...applied.shapes, reused];
  assert.equal(validateDocument(document).pages[0].shapes.length, 4);
});

test('pending AI update cannot overwrite material changed by the user while waiting', () => {
  const original = createShape('preview_html', 0, 0, {
    html: '<h1>原版本</h1>',
  });
  const plan = parseAssistantPlan(
    JSON.stringify({
      operations: [
        {
          action: 'update',
          id: original.id,
          props: { html: '<h1>AI 版本</h1>' },
        },
      ],
    }),
    [original],
    [original.id]
  );
  const manuallyEdited = {
    ...original,
    props: { html: '<h1>我刚修改的版本</h1>' },
  };
  const result = applyAssistantPlan(plan, [manuallyEdited], { x: 0, y: 0 });
  assert.equal(result.updatedIds.length, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.shapes[0].props.html, manuallyEdited.props.html);
});

test('AI apply receipts persist with board content, not a separate chat success flag', () => {
  const before = createDocument();
  const output = createShape('ai_result', 0, 0, { text: 'test output' });
  const after = validateDocument({
    ...before,
    pages: [
      {
        ...before.pages[0],
        shapes: [output],
        assistantAppliedRequests: ['assistant-request:one'],
      },
    ],
  });
  const reopened = validateDocument(JSON.parse(JSON.stringify(after)));
  assert.equal(reopened.pages[0].shapes[0].id, output.id);
  assert.deepEqual(reopened.pages[0].assistantAppliedRequests, [
    'assistant-request:one',
  ]);
  // Reopening the unsaved/undo snapshot restores neither output nor receipt.
  assert.equal(before.pages[0].assistantAppliedRequests, undefined);
  assert.equal(before.pages[0].shapes.length, 0);
  assert.throws(() =>
    validateDocument({
      ...before,
      pages: [{ ...before.pages[0], assistantAppliedRequests: [false] }],
    })
  );
  assert.throws(() =>
    validateDocument({
      ...before,
      pages: [
        {
          ...before.pages[0],
          assistantAppliedRequests: Array(1001).fill('assistant-request:x'),
        },
      ],
    })
  );
});
