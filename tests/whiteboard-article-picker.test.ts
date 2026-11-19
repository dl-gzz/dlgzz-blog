import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ArticlePicker, {
  ArticlePickerResults,
  type ArticlePickerResultsProps,
} from '../src/components/own-whiteboard/ArticlePicker';
import {
  filterArticleOptions,
  loadArticleOptions,
  parseArticleOptions,
} from '../src/components/own-whiteboard/article-picker';

const noop = () => {};
const source = {
  title: 'WorkBuddy 入门',
  description: '用自然语言处理工作',
  image: '/images/workbuddy.jpg',
  date: '2026-11-18T10:00:00Z',
  url: '/blog/workbuddy',
  whiteboardCategory: 'AI 工作流',
};
const articles = parseArticleOptions({ posts: [source] });
const resultsProps: ArticlePickerResultsProps = {
  articles,
  loading: false,
  error: '',
  query: '',
  onRetry: noop,
  onSelect: noop,
};

test('article API metadata maps to existing blog card props', () => {
  assert.deepEqual(articles, [
    {
      title: source.title,
      description: source.description,
      image: source.image,
      date: source.date,
      url: source.url,
      category: source.whiteboardCategory,
    },
  ]);
});

test('article parser rejects invalid destinations and duplicate URLs', () => {
  assert.deepEqual(
    parseArticleOptions({
      posts: [
        null,
        { ...source, url: 'javascript:alert(1)' },
        { ...source, url: '//outside.example/post' },
        { ...source, title: ' ' },
        source,
        source,
      ],
    }),
    articles
  );
  assert.equal(
    parseArticleOptions({
      posts: [{ ...source, image: 'javascript:alert(1)' }],
    })[0].image,
    ''
  );
  assert.throws(() => parseArticleOptions({ success: true }), /格式/);
});

test('article search matches title, summary and category without case sensitivity', () => {
  for (const query of [' workbuddy ', '自然语言', 'AI 工作流', ''])
    assert.deepEqual(filterArticleOptions(articles, query), articles);
  assert.deepEqual(filterArticleOptions(articles, '不存在'), []);
});

test('loading uses the existing endpoint and caller cancellation signal', async () => {
  const controller = new AbortController();
  let calls = 0;
  const request: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(input, '/api/whiteboard/blog-posts?locale=zh');
    assert.equal(init?.signal, controller.signal);
    return Response.json({ success: true, posts: [source] });
  };
  assert.deepEqual(await loadArticleOptions(controller.signal, request), {
    articles,
    coursewareUnavailable: false,
  });
  assert.equal(calls, 1);
});

test('available articles remain usable when the API reports missing courseware', async () => {
  const result = await loadArticleOptions(
    new AbortController().signal,
    async () =>
      Response.json({
        success: true,
        posts: [source],
        coursewareUnavailable: true,
      })
  );
  assert.deepEqual(result, { articles, coursewareUnavailable: true });
});

test('loading propagates HTTP errors and aborted requests instead of an empty success', async () => {
  const controller = new AbortController();
  await assert.rejects(
    loadArticleOptions(controller.signal, async () =>
      Response.json({ success: false, error: '请先登录' }, { status: 401 })
    ),
    /请先登录/
  );
  const aborted: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true }
      );
    });
  const pending = loadArticleOptions(controller.signal, aborted);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('picker opens directly with search, close and loading UI isolated from canvas shortcuts', () => {
  let selected = 0;
  const markup = renderToStaticMarkup(
    createElement(ArticlePicker, { onSelect: () => selected++, onClose: noop })
  );
  assert.match(markup, /<dialog[^>]*open=""/);
  assert.match(markup, /data-board-interactive="true"/);
  assert.match(markup, /aria-label="搜索文章"/);
  assert.match(markup, /aria-label="关闭文章选择"/);
  assert.match(markup, /正在加载文章/);
  assert.equal(selected, 0);
});

test('article result states distinguish loading, failed retry, empty library and no search matches', () => {
  const render = (props: Partial<ArticlePickerResultsProps>) =>
    renderToStaticMarkup(
      createElement(ArticlePickerResults, { ...resultsProps, ...props })
    );
  assert.match(render({ loading: true }), /正在加载文章/);
  const failed = render({ error: '加载失败' });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /重新加载/);
  assert.match(render({ articles: [] }), /暂无可用文章/);
  assert.match(render({ query: 'no matches' }), /没有找到匹配的文章/);
  const markup = render({});
  assert.match(markup, /aria-label="选择文章：WorkBuddy 入门"/);
  assert.match(markup, /2026-11-18 · AI 工作流/);
  assert.match(markup, /用自然语言处理工作/);
});

test('choosing a listed article returns exactly its populated metadata', () => {
  const choices: unknown[] = [];
  const result = ArticlePickerResults({
    ...resultsProps,
    onSelect: (article) => choices.push(article),
  });
  assert.ok(Array.isArray(result));
  assert.equal(choices.length, 0);
  assert.equal(result.length, 1);
  result[0].props.onClick();
  assert.deepEqual(choices, articles);
});
