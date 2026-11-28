import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const site = 'https://www.dlgzz.com';
const official = 'https://api.deepseek.com/v1/chat/completions';
const siteProvider = 'https://configured-platform.example/v1/chat/completions';
const fakePersonalKey = 'synthetic-personal-key';
const fakePlatformKey = 'synthetic-platform-key';
const publicMessage = { role: 'user', content: 'Return a JSON answer.' };

async function loadRoute() {
  const stubs = {
    'next/server': 'export const NextResponse = Response;',
    'server-only': '',
    '@/lib/server': 'export const getSession = () => globalThis.testBoardSession;',
    '@/lib/premium-access': 'export const userHasPremiumAccess = (...v) => globalThis.testBoardMembership(...v);',
    './hermes-admin-access': 'export const canAccessHermesAdmin = () => false;',
    './local-client-origin': 'export const getLocalClientOrigin = () => "http://localhost:3001";',
    './urls/urls': `export const getBaseUrl = () => ${JSON.stringify(site)};`,
  };
  const result = await build({
    absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
    entryPoints: ['src/app/api/whiteboard/chat/route.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    plugins: [{
      name: 'mock-auth-and-membership',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) => {
          if (path === './server') path = '@/lib/server';
          if (Object.hasOwn(stubs, path)) return { path, namespace: 'stub' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents: stubs[path],
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(
    module, module.exports, createRequire(import.meta.url)
  );
  return module.exports.POST;
}

test('whiteboard DeepSeek authentication, isolation and logging', async (t) => {
  const POST = await loadRoute();
  const env = {
    DEEPSEEK_API_KEY: fakePlatformKey,
    DEEPSEEK_BASE_URL: 'https://configured-platform.example/v1',
    DEEPSEEK_MODEL: 'platform-configured-model',
  };
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  t.after(() => {
    delete globalThis.testBoardSession;
    delete globalThis.testBoardMembership;
  });

  let paid = false;
  let nextUser = 0;
  let calls = [];
  let logs = [];
  let upstream = () => Response.json({ choices: [{ message: { content: 'verified' } }] });
  t.mock.method(console, 'warn', (...parts) => logs.push(parts));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return upstream();
  });
  globalThis.testBoardMembership = async (id, options) => {
    assert.equal(id, globalThis.testBoardSession.user.id);
    assert.deepEqual(options, { membershipOnly: true });
    return paid;
  };

  async function request({ loggedIn = true, key, keyOwner, purpose, origin = site, rawBody, stableId } = {}) {
    globalThis.testBoardSession = loggedIn
      ? { user: { id: stableId ?? String(++nextUser) } }
      : null;
    return POST(new Request(site + '/api/whiteboard/chat', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(key !== undefined ? { 'x-deepseek-api-key': key } : {}),
        ...(keyOwner !== undefined ? { 'x-whiteboard-key-owner': keyOwner } : {}),
      },
      body: rawBody ?? JSON.stringify({ messages: [publicMessage], purpose }),
    }));
  }

  await t.test('a login is required even if a personal key is supplied', async () => {
    assert.equal((await request({ loggedIn: false, key: fakePersonalKey })).status, 401);
    assert.equal(calls.length, 0);
  });

  await t.test('non-members cannot spend site credits in any mode', async () => {
    for (const purpose of [undefined, 'courseware']) {
      assert.equal((await request({ purpose })).status, 403);
    }
    assert.equal(calls.length, 0);
  });

  await t.test('a cross-origin browser request cannot reach the provider', async () => {
    assert.equal((await request({ origin: 'https://other.example', key: fakePersonalKey })).status, 403);
    assert.equal(calls.length, 0);
  });

  await t.test('empty/malformed key and oversized request are rejected before upstream', async () => {
    for (const key of ['', 'fake with space', 'x'.repeat(257)]) {
      assert.equal((await request({ key })).status, 400);
    }
    assert.equal((await request({ rawBody: '{' })).status, 400);
    assert.equal((await request({ rawBody: 'x'.repeat(128_001) })).status, 413);
    assert.equal(calls.length, 0);
  });

  await t.test('personal key ignores site provider/model overrides and never follows redirects', async () => {
    assert.equal((await request({ key: fakePersonalKey, stableId: 'second', keyOwner: 'first' })).status, 409);
    assert.equal(calls.length, 0);
    const response = await request({ key: fakePersonalKey });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true, message: 'verified', provider: 'deepseek', model: 'deepseek-flash', keySource: 'user',
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, official);
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + fakePersonalKey);
    assert.equal(JSON.parse(calls[0].options.body).model, 'deepseek-flash');
    assert.ok(!calls[0].options.body.includes(fakePersonalKey));
  });

  await t.test('upstream key rejection never falls back and never logs keys or body', async () => {
    paid = true;
    calls = [];
    logs = [];
    upstream = () => new Response('UPSTREAM_BODY ' + fakePersonalKey + ' ' + fakePlatformKey, { status: 401 });
    const response = await request({ key: fakePersonalKey });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /拒绝了你的 API Key/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, official);
    assert.deepEqual(logs, [['Whiteboard DeepSeek upstream status:', 401]]);
    upstream = () => Response.json({ choices: [{ message: { content: 'verified' } }] });
  });

  await t.test('a transport error is reported without any upstream error string', async () => {
    logs = [];
    upstream = () => { throw new Error(fakePersonalKey + ' transport failure'); };
    const response = await request({ key: fakePersonalKey });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /synthetic-personal-key/);
    assert.deepEqual(logs, [['Whiteboard DeepSeek request failed']]);
    upstream = () => Response.json({ choices: [{ message: { content: 'verified' } }] });
  });

  await t.test('site credits go to paid members only and retain site configuration', async () => {
    calls = [];
    const response = await request({ purpose: 'courseware' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).keySource, 'server');
    assert.equal(calls[0].url, siteProvider);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + fakePlatformKey);
    assert.equal(JSON.parse(calls[0].options.body).model, 'platform-configured-model');
    assert.deepEqual(JSON.parse(calls[0].options.body).response_format, { type: 'json_object' });
  });

  await t.test('no platform key does not prevent a signed-in user from supplying their own', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    try {
      assert.equal((await request()).status, 503);
      assert.equal((await request({ key: fakePersonalKey })).status, 200);
    } finally {
      process.env.DEEPSEEK_API_KEY = fakePlatformKey;
    }
  });

  await t.test('site fallback model is supported by the official endpoint', async () => {
    delete process.env.DEEPSEEK_MODEL;
    try {
      const response = await request();
      assert.equal(response.status, 200);
      assert.equal((await response.json()).model, 'deepseek-flash');
    } finally {
      process.env.DEEPSEEK_MODEL = 'platform-configured-model';
    }
  });

  await t.test('rate limit also applies to personal requests', async () => {
    for (let i = 0; i < 10; i++) {
      assert.equal((await request({ stableId: 'rate-test', key: fakePersonalKey })).status, 200);
    }
    assert.equal((await request({ stableId: 'rate-test', key: fakePersonalKey })).status, 429);
  });
});
