import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRasterSize,
  escapeXML,
  exportBoardImage,
  exportBoardJSON,
  getExportBounds,
  importBoardJSON,
  renderBoardSVG,
  wrapExportText,
} from '../src/components/own-whiteboard/core/export';
import {
  assertPersistentResources,
  loadBoard,
  putAsset,
  saveBoard,
  validateAsset,
} from '../src/components/own-whiteboard/core/storage';
import {
  type BoardDocument,
  type BoardShape,
  DEFAULT_STYLE,
} from '../src/components/own-whiteboard/core/types';

function shape(
  type: BoardShape['type'],
  overrides: Partial<BoardShape> = {}
): BoardShape {
  return {
    id: 'shape-1',
    type,
    x: 10,
    y: 20,
    w: 200,
    h: 100,
    rotation: 0,
    style: { ...DEFAULT_STYLE },
    props: {},
    ...overrides,
  };
}

function board(shapes: BoardShape[] = []): BoardDocument {
  return {
    format: 'oneworker-whiteboard',
    version: 2,
    id: 'doc-1',
    name: '白板 & <标题>',
    currentPageId: 'page-1',
    pages: [
      { id: 'page-1', name: '页面 1', camera: { x: 0, y: 0, zoom: 1 }, shapes },
    ],
  };
}

test('SVG escapes document titles and text without HTML foreignObject', () => {
  const svg = renderBoardSVG(
    board([
      shape('text', { props: { text: '<script>alert("x")</script> & 安全' } }),
    ]),
    'page-1'
  );
  assert.match(svg, /白板 &amp; &lt;标题&gt;/);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script|<foreignObject/);
  assert.equal(escapeXML('\u0000<>&"\''), '&lt;&gt;&amp;&quot;&apos;');
});

test('SVG primitives use world coordinates and per-shape rotation in grouped frames', () => {
  const svg = renderBoardSVG(
    board([
      shape('frame', { id: 'frame-1', x: 0, y: 0, w: 500, h: 500 }),
      shape('rectangle', {
        parentId: 'frame-1',
        groupId: 'group-1',
        rotation: 30,
      }),
    ]),
    'page-1'
  );
  assert.match(svg, /transform="rotate\(30 110 70\)"/);
  assert.match(svg, /<rect x="10" y="20" width="200" height="100"/);
});

test('arrow bindings resolve to target world geometry and SVG attributes are not duplicated', () => {
  const svg = renderBoardSVG(
    board([
      shape('rectangle', { id: 'target', x: 300, y: 200, w: 100, h: 100 }),
      shape('arrow', {
        id: 'arrow',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        endBinding: { shapeId: 'target', anchor: { x: 0.5, y: 0.5 } },
      }),
    ]),
    'page-1'
  );
  assert.match(svg, /points="0,0 350,250"/);
  const polyline = svg.match(/<polyline[^>]+>/)?.[0] ?? '';
  assert.equal((polyline.match(/ fill=/g) ?? []).length, 1);
  assert.match(polyline, /marker-end="url\(#arrow-1\)"/);
});

test('card exports state the summary boundary, never embed live HTML', () => {
  const svg = renderBoardSVG(
    board([
      shape('preview_html', {
        w: 500,
        h: 250,
        props: {
          title: '网页',
          html: '<iframe src="https://example.test"></iframe>',
        },
      }),
    ]),
    'page-1'
  );
  assert.match(svg, /卡片摘要，不含视频画面或网页实时内容/);
  assert.doesNotMatch(svg, /<iframe/);
});

test('images are inlined, cropped, and missing external content fails explicitly', () => {
  const doc = board([
    shape('image', {
      props: { assetId: 'asset_test', crop: { x: 0.25, y: 0, w: 0.5, h: 1 } },
    }),
  ]);
  assert.throws(() => renderBoardSVG(doc, 'page-1'), /图片资源未内嵌/);
  const svg = renderBoardSVG(doc, 'page-1', {
    asset_test: 'data:image/png;base64,AQID',
  });
  assert.match(svg, /<image x="-90" y="20" width="400" height="100"/);
  assert.match(svg, /href="data:image\/png;base64,AQID"/);
  assert.match(svg, /clip-path="url\(#image-0\)"/);
});

test('empty SVG is valid-sized and unknown pages are rejected', () => {
  assert.deepEqual(getExportBounds(board(), 'page-1'), {
    x: 0,
    y: 0,
    w: 800,
    h: 600,
  });
  assert.match(renderBoardSVG(board(), 'page-1'), /viewBox="0 0 800 600"/);
  assert.throws(() => renderBoardSVG(board(), 'missing'), /找不到/);
});

test('raster allocation limits catch edge, area and invalid dimensions before rendering', async () => {
  assert.doesNotThrow(() => assertRasterSize(1920, 1080));
  for (const [w, h] of [
    [9000, 100],
    [7000, 7000],
    [0, 500],
    [Number.NaN, 500],
    [Number.POSITIVE_INFINITY, 1],
  ])
    assert.throws(() => assertRasterSize(w, h), /页面过大/);
  await assert.rejects(
    exportBoardImage(board([shape('rectangle', { w: 9000 })]), 'page-1', 'png'),
    /页面过大/
  );
});

test('text wrapping handles Chinese and explicit line breaks', () => {
  assert.deepEqual(wrapExportText('独立工作者\nhello', 40, 20), [
    '独立',
    '工作',
    '者',
    'hel',
    'lo',
  ]);
  assert.equal(wrapExportText('很长的中文内容需要限制', 40, 20, 2).length, 2);
});

test('plain text exports all overflowing lines and extends the output bounds', () => {
  const doc = board([
    shape('text', { h: 60, props: { text: '第一行\n第二行\n第三行' } }),
  ]);
  const svg = renderBoardSVG(doc, 'page-1');
  assert.match(svg, /第一行/);
  assert.match(svg, /第二行/);
  assert.match(svg, /第三行/);
  assert.doesNotMatch(svg, /…/);
  const lineSteps = [...svg.matchAll(/<tspan[^>]+dy="([^"]+)"/g)].map((match) =>
    Number(match[1])
  );
  assert.deepEqual(lineSteps, [0, 24 * 1.4, 24 * 1.4]);
  const bounds = getExportBounds(doc, 'page-1');
  assert.ok(bounds.y + bounds.h >= 20 + 12 + 3 * 24 * 1.4 + 32);
});

test('text and note preserve bold, italic, alignment and CSS padding', () => {
  const svg = renderBoardSVG(
    board([
      shape('text', {
        props: { text: '居中', bold: true, italic: true, align: 'center' },
      }),
      shape('note', {
        id: 'note-2',
        x: 300,
        props: { text: '靠右', bold: true, italic: true, align: 'right' },
      }),
    ]),
    'page-1'
  );
  assert.match(
    svg,
    /<text x="110" y="50"[^>]+font-weight="700" font-style="italic" text-anchor="middle"/
  );
  assert.match(
    svg,
    /<text x="482" y="62"[^>]+font-weight="700" font-style="italic" text-anchor="end"/
  );
});

test('overflow bounds use the original rotation center instead of moving the text', () => {
  const doc = board([
    shape('text', {
      h: 20,
      rotation: 90,
      props: { text: Array(10).fill('一行').join('\n') },
    }),
  ]);
  const bounds = getExportBounds(doc, 'page-1');
  const svg = renderBoardSVG(doc, 'page-1');
  assert.match(svg, /transform="rotate\(90 110 30\)"/);
  // Ten lines overflow downward before rotation, so a 90-degree turn extends left.
  assert.ok(bounds.x <= -260);
  assert.ok(bounds.y <= -102);
  assert.ok(bounds.y + bounds.h >= 162);
});

test('portable JSON round-trip retains all pages without requiring browser storage for empty assets', async () => {
  const doc = board([shape('note', { props: { text: '本地备份' } })]);
  doc.pages.push({
    id: 'page-2',
    name: '第二页',
    camera: { x: 10, y: 30, zoom: 2 },
    shapes: [],
  });
  const exported = await exportBoardJSON(doc);
  const serialized = await exported.text();
  const bundle = JSON.parse(serialized);
  assert.equal(bundle.format, 'oneworker-whiteboard-bundle');
  assert.deepEqual(bundle.assets, []);
  assert.deepEqual(await importBoardJSON(serialized), doc);
  assert.deepEqual(await importBoardJSON(JSON.stringify(doc)), doc);
});

test('malformed portable resources fail before writing any assets', async () => {
  const document = board([
    shape('image', { props: { assetId: 'asset_missing' } }),
  ]);
  const bundle = {
    format: 'oneworker-whiteboard-bundle',
    version: 1,
    document,
    assets: [],
  };
  await assert.rejects(
    importBoardJSON(JSON.stringify(bundle)),
    /资源包缺少媒体/
  );
  await assert.rejects(
    importBoardJSON(
      JSON.stringify({
        ...bundle,
        assets: [
          {
            id: 'asset_missing',
            name: 'bad',
            mimeType: 'image/png',
            data: 'not base64!',
          },
        ],
      })
    ),
    /Base64/
  );
  await assert.rejects(importBoardJSON('bad JSON'), /有效的 JSON/);
});

test('temporary blob resources cannot be persisted and storage failure is surfaced', async () => {
  assert.throws(
    () =>
      assertPersistentResources(
        board([shape('image', { props: { src: 'blob:temporary' } })])
      ),
    /临时媒体地址不能保存/
  );
  await assert.rejects(loadBoard('unit-test'), /无法使用本地数据库/);
  await assert.rejects(saveBoard('unit-test', board()), /无法使用本地数据库/);
});

test('asset validation rejects invalid ids, empty files, unsupported MIME and oversize files', async () => {
  const valid = {
    id: 'asset_ok',
    name: 'image.png',
    mimeType: 'image/png',
    blob: new Blob(['sample'], { type: 'image/png' }),
  };
  assert.doesNotThrow(() => validateAsset(valid));
  assert.throws(() => validateAsset({ ...valid, id: '../bad' }), /标识无效/);
  assert.throws(
    () =>
      validateAsset({ ...valid, blob: new Blob([], { type: 'image/png' }) }),
    /为空/
  );
  await assert.rejects(
    putAsset(new Blob(['x'], { type: 'text/html' }), 'bad.html'),
    /仅接受/
  );
  assert.throws(
    () =>
      validateAsset({
        ...valid,
        blob: new Blob([new Uint8Array(32 * 1024 * 1024 + 1)], {
          type: 'image/png',
        }),
      }),
    /32 MiB/
  );
});
