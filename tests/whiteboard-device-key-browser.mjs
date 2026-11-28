// Run against a local Next server. Supply playwright-core via PLAYWRIGHT_CORE_PATH
// if not installed locally. All sessions, credentials and model replies are fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const base = process.env.BOARD_TEST_ORIGIN || 'http://localhost:3237';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const context = await browser.newContext({ locale: 'zh-CN' });
  let account = 'test-account-a';
  const fixture = 'synthetic-board-key-no-secret';
  const requests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/auth/get-session') return route.fulfill({ json: {
      user: { id: account, email: 'test@example.invalid', name: 'Test', emailVerified: true },
      session: { id: 'test-session', userId: account, expiresAt: '2099-01-01T00:00:00Z' },
    } });
    if (url.pathname === '/api/whiteboard/chat') {
      const headers = route.request().headers();
      requests.push([headers['x-deepseek-api-key'], headers['x-whiteboard-key-owner']]);
      return route.fulfill({ json: { success: true, message: JSON.stringify({
        summary: '测试卡', operations: [{ action: 'create', type: 'text', props: { text: '浏览器测试结果' } }],
      }) } });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const url = base + '/en/whiteboard?board=device-key-test';
  const btn = name => page.getByRole('button', { name, exact: true });
  const dock = () => btn('AI 助手').click();
  const configured = () => btn('已用个人 Key').waitFor();
  const keyInput = () => page.getByLabel('个人 DeepSeek API Key', { exact: true });
  const remember = () => page.getByLabel('在这台设备上记住');
  const send = async () => {
    await page.getByLabel('给工作台助手的指令').fill('生成一张测试卡');
    await btn('发送').click();
    await btn('确认应用到白板').last().waitFor();
    assert.deepEqual(requests.at(-1), [fixture, account]);
  };
  const reopen = async () => { await page.reload(); await dock(); };
  const applyKey = async (persist) => {
    await btn('API Key').click();
    assert.equal(await remember().isChecked(), false);
    await keyInput().fill(fixture);
    if (persist) await remember().check();
    await btn('使用').click();
    await configured();
  };
  await page.goto(url, { timeout: 100000 });
  await dock(); await applyKey(false);
  await dock(); await dock(); await configured();
  await send(); await btn('确认应用到白板').last().click();
  await page.getByRole('complementary', { name: '白板 AI 助手' }).waitFor({ state: 'hidden' });
  await dock(); await configured(); await send();
  await reopen(); await btn('API Key').click();
  assert.equal(await remember().isChecked(), false);
  await btn('API Key').click();
  console.log('PASS: close/reopen and Apply preserve outgoing personal key; default refresh forgets.');
  await applyKey(true); await reopen(); await configured(); await send();
  const record = await page.evaluate(async (owner) => {
    const db = await new Promise(resolve => {
      const req = indexedDB.open('oneworker-whiteboard-device-keys');
      req.onsuccess = () => resolve(req.result);
    });
    try {
      return await new Promise(resolve => {
        const req = db.transaction('credentials').objectStore('credentials').get(owner);
        req.onsuccess = () => resolve({
          encrypted: req.result.data instanceof ArrayBuffer,
          extractable: req.result.wrappingKey.extractable,
        });
      });
    } finally { db.close(); }
  }, account);
  assert.deepEqual(record, { encrypted: true, extractable: false });
  account = 'test-account-b'; await reopen(); await btn('API Key').click();
  assert.equal(await remember().isChecked(), false);
  account = 'test-account-a'; await reopen(); await configured();
  await btn('已用个人 Key').click(); assert.equal(await remember().isChecked(), true);
  await remember().uncheck(); await btn('使用').click(); await configured();
  await reopen(); await applyKey(true);
  await btn('已用个人 Key').click(); await btn('清除').click();
  await btn('API Key').waitFor(); await reopen(); await btn('API Key').click();
  assert.equal(await remember().isChecked(), false);
  assert.equal(await btn('清除').count(), 0);
  console.log('PASS: opt-in survives refresh, account isolation, unremember, clear and reload.');
} finally { await browser.close(); }
