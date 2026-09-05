// Isolated text, React clipboard, and WeChat page tests. No external AI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import matter from 'gray-matter';

const require = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_BASE_URL = 'https://www.dlgzz.com';
async function load(entry, mock = false) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    plugins: [
      {
        name: 'copy-test',
        setup(builder) {
          builder.onResolve(
            { filter: /^(server-only|@\/lib\/source|@\/lib\/premium-access)$/ },
            (args) => ({ path: args.path, namespace: 'fixture' })
          );
          builder.onLoad(
            { filter: /.*/, namespace: 'fixture' },
            ({ path }) => ({
              loader: 'js',
              contents:
                path === 'server-only'
                  ? ''
                  : path === '@/lib/premium-access'
                    ? 'export async function userHasPremiumAccess(){ return globalThis.__copyAccess; }'
                    : 'export const authorSource = {getPage:()=>null}; export const blogSource = {getPage:(slugs)=>globalThis.__copyPost?.slugs.join("/") === slugs.join("/") ? globalThis.__copyPost : null};',
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

const { buildArticleCopy } = await load('src/lib/article-copy.ts');
const { readBlogMarkdown } = await load('src/lib/blog-markdown.ts');
const { getMiniappBlogDetail } = await load('src/lib/mp-blog.ts');
const files = (await fs.readdir('content/blog')).filter((file) =>
  /^workbuddy-.*\.zh\.mdx$/.test(file)
);
assert.equal(files.length, 17);
let sample;
for (const file of files) {
  const { data, content } = matter(
    await fs.readFile('content/blog/' + file, 'utf8')
  );
  const slug = file.replace('.zh.mdx', '');
  globalThis.__copyPost = { data, slugs: [slug] };
  const website = buildArticleCopy({
    title: data.title,
    description: data.description,
    body: await readBlogMarkdown('zh', slug),
    sourceUrl: 'https://www.dlgzz.com/blog/' + slug,
    images: data.images?.length ? data.images : data.image ? [data.image] : [],
  });
  const miniapp = await getMiniappBlogDetail('zh', slug);
  assert.equal(
    miniapp.copyContent,
    website,
    'Website and miniapp must copy exactly the same text'
  );
  assert.ok(
    website.includes(content.trim()),
    'Every body character retained, not a summary'
  );
  assert.ok(website.startsWith('# ' + data.title));
  assert.ok(!website.includes('published: true'));
  sample = website;
}
const last = globalThis.__copyPost;
last.data.premium = true;
globalThis.__copyAccess = false;
assert.equal(
  (await getMiniappBlogDetail('zh', last.slugs[0])).copyContent,
  null
);
assert.equal(
  (await getMiniappBlogDetail('zh', last.slugs[0], 'member')).copyContent,
  null
);
globalThis.__copyAccess = true;
assert.ok(
  (await getMiniappBlogDetail('zh', last.slugs[0], 'member')).copyContent
);
last.data.published = false;
assert.equal(await getMiniappBlogDetail('zh', last.slugs[0], 'member'), null);
await assert.rejects(() => readBlogMarkdown('zh', '../env'));
await assert.rejects(() => readBlogMarkdown('zh', '/etc/passwd'));
await assert.rejects(() => readBlogMarkdown('../', 'article'));
const longBody =
  '```js\nimport x from "x";\nconst prompt = "<任务>完整保留</任务>";\n```\n' +
  '正文'.repeat(50000);
assert.ok(
  buildArticleCopy({
    title: 'Long',
    body: longBody,
    sourceUrl: 'https://www.dlgzz.com/blog/test',
  }).includes(longBody)
);
assert.ok(
  buildArticleCopy({
    title: 'Gallery',
    body: '',
    sourceUrl: 'https://www.dlgzz.com/blog/test',
    images: ['/image.png'],
  }).includes('https://www.dlgzz.com/image.png')
);

// Real miniapp handler, with only wx clipboard/toasts and Page registration mocked.
let page;
let clipboard;
let toast;
const wx = {
  setClipboardData: (value) => {
    clipboard = value;
  },
  showToast: (value) => {
    toast = value.title;
  },
};
const miniappRoot = process.env.MINIAPP_SOURCE_ROOT;
assert.ok(miniappRoot, 'Set MINIAPP_SOURCE_ROOT');
vm.runInNewContext(
  await fs.readFile(miniappRoot + '/pages/post/index.js', 'utf8'),
  {
    Page: (value) => {
      page = value;
    },
    require: () => ({}),
    wx,
    console,
  }
);
page.setData = (value) => Object.assign(page.data, value);
page.data = {
  detail: { copyContent: sample, locked: false },
  loading: false,
  copying: false,
};
page.copyArticle();
assert.equal(clipboard.data, sample);
assert.equal(page.data.copying, true);
clipboard.success();
clipboard.complete();
assert.equal(page.data.copying, false);
assert.ok(toast.includes('已复制'));
clipboard = null;
page.data.detail.locked = true;
page.copyArticle();
assert.equal(clipboard, null);
page.data.detail.locked = false;
page.data.detail.copyContent = null;
page.copyArticle();
assert.equal(clipboard, null);
page.data.detail.copyContent = sample;
page.copyArticle();
clipboard.fail();
clipboard.complete();
assert.ok(toast.includes('失败'));
assert.equal(page.data.copying, false);

const { JSDOM } = require(
  require.resolve('jsdom', { paths: [process.env.ARTICLE_COPY_TEST_DEPS] })
);
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://www.dlgzz.com',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let written;
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: async (text) => {
      written = text;
    },
  },
});
const React = require('react');
const { createRoot } = require('react-dom/client');
const { CopyArticleButton } = await load(
  'src/components/blog/copy-article-button.tsx'
);
const root = createRoot(document.getElementById('root'));
try {
  await React.act(async () =>
    root.render(React.createElement(CopyArticleButton, { text: sample }))
  );
  await React.act(async () => document.querySelector('button').click());
  assert.equal(written, sample);
  assert.ok(document.querySelector('[role="status"]'));
  navigator.clipboard.writeText = async () => {
    throw new Error('denied');
  };
  await React.act(async () => document.querySelector('button').click());
  assert.equal(
    document.querySelector('textarea').value,
    sample,
    'Full manual fallback when browser denies clipboard'
  );
  assert.equal(
    document.querySelector('[role="status"]'),
    null,
    'Never report success on failure'
  );
} finally {
  await React.act(async () => root.unmount());
  dom.window.close();
}
console.log(
  'PASS: all 17 complete articles match across website/miniapp, cloud links and code retained, long text not truncated, locked/unpublished denied, safe paths, both clipboard handlers and failure recovery.'
);
