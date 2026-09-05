// Isolated public-catalog and real miniapp page tests; no production credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import matter from 'gray-matter';

const require = createRequire(import.meta.url);
const miniappRoot = process.env.MINIAPP_SOURCE_ROOT;
assert.ok(miniappRoot, 'Set MINIAPP_SOURCE_ROOT');
const files = (await fs.readdir('content/blog')).filter((name) =>
  /^workbuddy-.*\.zh\.mdx$/.test(name)
);
const fixture = await Promise.all(
  files.map(async (name) => ({
    slugs: [name.replace('.zh.mdx', '')],
    data: matter(await fs.readFile('content/blog/' + name, 'utf8')).data,
  }))
);
globalThis.__perfPosts = [
  ...fixture,
  { slugs: ['draft'], data: { published: false } },
];

async function loadServer(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    plugins: [
      {
        name: 'catalog-fixtures',
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|fs|@\/lib\/source|@\/lib\/premium-access)$/,
            },
            ({ path }) => ({ path, namespace: 'fixture' })
          );
          builder.onLoad(
            { filter: /.*/, namespace: 'fixture' },
            ({ path }) => ({
              loader: 'js',
              contents:
                path === 'server-only'
                  ? ''
                  : path === 'fs'
                    ? 'export const promises = new Proxy({}, {get(){throw new Error("Catalog must not read article files");}});'
                    : path === '@/lib/premium-access'
                      ? 'export function userHasPremiumAccess(){throw new Error("Public catalog must not query membership");}'
                      : 'export const authorSource={getPage:()=>null};export const blogSource={getPages:()=>globalThis.__perfPosts};',
            })
          );
        },
      },
    ],
  });
  const module = { exports: {} };
  vm.runInThisContext(
    '(function(require,module,exports){' + result.outputFiles[0].text + '\n})'
  )(require, module, module.exports);
  return module.exports;
}

const { getMiniappBlogPosts } = await loadServer('src/lib/mp-blog.ts');
const items = await getMiniappBlogPosts('zh');
assert.equal(items.length, 17);
assert.ok(
  items.every(
    (item) => item.excerpt === item.description && !('copyContent' in item)
  )
);
assert.ok(
  items.every(
    (item, index) =>
      !index || Date.parse(items[index - 1].date) >= Date.parse(item.date)
  )
);
const listRoute = await loadServer('src/app/api/mp/posts/route.ts');
const getList = (query) =>
  listRoute.GET({
    nextUrl: new URL('https://www.dlgzz.com/api/mp/posts?' + query),
  });
const slugs = [];
for (let page = 1; page <= 3; page++) {
  const response = await getList('page=' + page + '&pageSize=8');
  assert.match(response.headers.get('cache-control'), /^public,/);
  const { data } = await response.json();
  assert.equal(data.items.length, page === 3 ? 1 : 8);
  assert.equal(data.pagination.hasMore, page < 3);
  slugs.push(...data.items.map((item) => item.slug));
}
assert.equal(new Set(slugs).size, 17);
for (const value of ['NaN', 'Infinity', '-1', '1.5', '0']) {
  const { data } = await (
    await getList('page=' + value + '&pageSize=' + value)
  ).json();
  assert.equal(data.pagination.page, 1);
  assert.equal(data.pagination.pageSize, 10);
}
assert.equal(
  (await (await getList('pageSize=999')).json()).data.items.length,
  17
);
const configRoute = await loadServer('src/app/api/mp/config/route.ts');
assert.match(
  (await configRoute.GET()).headers.get('cache-control'),
  /^public,/
);

const source = (file) => fs.readFile(miniappRoot + '/' + file, 'utf8');
const cacheSource = await source('utils/public-post-cache.js');
const homeSource = await source('pages/home/index.js');
const requestSource = await source('utils/request.js');
const apiSource = await source('utils/api.js');
const config = { baseUrl: 'https://www.dlgzz.com', defaultLocale: 'zh' };
function loadWx(code, imports, wx) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    require: (name) => {
      assert.ok(name in imports, 'Unexpected import: ' + name);
      return imports[name];
    },
    wx,
    console: { error() {} },
  });
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const payload = (names, hasMore = true) => ({
  success: true,
  data: {
    items: names.map((slug) => ({ slug, title: slug, description: '简介' })),
    pagination: { hasMore },
  },
});
const storage = new Map();
const wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
};
const cache = loadWx(cacheSource, { './config': config }, wx);
assert.equal(cache.readPublicPosts('zh', 8), null);
cache.writePublicPosts('zh', 8, payload(['cached']).data);
assert.equal(cache.readPublicPosts('zh', 8).items[0].slug, 'cached');
assert.equal(cache.readPublicPosts('en', 8), null);
assert.equal(cache.readPublicPosts('zh', 10), null);
const saved = [...storage.values()][0];
saved.savedAt = Date.now() - 86400001;
assert.equal(cache.readPublicPosts('zh', 8), null);
saved.savedAt = Date.now() + 10000;
assert.equal(cache.readPublicPosts('zh', 8), null);
saved.savedAt = Date.now();
saved.data.items = 'corrupt';
assert.equal(cache.readPublicPosts('zh', 8), null);
const privateLooking = payload(['cached']);
Object.assign(privateLooking.data.items[0], {
  copyContent: 'private',
  token: 'secret',
  premium: true,
});
cache.writePublicPosts('zh', 8, privateLooking.data);
assert.deepEqual(Object.keys(cache.readPublicPosts('zh', 8).items[0]).sort(), [
  'description',
  'slug',
  'title',
]);
const brokenCache = loadWx(
  cacheSource,
  { './config': config },
  {
    getStorageSync() {
      throw new Error('unavailable');
    },
    setStorageSync() {
      throw new Error('full');
    },
  }
);
assert.equal(brokenCache.readPublicPosts('zh', 8), null);
assert.doesNotThrow(() =>
  brokenCache.writePublicPosts('zh', 8, payload(['a']).data)
);

function home(cacheImpl = cache) {
  let page;
  const requests = [];
  vm.runInNewContext(homeSource, {
    Page: (value) => {
      page = value;
    },
    wx,
    console: { error() {} },
    require: (name) =>
      ({
        '../../utils/api': {
          getPosts: (args) => {
            const task = deferred();
            requests.push({ ...task, args });
            return task.promise;
          },
          getConfig: () => {
            throw new Error('Homepage must not request unused config');
          },
        },
        '../../utils/config': config,
        '../../utils/public-post-cache': cacheImpl,
      })[name],
  });
  page.setData = (value) => Object.assign(page.data, value);
  return { page, requests };
}
const { page, requests } = home();
const first = page.onLoad();
assert.equal(
  page.data.allPosts[0].slug,
  'cached',
  'Cache rendered synchronously'
);
assert.equal(requests.length, 1, 'List starts immediately without config');
assert.equal(page.data.showingCache, true);
requests[0].resolve(payload(['fresh']));
await first;
assert.equal(page.data.allPosts[0].slug, 'fresh');
assert.equal(page.data.showingCache, false);
const more = page.loadPosts();
await page.loadPosts();
assert.equal(requests.length, 2, 'Load-more deduplicates in-flight requests');
requests[1].resolve(payload(['fresh', 'second'], false));
await more;
assert.equal(page.data.allPosts.length, 2);
assert.equal(page.data.page, 3);
await page.loadPosts();
assert.equal(requests.length, 2);
const old = page.bootstrap();
const latest = page.bootstrap();
requests[3].resolve(payload(['latest'], false));
await latest;
requests[2].resolve(payload(['stale']));
await old;
assert.equal(
  page.data.allPosts[0].slug,
  'latest',
  'Older response cannot overwrite refresh'
);
const failed = page.bootstrap();
requests[4].reject(new Error('offline'));
await failed;
assert.equal(page.data.allPosts[0].slug, 'latest');
assert.ok(page.data.loadError);
const retry = page.retryPosts();
assert.equal(requests[5].args.page, 1);
requests[5].resolve(payload(['recovered'], false));
await retry;
assert.equal(page.data.loadError, '');
const unloaded = page.bootstrap();
page.onUnload();
requests[6].resolve(payload(['late']));
await unloaded;
assert.equal(page.data.allPosts[0].slug, 'recovered');
const cold = home(brokenCache);
const coldStart = cold.page.onLoad();
assert.equal(cold.page.data.loading, true);
cold.requests[0].resolve({ success: true, data: { items: null } });
await coldStart;
assert.ok(
  cold.page.data.loadError,
  'Malformed/failed response is not an empty catalog'
);

const wire = [];
const requestWx = {
  getStorageSync: () => 'member-token',
  request: (options) => {
    wire.push(options);
    options.success({ statusCode: 200, data: { success: true } });
  },
};
const requestModule = loadWx(requestSource, { './config': config }, requestWx);
const api = loadWx(apiSource, { './request': requestModule }, requestWx);
await api.getPosts();
await api.getConfig();
await api.getPostDetail({ slug: 'test' });
await api.redeemMembership('code');
for (const request of wire.slice(0, 2)) {
  assert.equal(request.header.authorization, undefined);
  assert.equal(request.timeout, 10000);
}
for (const request of wire.slice(2))
  assert.equal(request.header.authorization, 'Bearer member-token');
assert.equal(wire[3].method, 'POST');
assert.equal(wire[3].timeout, undefined, 'Membership write timeout unchanged');
console.log(
  'PASS: 17 public metadata-only articles, pagination/cache headers, immediate cached home, request races/retry, storage failures, auth isolation.'
);
