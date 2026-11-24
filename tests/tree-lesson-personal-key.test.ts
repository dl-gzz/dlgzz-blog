import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Node runs each test file in its own child process. No real login, env file,
// database, API key, or network request is needed for this route-level suite.
require('./register-server-only.cjs');
function stubModule(id: string, exports: object) {
  const filename = require.resolve(id);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeJS.Module;
}

const origin = 'https://whiteboard.invalid';
const endpoint = 'https://api.deepseek.com/v1/chat/completions';
const proxy = 'https://site-provider.invalid/v1';
const personalA = 'sk-' + 'a'.repeat(32);
const personalB = 'sk-' + 'b'.repeat(32);
const siteKey = 'sk-' + 'c'.repeat(32);
const base = { road: 20, spacing: 5 };
const settings = { road: 30, spacing: 5 };
const leakedText = 'PRIVATE_UPSTREAM_DETAIL';
const captures: { url: string; init?: RequestInit }[] = [];
let member = true;
let userNumber = 0;
let authHeaders: Headers[] = [];
let upstream: (url: string, init?: RequestInit) => Promise<Response>;

stubModule('@/lib/urls/urls', { getBaseUrl: () => origin });
stubModule('@/lib/auth', {
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const observed = new Headers(headers);
        authHeaders.push(observed);
        const cookie = observed.get('cookie');
        return cookie ? { user: { id: cookie } } : null;
      },
    },
  },
});
stubModule('@/lib/premium-access', {
  userHasPremiumAccess: async () => member,
});
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  captures.push({ url, init });
  return upstream(url, init);
};
const { POST } =
  require('../src/app/api/whiteboard/tree-lesson-draft/route') as {
    POST: (request: Request) => Promise<Response>;
  };

function req(
  mode: string | null,
  key?: string,
  extra?: {
    cookie?: string | null;
    crossSite?: boolean;
    instruction?: string;
    credentialMode?: string | null;
  }
) {
  const headers = new Headers({ 'content-type': 'application/json', origin });
  if (mode !== null) headers.set('X-Tree-AI-Mode', mode);
  if (key !== undefined) headers.set('Authorization', 'Bearer ' + key);
  if (extra?.cookie !== null)
    headers.set(
      'Cookie',
      extra?.cookie ?? 'session=route-test-' + ++userNumber
    );
  if (extra?.crossSite) headers.set('sec-fetch-site', 'cross-site');
  return new Request(origin + '/api/whiteboard/tree-lesson-draft', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base,
      instruction: extra?.instruction ?? '把路长改成 30 米。',
      credentialMode:
        extra?.credentialMode === null
          ? undefined
          : (extra?.credentialMode ??
            (mode === 'personal' ? 'personal' : undefined)),
    }),
  });
}

beforeEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_BASE_URL = proxy;
  process.env.DEEPSEEK_MODEL = 'site-model-fixture';
  member = true;
  captures.length = 0;
  authHeaders = [];
  upstream = async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(settings) } }],
    });
});

test('concurrent personal requests use only their own keys and the fixed official endpoint, with no site key configured', async () => {
  const first = req('personal', personalA, {
    cookie: 'session=teacher-A',
    instruction: '改成 30 米，甲班',
    credentialMode: 'personal',
  });
  const second = req('personal', personalB, {
    cookie: 'session=teacher-B',
    instruction: '改成 30 米，乙班',
  });
  const responses = await Promise.all([POST(first), POST(second)]);
  for (const r of responses) {
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { settings });
    assert.match(r.headers.get('cache-control') ?? '', /no-store/);
  }
  assert.equal(authHeaders.length, 2);
  for (const h of authHeaders) assert.deepEqual([...h.keys()], ['cookie']);
  assert.deepEqual(authHeaders.map((h) => h.get('cookie')).sort(), [
    'session=teacher-A',
    'session=teacher-B',
  ]);
  assert.equal(captures.length, 2);
  for (const { url, init } of captures) {
    assert.equal(url, endpoint);
    assert.equal(init?.redirect, 'error');
    const body = String(init?.body);
    const h = new Headers(init?.headers);
    assert.equal(
      h.get('authorization'),
      'Bearer ' + (body.includes('甲班') ? personalA : personalB)
    );
    assert.equal(h.has('cookie'), false);
    assert.doesNotMatch(body, /sk-|session=|site-model-fixture/);
  }
  assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
});

test('site mode and the old client retain the site provider; personal mode overrides it for one call only', async () => {
  process.env.DEEPSEEK_API_KEY = siteKey;
  for (const [mode, key] of [
    ['personal', personalA],
    ['site', undefined],
    [null, undefined],
  ] as const) {
    assert.equal((await POST(req(mode, key))).status, 200);
  }
  assert.deepEqual(
    captures.map((c) => c.url),
    [endpoint, proxy + '/chat/completions', proxy + '/chat/completions']
  );
  assert.deepEqual(
    captures.map((c) => new Headers(c.init?.headers).get('authorization')),
    ['Bearer ' + personalA, 'Bearer ' + siteKey, 'Bearer ' + siteKey]
  );
  assert.equal(process.env.DEEPSEEK_API_KEY, siteKey);
});

test('missing key, mismatched key/mode, invalid mode, and malformed key never fall back to the site', async () => {
  process.env.DEEPSEEK_API_KEY = siteKey;
  for (const [mode, key] of [
    ['personal', undefined],
    ['site', personalA],
    [null, personalA],
    ['unknown', undefined],
    ['personal', 'x'],
    ['personal', 'sk-' + 'x'.repeat(254)],
  ] as const) {
    const response = await POST(req(mode, key));
    assert.equal(response.status, 400, String(mode));
    assert.equal((await response.json()).code, 'INVALID_AI_CREDENTIALS');
  }
  delete process.env.DEEPSEEK_API_KEY;
  assert.equal((await POST(req(null))).status, 503);
  assert.equal(captures.length, 0);
});

test('personal intent requires matching body marker and both credential headers, even through a misconfigured proxy', async () => {
  process.env.DEEPSEEK_API_KEY = siteKey;
  for (const request of [
    req(null, undefined, { credentialMode: 'personal' }),
    req('personal', personalA, { credentialMode: null }),
    req('site', undefined, { credentialMode: 'personal' }),
  ]) {
    const r = await POST(request);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'INVALID_AI_CREDENTIALS');
  }
  // "site" is not a valid optional body marker; malformed bodies are rejected
  // before the credential-header check (no upstream request in either case).
  assert.equal(
    (await POST(req('personal', personalA, { credentialMode: 'site' }))).status,
    400
  );
  assert.equal(captures.length, 0);
});

test('a personal key never bypasses the origin, website login, membership or per-user budget', async () => {
  assert.equal(
    (await POST(req('personal', personalA, { crossSite: true }))).status,
    403
  );
  assert.equal(authHeaders.length, 0);
  assert.equal(
    (await POST(req('personal', personalA, { cookie: null }))).status,
    401
  );
  member = false;
  assert.equal((await POST(req('personal', personalA))).status, 403);
  assert.equal(captures.length, 0);
  member = true;
  const options = { cookie: 'session=budget-test' };
  for (let i = 0; i < 6; i++)
    assert.equal((await POST(req('personal', personalA, options))).status, 200);
  assert.equal((await POST(req('personal', personalB, options))).status, 429);
  assert.equal(captures.length, 6);
});

test('a key pasted in the lesson instructions is never echoed or sent to a provider', async () => {
  process.env.DEEPSEEK_API_KEY = siteKey;
  for (const request of [
    req('personal', personalA, { instruction: '改成30米。 ' + personalB }),
    req(null, undefined, {
      instruction: '我的密钥：' + personalB + '，请改成30米。',
    }),
  ]) {
    const response = await POST(request);
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.equal(JSON.parse(text).code, 'KEY_IN_PROMPT');
    assert.ok(!text.includes(personalB));
  }
  assert.equal(captures.length, 0);
});

test('provider errors are distinguished from site login, and never expose upstream bodies or keys or retry with site funds', async () => {
  process.env.DEEPSEEK_API_KEY = siteKey;
  for (const [status, expectedStatus, code] of [
    [401, 424, 'DEEPSEEK_AUTH'],
    [403, 424, 'DEEPSEEK_AUTH'],
    [402, 424, 'DEEPSEEK_BALANCE'],
    [429, 429, 'DEEPSEEK_RATE_LIMIT'],
    [500, 502, 'DEEPSEEK_UNAVAILABLE'],
  ] as const) {
    upstream = async () => new Response(leakedText + personalA, { status });
    const result = await POST(req('personal', personalA));
    assert.equal(result.status, expectedStatus);
    const raw = await result.text();
    assert.equal(JSON.parse(raw).code, code);
    assert.ok(!raw.includes(personalA) && !raw.includes(leakedText));
  }
  upstream = async () => {
    throw new DOMException(leakedText + personalA, 'TimeoutError');
  };
  const timeout = await POST(req('personal', personalA));
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).code, 'DEEPSEEK_TIMEOUT');
  assert.equal(captures.length, 6);
  assert.ok(
    captures.every(
      (c) =>
        c.url === endpoint &&
        new Headers(c.init?.headers).get('authorization') ===
          'Bearer ' + personalA
    )
  );
});
