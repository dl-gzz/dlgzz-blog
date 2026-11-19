import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatRequest,
  captureCurrentFrame,
  describeDownloadResult,
  downloadRequest,
  isolatedHtml,
  normalizeMessages,
  parseBoardOperations,
  readApiResponse,
  safeWebUrl,
} from '../src/components/own-whiteboard/cards/helpers';
import {
  type BoardShape,
  DEFAULT_STYLE,
} from '../src/components/own-whiteboard/core/types';

function card(
  type: BoardShape['type'],
  id = 'shape:one',
  locked = false
): BoardShape {
  return {
    id,
    type,
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    rotation: 0,
    props: {},
    style: DEFAULT_STYLE,
    locked,
  };
}

test('URL whitelist rejects executable, credentialed, protocol-relative and malformed media', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>x</script>',
    '//evil.test',
    '/\\evil.test',
    'https://user:pass@example.com',
    'https://exa\nmple.com',
    'file:///etc/passwd',
    'blob:null/123',
  ]) {
    assert.equal(safeWebUrl(value, true), '', value);
  }
  assert.equal(safeWebUrl('/images/cover.png'), '/images/cover.png');
  assert.equal(
    safeWebUrl('https://example.com/video.mp4'),
    'https://example.com/video.mp4'
  );
  assert.equal(safeWebUrl('blob:https://example.com/123'), '');
  assert.equal(
    safeWebUrl('blob:https://example.com/123', true),
    'blob:https://example.com/123'
  );
});

test('legacy chat history is normalized without dropping user and AI text', () => {
  assert.deepEqual(
    normalizeMessages([
      { role: 'user', text: '问题' },
      { role: 'ai', text: '回答' },
      { role: 'error', text: '403' },
      { role: 'assistant', content: '新的回答' },
      null,
      { role: 'unknown', text: 'invalid' },
    ]),
    [
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '回答' },
      { role: 'assistant', content: '历史请求错误：403' },
      { role: 'assistant', content: '新的回答' },
    ]
  );
});

test('chat request preserves messages, uses the existing contract and enforces byte budget', () => {
  const request = buildChatRequest(
    [
      { role: 'system', content: 'untrusted import' },
      { role: 'user', content: 'hi' },
    ],
    [card('ai_result')]
  );
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[0].content, /shape:one/);
  assert.doesNotMatch(request.messages[0].content, /untrusted import/);
  assert.deepEqual(request.messages[1], { role: 'user', content: 'hi' });
  assert.equal(
    'purpose' in request,
    false,
    'do not opt into an entitlement-bypassing purpose'
  );
  assert.throws(
    () => buildChatRequest([{ role: 'user', content: '中'.repeat(50000) }], []),
    /接口限制/
  );
});

test('AI JSON operations accept only bounded content create/update on supported cards', () => {
  const source = JSON.stringify({
    voice_response: '已准备',
    operations: [
      {
        action: 'create',
        type: 'preview_html',
        x: 1e12,
        id: 'spoof',
        props: { html: '<h1>Hello</h1>', injected: true, w: 1e12 },
      },
      {
        action: 'update',
        id: 'shape:one',
        props: { text: 'updated', dangerous: 'x' },
      },
      { action: 'delete', id: 'shape:one', props: {} },
      {
        action: 'create',
        type: 'video_player',
        props: { videoUrl: 'javascript:alert(1)' },
      },
      {
        action: 'update',
        id: 'missing',
        type: 'ai_result',
        props: { text: 'missing' },
      },
      { action: 'update', id: 'locked', props: { text: 'locked' } },
      {
        action: 'update',
        id: 'shape:one',
        type: 'preview_html',
        props: { html: 'wrong type' },
      },
    ],
  });
  const result = parseBoardOperations(`\`\`\`json\n${source}\n\`\`\``, [
    card('ai_result'),
    card('ai_result', 'locked', true),
  ]);
  assert.equal(result.summary, '已准备');
  assert.equal(result.skipped, 5);
  assert.deepEqual(result.operations, [
    {
      action: 'create',
      type: 'preview_html',
      props: { html: '<h1>Hello</h1>' },
    },
    {
      action: 'update',
      type: 'ai_result',
      id: 'shape:one',
      props: { text: 'updated' },
    },
  ]);
  assert.equal(
    parseBoardOperations('window.alert(1)', []).operations.length,
    0
  );
  assert.equal(parseBoardOperations('null', []).operations.length, 0);
  assert.equal(
    parseBoardOperations(
      JSON.stringify({
        operations: [
          {
            action: 'create',
            type: 'ai_result',
            props: { text: 'a'.repeat(200001) },
          },
        ],
      }),
      []
    ).skipped,
    1
  );
  const many = parseBoardOperations(
    JSON.stringify({
      operations: Array.from({ length: 30 }, () => ({
        action: 'create',
        type: 'ai_result',
        props: { text: 'bounded' },
      })),
    }),
    []
  );
  assert.equal(many.operations.length, 20);
  assert.equal(many.skipped, 10);
});

test('HTML document prepends a restrictive policy without interpreting the content', () => {
  const source = '<script>window.parent.document.body.remove()</script>';
  const result = isolatedHtml(source);
  assert.ok(result.startsWith('<meta http-equiv="Content-Security-Policy"'));
  assert.match(result, /connect-src 'none'/);
  assert.match(result, /frame-src 'none'/);
  assert.match(result, /script-src 'unsafe-inline'/);
  assert.ok(result.endsWith(source));
});

test('API failures display authentication, permission, rate and non-JSON errors', async () => {
  await assert.rejects(
    readApiResponse(
      new Response(JSON.stringify({ success: false, error: '仅限管理员' }), {
        status: 403,
      })
    ),
    /仅限管理员/
  );
  await assert.rejects(
    readApiResponse(new Response('', { status: 401 })),
    /登录/
  );
  await assert.rejects(
    readApiResponse(
      new Response('', { status: 429, headers: { 'retry-after': '42' } })
    ),
    /42 秒/
  );
  await assert.rejects(
    readApiResponse(new Response('<html>bad gateway</html>', { status: 502 })),
    /502/
  );
  await assert.rejects(
    readApiResponse(
      new Response(JSON.stringify({ success: false }), { status: 200 })
    ),
    /请求失败/
  );
  assert.deepEqual(
    await readApiResponse(
      new Response(JSON.stringify({ success: true, analysis: 'ok' }))
    ),
    { success: true, analysis: 'ok' }
  );
});

test('download request matches current API: bounded count and no caller-defined output path', () => {
  assert.deepEqual(
    downloadRequest({
      accountName: ' 视频号 ',
      keyword: ' 关键词 ',
      afterDate: '2026-11-18',
      limit: '3',
    }),
    {
      accountName: '视频号',
      keyword: '关键词',
      afterDate: '2026-11-18',
      limit: 3,
    }
  );
  assert.deepEqual(
    downloadRequest({
      accountName: '视频号',
      keyword: '关键词',
      afterDate: '',
      limit: '1',
    }),
    { accountName: '视频号', keyword: '关键词', limit: 1 }
  );
  for (const limit of ['0', '11', '1.5', 'abc'])
    assert.throws(
      () =>
        downloadRequest({
          accountName: 'x',
          keyword: 'y',
          afterDate: '',
          limit,
        }),
      /1–10/
    );
  for (const afterDate of ['2026-02-31', '2026-99-01', 'today'])
    assert.throws(
      () =>
        downloadRequest({
          accountName: 'x',
          keyword: 'y',
          afterDate,
          limit: '1',
        }),
      /日期/
    );
});

test('zero and partial downloads never claim an unconditional completion', () => {
  assert.match(
    describeDownloadResult({ success: true, count: 0, items: [] }),
    /未下载任何视频/
  );
  const partial = describeDownloadResult({
    count: 1,
    outDir: '/srv/video',
    items: [
      { title: 'one', filePath: '/srv/video/one.mp4' },
      { title: 'two', error: 'upstream failed' },
    ],
  });
  assert.match(partial, /已下载 1 条视频，1 条失败/);
  assert.match(partial, /upstream failed/);
  assert.match(partial, /服务器保存目录/);
  assert.match(
    describeDownloadResult({ count: 100, items: [{ title: 'missing path' }] }),
    /未下载任何视频/
  );
  assert.match(
    describeDownloadResult({ items: [{ title: 'missing path' }] }),
    /未确认保存/
  );
});

test('frame capture uses the visible current frame, scales it and never seeks', () => {
  const original = globalThis.document;
  const draws: unknown[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args: unknown[]) => draws.push(args) }),
    toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=',
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, 'canvas');
        return canvas;
      },
    },
  });
  try {
    const video = {
      readyState: 2,
      videoWidth: 3840,
      videoHeight: 2160,
      currentTime: 12.5,
    } as HTMLVideoElement;
    assert.deepEqual(captureCurrentFrame(video), {
      frameBase64: 'aGVsbG8=',
      time: 12.5,
    });
    assert.equal(video.currentTime, 12.5);
    assert.equal(canvas.width, 1280);
    assert.equal(canvas.height, 720);
    assert.equal(draws[0][0], video);
    assert.throws(
      () => captureCurrentFrame({ readyState: 0 } as HTMLVideoElement),
      /尚未加载/
    );
    canvas.toDataURL = () => {
      throw new DOMException('Tainted', 'SecurityError');
    };
    assert.throws(() => captureCurrentFrame(video), /CORS.*尚未调用 AI/);
  } finally {
    if (original)
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: original,
      });
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
