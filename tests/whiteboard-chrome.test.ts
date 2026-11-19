import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DrawingToolsPanel from '../src/components/own-whiteboard/DrawingToolsPanel';
import ShapeView from '../src/components/own-whiteboard/ShapeView';
import StylePalette from '../src/components/own-whiteboard/StylePalette';
import { createShape } from '../src/components/own-whiteboard/core/model';
import {
  CARD_TYPES,
  DEFAULT_STYLE,
  SHAPE_LABELS,
  type ShapeType,
} from '../src/components/own-whiteboard/core/types';
import ToolsDock, {
  type ToolsDockProps,
} from '../src/components/own-whiteboard/dock/ToolsDock';

const noop = () => {};

test('an article card exposes one safe read link outside the inert editing body', () => {
  const renderArticle = (url: string, interactive: boolean) => {
    const shape = createShape('blog_post', 0, 0, { title: '文章' });
    shape.props.url = url;
    return renderToStaticMarkup(
      createElement(ShapeView, {
        shape,
        shapes: [shape],
        interactive,
        selected: false,
        editing: false,
        finishEditing: noop,
        updateProps: noop,
        insertShape: noop,
        notify: noop,
        resolveAsset: () => undefined,
      })
    );
  };
  for (const interactive of [false, true]) {
    const markup = renderArticle('/blog/fixture', interactive);
    assert.equal((markup.match(/打开文章/g) ?? []).length, 1);
    assert.match(
      markup,
      /<a class="owb-card-open-article" data-board-interactive="true" href="\/blog\/fixture" target="_blank" rel="noopener noreferrer" draggable="false"/
    );
    if (!interactive) {
      assert.match(markup, /data-board-interactive="false" inert=""/);
      assert.match(
        markup,
        /<\/div><\/div><\/div><a class="owb-card-open-article"/
      );
    }
  }
  for (const url of ['javascript:alert(1)', '//example.com/unknown', ''])
    assert.doesNotMatch(renderArticle(url, false), /owb-card-open-article/);
});

test('custom product shapes retain their type labels without a brand badge', () => {
  function renderShape(type: ShapeType) {
    const shape = createShape(type, 0, 0);
    return renderToStaticMarkup(
      createElement(ShapeView, {
        shape,
        shapes: [shape],
        interactive: false,
        selected: false,
        editing: false,
        finishEditing: noop,
        updateProps: noop,
        insertShape: noop,
        notify: noop,
        resolveAsset: () => undefined,
      })
    );
  }
  for (const type of CARD_TYPES) {
    const markup = renderShape(type);
    assert.doesNotMatch(markup, /owb-card-brand/);
    assert.ok(markup.includes(`class="owb-card-kind">${SHAPE_LABELS[type]}`));
  }
  for (const type of ['rectangle', 'note', 'arrow'] as const) {
    assert.doesNotMatch(renderShape(type), /owb-card-kind/);
  }
});

// Next transforms JSX automatically; the standalone tsx runner uses the classic
// runtime for this project's jsx:preserve setting. Scope its React binding to
// this test file without changing the production components or dependencies.
const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
before(() =>
  Object.defineProperty(globalThis, 'React', {
    value: React,
    configurable: true,
    writable: true,
  })
);
after(() => {
  if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
  else Reflect.deleteProperty(globalThis, 'React');
});

/** Inspect the markup emitted by the real components, not a copied UI fixture. */
function buttons(html: string): string[] {
  return html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
}

function button(html: string, accessibleName: string): string {
  const matches = buttons(html).filter((markup) =>
    markup
      .slice(0, markup.indexOf('>'))
      .includes(`aria-label="${accessibleName}"`)
  );
  assert.equal(
    matches.length,
    1,
    `expected one button named ${accessibleName}`
  );
  return matches[0];
}

function pressed(html: string, accessibleName: string): boolean {
  return /^<button\b[^>]*aria-pressed="true"/.test(
    button(html, accessibleName)
  );
}

test('drawing toolbar renders exactly the eight default emoji tools and media/more/close controls', () => {
  const html = renderToStaticMarkup(
    createElement(DrawingToolsPanel, {
      tool: 'draw',
      onSelect: noop,
      onInsertMedia: noop,
      onClose: noop,
    })
  );
  const primary = [
    ['选择', '➤'],
    ['平移', '🤚'],
    ['画笔', '✏️'],
    ['橡皮', '🧹'],
    ['矩形', '⬜'],
    ['箭头', '↗️'],
    ['文字', '🔤'],
    ['便签', '🟨'],
  ];
  for (const [label, emoji] of primary) {
    const markup = button(html, label);
    assert.ok(markup.includes(emoji), `${label} retains its emoji icon`);
    assert.match(markup, /^<button\b[^>]*title="[^"]+"/);
    assert.equal(pressed(html, label), label === '画笔');
  }
  assert.equal(
    buttons(html).filter((markup) =>
      /^<button\b[^>]*aria-pressed=/.test(markup)
    ).length,
    8
  );
  assert.match(button(html, '更多绘图工具'), /aria-expanded="false"/);
  button(html, '插入媒体');
  button(html, '关闭绘图工具栏');
  button(html, '移动绘图工具栏');
  for (const label of ['荧光笔', '椭圆', '三角形', '菱形', '线条', '框架'])
    assert.ok(
      !html.includes(`aria-label="${label}"`),
      `${label} starts in collapsed more tools`
    );
  assert.match(html, /role="toolbar"/);
  assert.match(html, /aria-label="绘图工具"/);
  assert.match(html, /bottom:100px/);
  assert.match(html, /left:50%/);
  assert.match(html, /translateX\(-50%\)/);
});

const colors = [
  ['黑色', '#1d1d1d'],
  ['灰色', '#9aa0a6'],
  ['浅紫色', '#c77dce'],
  ['紫色', '#9c27b0'],
  ['蓝色', '#3155df'],
  ['浅蓝色', '#4a9ad4'],
  ['黄色', '#f2b43d'],
  ['橙色', '#e86b24'],
  ['绿色', '#19815c'],
  ['浅绿色', '#51a65a'],
  ['浅红色', '#ed6b78'],
  ['红色', '#dd233b'],
];

test('style palette exposes all twelve named colors with the selected stroke state', () => {
  const html = renderToStaticMarkup(
    createElement(StylePalette, {
      style: { ...DEFAULT_STYLE, stroke: '#3155df' },
      onChange: noop,
      onMore: noop,
    })
  );
  assert.equal(
    buttons(html).filter((markup) =>
      /^<button\b[^>]*aria-label="颜色 — /.test(markup)
    ).length,
    12
  );
  for (const [name, color] of colors) {
    const label = `颜色 — ${name}`;
    assert.ok(button(html, label).includes(`background-color:${color}`));
    assert.equal(pressed(html, label), name === '蓝色');
  }
  assert.match(html, /aria-label="绘图样式"/);
});

test('style palette retains fill, line width, line style, opacity and more-style entries', () => {
  const html = renderToStaticMarkup(
    createElement(StylePalette, {
      style: {
        ...DEFAULT_STYLE,
        stroke: '#3155df',
        fill: '#3155df24',
        strokeWidth: 4,
        opacity: 0.65,
        dash: true,
      },
      onChange: noop,
      onMore: noop,
    })
  );
  for (const label of ['无填充', '浅色填充', '实心填充'])
    assert.equal(pressed(html, label), label === '浅色填充');
  for (const label of ['S', 'M', 'L', 'XL'])
    assert.equal(pressed(html, `线条大小 ${label}`), label === 'L');
  assert.equal(pressed(html, '实线'), false);
  assert.equal(pressed(html, '虚线'), true);
  button(html, '更多样式');
  const sliders = html.match(/<input\b[^>]*aria-label="不透明度"[^>]*>/g) ?? [];
  assert.equal(sliders.length, 1);
  for (const attribute of [
    'type="range"',
    'min="0.1"',
    'max="1"',
    'step="0.05"',
    'value="0.65"',
  ])
    assert.ok(
      sliders[0].includes(attribute),
      `opacity input contains ${attribute}`
    );
});

test('fill and line width selected indicators follow every supported option', () => {
  for (const [label, fill] of [
    ['无填充', 'transparent'],
    ['浅色填充', '#3155df24'],
    ['实心填充', '#3155df'],
  ]) {
    const html = renderToStaticMarkup(
      createElement(StylePalette, {
        style: { ...DEFAULT_STYLE, stroke: '#3155df', fill },
        onChange: noop,
        onMore: noop,
      })
    );
    assert.equal(pressed(html, label), true);
  }
  for (const [label, strokeWidth] of [
    ['S', 1.5],
    ['M', 2.5],
    ['L', 4],
    ['XL', 6],
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(StylePalette, {
        style: { ...DEFAULT_STYLE, strokeWidth },
        onChange: noop,
        onMore: noop,
      })
    );
    assert.equal(pressed(html, `线条大小 ${label}`), true);
  }
});

test('Dock renders all eight supplied app actions as named buttons in order', () => {
  const dockActions: NonNullable<ToolsDockProps['dockActions']> = [
    { id: 'home', label: '返回首页', icon: '🏠', onClick: noop },
    {
      id: 'assistant',
      label: 'AI 助手',
      icon: '✨',
      onClick: noop,
      active: true,
    },
    { id: 'article', label: '博客文章', icon: '📝', onClick: noop },
    { id: 'html', label: 'HTML 应用', icon: '🌐', onClick: noop },
    { id: 'text', label: '文本卡片', icon: '📄', onClick: noop },
    { id: 'download', label: '视频下载', icon: '⬇', onClick: noop },
    { id: 'analyzer', label: '视频分析', icon: '🤖', onClick: noop },
    { id: 'drawing', label: '绘图工具', icon: '🧰', onClick: noop },
  ];
  const html = renderToStaticMarkup(
    createElement(ToolsDock, {
      selectedShape: null,
      onInsert: noop,
      notify: noop,
      dockActions,
    })
  );
  let previousPosition = -1;
  for (const action of dockActions) {
    const markup = button(html, action.label);
    assert.ok(markup.includes(action.icon), `${action.label} retains its icon`);
    assert.equal(pressed(html, action.label), Boolean(action.active));
    const position = html.indexOf(`aria-label="${action.label}"`);
    assert.ok(
      position > previousPosition,
      `${action.label} retains its supplied Dock order`
    );
    previousPosition = position;
  }
  assert.match(html, /aria-label="工作台 Dock"/);
  assert.match(html, /aria-label="应用与工具"/);
});
