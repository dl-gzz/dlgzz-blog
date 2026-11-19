import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARTICLE_CONTEXT_LIMITS,
  ArticleContextInputError,
  boundArticleContent,
  parseArticleContextRequest,
  resolveArticleReference,
} from '../src/lib/whiteboard-article-context';

const origins = ['https://www.dlgzz.com', 'https://dlgzz.com'];

test('article URLs resolve only to local blog content, with explicit locale support', () => {
  for (const url of [
    '/blog/workbuddy-start',
    'https://www.dlgzz.com/blog/workbuddy-start?source=board#section',
    'https://dlgzz.com/zh/blog/workbuddy-start/',
  ]) {
    assert.deepEqual(resolveArticleReference(url, 'zh', origins), {
      slug: 'workbuddy-start',
      locale: 'zh',
    });
  }
  assert.deepEqual(
    resolveArticleReference('/en/blog/nested/article', 'zh', origins),
    { slug: 'nested/article', locale: 'en' }
  );
  assert.deepEqual(
    resolveArticleReference('/blog/%E7%9F%A5%E8%AF%86', 'zh', origins),
    { slug: '知识', locale: 'zh' }
  );
  assert.deepEqual(resolveArticleReference('/blog/article', 'en', origins), {
    slug: 'article',
    locale: 'en',
  });
});

test('external URLs, non-blog paths and traversal are rejected before any I/O', () => {
  const rejected = [
    'https://other.test/blog/a',
    'https://www.dlgzz.com.evil.test/blog/a',
    'https://www.dlgzz.com@evil.test/blog/a',
    'https://user@www.dlgzz.com/blog/a',
    '//www.dlgzz.com/blog/a',
    'javascript:alert(1)',
    'file:///blog/a',
    'http://www.dlgzz.com/blog/a',
    '/api/article',
    '/docs/article',
    '/fr/blog/a',
    '/blog/',
    '/blog//a',
    '/blog/a//',
    '/blog/a/../secret',
    '/blog/./secret',
    '/blog/%2e%2e/secret',
    '/blog/%252e%252e/secret',
    '/blog/a%2fb',
    '/blog/a%5cb',
    '/blog/a\\b',
    '/blog/a%00b',
    '/blog/a%0ab',
    '/blog/%zz',
    '/blog/a.mdx',
    '/blog/a b',
    ' /blog/a',
    '/blog/%EF%BC%8F',
    `https://www.dlgzz.com/blog/${'a'.repeat(161)}`,
  ];
  for (const url of rejected) {
    assert.throws(
      () => resolveArticleReference(url, 'zh', origins),
      ArticleContextInputError,
      url
    );
  }
});

test('article request has bounded, unique correlation IDs and one to three URLs', () => {
  assert.deepEqual(
    parseArticleContextRequest({
      items: [{ id: 'shape:abc_1', url: '/blog/a' }],
    }),
    {
      locale: 'zh',
      items: [{ id: 'shape:abc_1', url: '/blog/a' }],
    }
  );
  const invalid = [
    null,
    [],
    {},
    { items: [] },
    {
      items: Array.from({ length: 4 }, (_, i) => ({
        id: `${i}`,
        url: '/blog/a',
      })),
    },
    {
      items: [
        { id: 'a', url: '/blog/a' },
        { id: 'a', url: '/blog/b' },
      ],
    },
    { items: [{ id: '<script>', url: '/blog/a' }] },
    { items: [{ id: 'a', url: 'x'.repeat(2049) }] },
    { items: [{ id: 'a', url: '' }] },
    { items: [{ id: 'a', url: '/blog/a' }], locale: 'fr' },
  ];
  for (const value of invalid)
    assert.throws(
      () => parseArticleContextRequest(value),
      ArticleContextInputError
    );
});

test('article body preserves prose but excludes MDX metadata, imports and saved executable artifacts', () => {
  const source =
    '---\ntitle: Test\npremium: true\n---\nimport Widget from "widget";\nexport const metadata = {};\n\n# 正文\n\n这是正文。\n\n{/* dlgzz-courseware-html:start */}\n<script>secret</script>\n{/* dlgzz-courseware-html:end */}\n';
  assert.deepEqual(boundArticleContent(source), {
    content: '# 正文\n\n这是正文。',
    truncated: false,
  });
});

test('article body never exceeds the per-article character allowance', () => {
  const limit = ARTICLE_CONTEXT_LIMITS.contentCharacters;
  assert.deepEqual(boundArticleContent('字'.repeat(limit)), {
    content: '字'.repeat(limit),
    truncated: false,
  });
  assert.deepEqual(boundArticleContent('字'.repeat(limit + 1)), {
    content: '字'.repeat(limit),
    truncated: true,
  });
  assert.deepEqual(boundArticleContent(' \n '), {
    content: '',
    truncated: false,
  });
});
