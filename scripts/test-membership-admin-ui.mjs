// Run with MEMBERSHIP_TEST_DEPS pointing to a temporary jsdom install.
// Uses the real component; every request and clipboard operation is isolated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { JSDOM } = require(
  require.resolve('jsdom', { paths: [process.env.MEMBERSHIP_TEST_DEPS] })
);
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://fixture.example.test',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let copied = '';
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: async (text) => {
      copied = text;
    },
  },
});
const React = require('react');
const { createRoot } = require('react-dom/client');
const bundle = await build({
  entryPoints: ['src/components/membership/membership-admin-panel.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
});
const module = { exports: {} };
vm.runInThisContext(
  '(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})'
)(require, module, module.exports);
const root = createRoot(document.getElementById('root'));
let refreshes = 0;
let requests = 0;
let resolveRequest;
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, '/api/membership/activation/issue');
  assert.deepEqual(JSON.parse(options.body), {
    label: '',
    source: 'planet',
    durationDays: 365,
  });
  return await new Promise((resolve) => {
    resolveRequest = resolve;
  });
};
const button = (text) =>
  [...document.querySelectorAll('button')].find((node) =>
    node.textContent.includes(text)
  );
try {
  await React.act(async () =>
    root.render(
      React.createElement(module.exports.MembershipAdminPanel, {
        onIssued: () => refreshes++,
      })
    )
  );
  assert.ok(document.querySelector('label[for]'));
  await React.act(async () => {
    document
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      );
    document
      .querySelector('form')
      .dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true })
      );
  });
  assert.equal(requests, 1, 'Rapid submissions issue only once');
  assert.equal(button('正在生成').disabled, true);
  await React.act(async () =>
    resolveRequest({
      ok: true,
      json: async () => ({
        success: true,
        code: 'MEM-TEST-ONLY-NOT-REAL',
        durationDays: 365,
      }),
    })
  );
  assert.equal(refreshes, 1);
  assert.equal(
    button('给下一位').disabled,
    true,
    'Must save before clearing code'
  );
  const unload = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  assert.equal(unload.defaultPrevented, true);
  await React.act(async () => button('复制发给用户').click());
  assert.ok(copied.includes('MEM-TEST-ONLY-NOT-REAL'));
  assert.ok(copied.includes('https://fixture.example.test/auth/register'));
  assert.ok(copied.includes('只兑换一次'));
  assert.equal(button('给下一位').disabled, false);
  await React.act(async () => button('给下一位').click());
  assert.equal(document.querySelector('code'), null);
  assert.equal(button('生成会员码').disabled, false);
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: '测试权限拒绝' }),
  });
  await React.act(async () => button('生成会员码').click());
  assert.equal(
    document.querySelector('[role="alert"]').textContent,
    '测试权限拒绝'
  );
  assert.equal(button('生成会员码').disabled, false, 'Recover from failure');
  console.log(
    'PASS: real React form labels, duplicate-submit prevention, save-before-clear, unload warning, delivery copy, next recipient, server error recovery. No production requests.'
  );
} finally {
  await React.act(async () => root.unmount());
  dom.window.close();
}
