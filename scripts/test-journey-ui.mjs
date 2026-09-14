// Real React components in jsdom; all timers/requests mocked, no live payments.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import fs from 'node:fs';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { JSDOM } = require(
  require.resolve('jsdom', { paths: [process.env.MEMBERSHIP_TEST_DEPS] })
);
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://fixture.test/payment/checkout',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
let params = new URLSearchParams(
  'aoid=fixture&qr=fixture-qr&expires_at=9999999999999'
);
const router = { push: (value) => (navigated = value) };
let navigated = '';
globalThis.__uiNav = { useSearchParams: () => params, useRouter: () => router };
let intervals = new Map();
let timers = new Map();
let sequence = 0;
globalThis.setInterval = (fn, ms) => {
  const id = ++sequence;
  intervals.set(id, { fn, ms });
  return id;
};
globalThis.clearInterval = (id) => intervals.delete(id);
const nativeTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => {
  if (ms < 1000) return nativeTimeout(fn, ms, ...args);
  const id = ++sequence;
  timers.set(id, { fn, ms });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);
let requests = 0;
let responseStatus = 200;
let paymentStatus = 'processing';
globalThis.fetch = async () => {
  requests++;
  return {
    ok: responseStatus === 200,
    status: responseStatus,
    json: async () => ({
      status: paymentStatus,
      error: 'fixture-error',
      data: { amount: 1990, planName: '会员' },
    }),
  };
};
async function load(entry) {
  const bundled = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    plugins: [
      {
        name: 'ui-mocks',
        setup(b) {
          b.onResolve(
            { filter: /^(next\/navigation|react-qr-code)$/ },
            ({ path }) => ({ path, namespace: 'fixture' })
          );
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            loader: 'js',
            contents:
              path === 'next/navigation'
                ? 'module.exports=globalThis.__uiNav;'
                : 'export default function QR(){return null}',
          }));
        },
      },
    ],
  });
  const m = { exports: {} };
  vm.runInThisContext(
    '(function(require,module,exports){' + bundled.outputFiles[0].text + '\n})'
  )(require, m, m.exports);
  return m.exports.default;
}
const Checkout = await load('src/app/[locale]/payment/checkout/page.tsx');
const Success = await load('src/app/[locale]/payment/success/page.tsx');
let root = createRoot(document.getElementById('root'));
await React.act(async () => root.render(React.createElement(Checkout)));
assert.equal(requests, 1, 'check immediately');
paymentStatus = 'completed';
await React.act(async () => {
  await [...intervals.values()].find((t) => t.ms === 3000).fn();
});
assert.equal(requests, 2, 'automatic timer must actually query');
assert.ok(document.body.textContent.includes('支付已确认'));
await React.act(async () => {
  [...timers.values()].find((t) => t.ms === 1200).fn();
});
assert.equal(navigated, '/payment/success?aoid=fixture');
await React.act(async () => root.unmount());
assert.equal(intervals.size, 0, 'polls cleaned up');

for (const scenario of [
  { query: '', status: 'completed', http: 200, success: false },
  { query: 'aoid=fixture', status: 'processing', http: 200, success: false },
  { query: 'aoid=fixture', status: 'completed', http: 401, success: false },
  { query: 'aoid=fixture', status: 'completed', http: 404, success: false },
  { query: 'aoid=fixture', status: 'completed', http: 200, success: true },
]) {
  params = new URLSearchParams(scenario.query);
  paymentStatus = scenario.status;
  responseStatus = scenario.http;
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Success)));
  assert.equal(
    document.querySelector('h1').textContent === '支付成功',
    scenario.success
  );
  assert.ok(!document.body.textContent.includes('邮件已发送'));
  await React.act(async () => root.unmount());
}

// Exercise actual WeChat detail page failure -> retry -> success -> unload.
let page;
let fail = true;
const wx = { showToast() {}, setNavigationBarTitle() {}, switchTab() {} };
vm.runInNewContext(
  fs.readFileSync(
    process.env.MINIAPP_SOURCE_ROOT + '/pages/post/index.js',
    'utf8'
  ),
  {
    Page: (config) =>
      (page = {
        ...config,
        data: { ...config.data },
        setData(value) {
          Object.assign(this.data, value);
        },
      }),
    wx,
    console: { error() {} },
    require: (name) =>
      name.endsWith('/api')
        ? {
            getPostDetail: async () => {
              if (fail) throw new Error('offline');
              return {
                data: {
                  title: 'fixture',
                  contentBlocks: [],
                  copyContent: 'full',
                },
              };
            },
          }
        : { toAbsoluteImageUrl: (v) => v, toAbsoluteImageUrls: (v) => v },
  }
);
page.setData({ slug: 'fixture' });
await page.loadDetail('fixture');
assert.equal(page.data.loading, false);
assert.ok(page.data.loadError);
fail = false;
await page.loadDetail('fixture');
assert.equal(page.data.loadError, '');
assert.equal(page.data.detail.title, 'fixture');
await page.loadDetail('');
assert.equal(page.data.loading, false);
assert.ok(page.data.loadError);
console.log(
  'PASS: payment auto-poll, confirmed redirect, cleanup, missing/pending/unauthorized/not-found success states, miniapp failure/retry and invalid slug. No live requests.'
);
