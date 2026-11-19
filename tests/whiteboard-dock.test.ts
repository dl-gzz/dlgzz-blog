import assert from 'node:assert/strict';
import test from 'node:test';
import { createShape } from '../src/components/own-whiteboard/core/model';
import {
  LEGACY_TOOLS_STORAGE_KEY,
  TOOLS_STORAGE_KEY,
  addTool,
  canSaveTool,
  createToolTemplate,
  emptyToolsLibrary,
  instantiateTool,
  loadToolsLibrary,
  mergeToolsLibrary,
  parseToolsLibrary,
  recoverLegacyTools,
  removeTool,
  renameTool,
  saveToolsLibrary,
  serializeToolsLibrary,
  suggestedToolName,
} from '../src/components/own-whiteboard/dock/templates';

test('supported content tools preserve configuration but instantiate clean independent shapes', () => {
  const source = createShape('skill', 120, 250, {
    title: '下载常用配置',
    skillId: 'wxvideo-download',
    accountName: '独立工作者',
    keyword: 'AI',
    afterDate: '2026-01-01',
    limit: 5,
    messages: [{ role: 'user', content: 'secret' }],
    result: '上次的运行结果',
    token: 'private',
    jobId: 'old-job',
    loading: true,
    confirmed: true,
  });
  source.parentId = 'old-frame';
  source.groupId = 'old-group';
  source.locked = true;
  source.rotation = 45;
  Object.assign(source.style, { privateRuntimeToken: 'not-config' });
  source.startBinding = { shapeId: 'old-target', anchor: { x: 0, y: 0 } };
  const template = createToolTemplate(source);
  const first = instantiateTool(template);
  const second = instantiateTool(template);
  assert.notEqual(first.id, source.id);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.props, {
    title: '下载常用配置',
    skillId: 'wxvideo-download',
    accountName: '独立工作者',
    keyword: 'AI',
    afterDate: '2026-01-01',
    limit: 5,
  });
  assert.deepEqual([first.x, first.y, first.rotation], [0, 0, 0]);
  for (const field of [
    'parentId',
    'groupId',
    'startBinding',
    'endBinding',
    'locked',
  ])
    assert.equal(first[field as keyof typeof first], undefined);
  first.props.keyword = 'changed';
  assert.equal(template.props.keyword, 'AI');
  assert.equal(second.props.keyword, 'AI');
  assert.equal(Object.hasOwn(first.style, 'privateRuntimeToken'), false);
});

test('HTML and text artifacts preserve source content and text style without reusing runtime data', () => {
  const html = '<title>我的计算器</title><button onclick="run()">计算</button>';
  const shape = createShape('preview_html', 0, 0, {
    html,
    executionResult: 'old',
    status: 'running',
    authorization: 'secret',
  });
  assert.equal(suggestedToolName(shape), '我的计算器');
  assert.deepEqual(createToolTemplate(shape).props, { html });
  const text = createToolTemplate(
    createShape('text', 0, 0, {
      text: '预设内容',
      bold: true,
      italic: true,
      align: 'center',
      messages: [],
    })
  );
  assert.deepEqual(text.props, {
    text: '预设内容',
    bold: true,
    italic: true,
    align: 'center',
  });
  assert.equal(
    createToolTemplate(
      createShape('ai_result', 0, 0, { result: '可复用的文本产物' })
    ).props.text,
    '可复用的文本产物'
  );
});

test('resized product cards retain their content scale when saved to and reopened from the Dock', () => {
  const original = createShape('preview_html', 0, 0, { html: '<h1>测试</h1>' });
  const card = { ...original, w: original.w / 2, h: original.h / 2, cardScale: 0.5 };
  const library = addTool(emptyToolsLibrary(), createToolTemplate(card));
  const tool = parseToolsLibrary(serializeToolsLibrary(library)).items[0];
  const restored = instantiateTool(tool);
  assert.equal(restored.cardScale, 0.5);
  assert.equal(restored.w / restored.cardScale, original.w);
  assert.equal(restored.h / restored.cardScale, original.h);
});

test('media and ephemeral blob resources cannot become reusable tools', () => {
  assert.equal(canSaveTool(null), false);
  assert.equal(canSaveTool(createShape('image', 0, 0)), false);
  assert.throws(() => createToolTemplate(createShape('image', 0, 0)), /请选择/);
  assert.throws(
    () =>
      createToolTemplate(
        createShape('preview_html', 0, 0, {
          html: '<img src="blob:temporary-image">',
        })
      ),
    /临时媒体/
  );
  assert.throws(
    () => createToolTemplate(createShape('skill', 0, 0, { limit: 11 })),
    /1–10/
  );
});

test('renaming and removal affect only the chosen template, never instantiated board cards', () => {
  const template = createToolTemplate(
    createShape('note', 0, 0, { text: '一张便签' })
  );
  const placed = instantiateTool(template);
  const library = addTool(emptyToolsLibrary(), template);
  const renamed = renameTool(library, template.id, '新名称');
  assert.equal(renamed.items[0].name, '新名称');
  assert.equal(library.items[0].name, '一张便签');
  assert.equal(placed.props.text, '一张便签');
  assert.equal(removeTool(renamed, template.id).items.length, 0);
  assert.throws(() => renameTool(library, template.id, '  '), /工具名称/);
});

test('JSON backups round-trip and merge repeatedly without overwriting existing names or duplicates', () => {
  const one = createToolTemplate(createShape('text', 0, 0, { text: 'one' }));
  const two = createToolTemplate(createShape('text', 0, 0, { text: 'two' }));
  const existing = renameTool(
    addTool(emptyToolsLibrary(), one),
    one.id,
    '保留本地名称'
  );
  const incoming = addTool(addTool(emptyToolsLibrary(), one), two);
  const parsed = parseToolsLibrary(serializeToolsLibrary(incoming));
  const result = mergeToolsLibrary(existing, parsed);
  assert.equal(result.added, 1);
  assert.equal(result.library.items[0].name, '保留本地名称');
  assert.equal(mergeToolsLibrary(result.library, parsed).added, 0);
  assert.deepEqual(
    parseToolsLibrary(serializeToolsLibrary(result.library)),
    result.library
  );
  assert.equal(
    addTool(
      existing,
      createToolTemplate(createShape('text', 0, 0, { text: 'one' }))
    ).items.length,
    1
  );
});

test('browser storage writes only the new key and surfaces write errors', () => {
  const records = new Map([
    [LEGACY_TOOLS_STORAGE_KEY, 'original legacy bytes'],
  ]);
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  assert.deepEqual(loadToolsLibrary(storage), emptyToolsLibrary());
  const library = addTool(
    emptyToolsLibrary(),
    createToolTemplate(createShape('text', 0, 0, { text: '本地保存' }))
  );
  saveToolsLibrary(library, storage);
  assert.ok(records.has(TOOLS_STORAGE_KEY));
  assert.equal(records.get(LEGACY_TOOLS_STORAGE_KEY), 'original legacy bytes');
  assert.deepEqual(loadToolsLibrary(storage), library);
  assert.throws(
    () =>
      saveToolsLibrary(library, {
        ...storage,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      }),
    /quota/
  );
  records.set(TOOLS_STORAGE_KEY, 'not json');
  assert.throws(() => loadToolsLibrary(storage), /有效/);
  assert.equal(records.get(TOOLS_STORAGE_KEY), 'not json');
});

test('old HTML, ai_result and article tools recover once, preserving old data and remembering removals', () => {
  const legacy = JSON.stringify([
    {
      id: 'custom-1',
      type: 'preview_html',
      label: '旧应用',
      props: { html: '<h1>hello</h1>', w: 700, h: 500, token: 'secret' },
    },
    {
      id: 'custom-2',
      type: 'ai_result',
      label: '旧文本',
      props: {
        text: '旧内容',
        color: '#f0fdf4',
        messages: [{ role: 'user', text: 'private' }],
      },
    },
    {
      id: 'custom-3',
      type: 'blog_post',
      label: '旧文章',
      props: {
        title: '文章',
        url: 'https://example.test/article',
        description: '摘要',
      },
    },
    {
      id: 'custom-4',
      type: 'image',
      label: '图片',
      props: { src: 'blob:old' },
    },
  ]);
  const first = recoverLegacyTools(emptyToolsLibrary(), legacy);
  assert.equal(first.added, 3);
  assert.equal(first.skipped, 1);
  assert.equal(first.library.items[0].w, 700);
  assert.equal(first.library.items[0].h, 500);
  assert.equal(first.library.items[1].style.fill, '#f0fdf4');
  assert.deepEqual(first.library.items[0].props, { html: '<h1>hello</h1>' });
  const removed = removeTool(first.library, first.library.items[0].id);
  const second = recoverLegacyTools(removed, legacy);
  assert.equal(second.added, 0);
  assert.equal(second.library.items.length, 2);
  assert.equal(JSON.parse(legacy)[0].props.token, 'secret');
});

test('malformed, unsafe and oversized imports reject before storage mutations', () => {
  assert.throws(() => parseToolsLibrary('[]'), /有效/);
  assert.throws(
    () =>
      parseToolsLibrary(
        JSON.stringify({ ...emptyToolsLibrary(), version: 99 })
      ),
    /格式/
  );
  const item = createToolTemplate(
    createShape('blog_post', 0, 0, { url: 'https://example.test' })
  );
  assert.throws(
    () =>
      parseToolsLibrary(
        JSON.stringify({
          ...emptyToolsLibrary(),
          items: [{ ...item, props: { url: 'javascript:alert(1)' } }],
        })
      ),
    /无效|不安全|地址|协议/
  );
  assert.throws(
    () =>
      parseToolsLibrary(
        JSON.stringify({ ...emptyToolsLibrary(), items: [item, item] })
      ),
    /重复标识/
  );
  assert.throws(
    () => parseToolsLibrary(' '.repeat(2 * 1024 * 1024 + 1)),
    /2 MiB/
  );
  assert.throws(
    () => recoverLegacyTools(emptyToolsLibrary(), 'broken'),
    /无法解析/
  );
});
