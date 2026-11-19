'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  type ArticleOption,
  filterArticleOptions,
  loadArticleOptions,
} from './article-picker';

type PickerProps = {
  onSelect: (article: ArticleOption) => void;
  onClose: () => void;
};

export type ArticlePickerResultsProps = {
  articles: ArticleOption[];
  loading: boolean;
  error: string;
  query: string;
  onRetry: () => void;
  onSelect: PickerProps['onSelect'];
};

export function ArticlePickerResults({
  articles,
  loading,
  error,
  query,
  onRetry,
  onSelect,
}: ArticlePickerResultsProps) {
  if (loading)
    return (
      <output className="owb-article-picker__status">正在加载文章…</output>
    );
  if (error)
    return (
      <div
        className="owb-article-picker__status owb-article-picker__error"
        role="alert"
      >
        {error}
        <button
          type="button"
          className="owb-article-picker__retry"
          onClick={onRetry}
        >
          重新加载
        </button>
      </div>
    );
  const visible = filterArticleOptions(articles, query);
  if (!visible.length)
    return (
      <output className="owb-article-picker__status">
        {articles.length
          ? '没有找到匹配的文章，换个关键词试试。'
          : '暂无可用文章。'}
      </output>
    );
  return visible.map((article) => (
    <button
      key={article.url}
      type="button"
      className="owb-article-picker__item"
      aria-label={`选择文章：${article.title}`}
      onClick={() => onSelect(article)}
    >
      {article.image ? (
        <img
          src={article.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="owb-article-picker__placeholder" aria-hidden="true">
          📝
        </span>
      )}
      <span className="owb-article-picker__copy">
        <strong>{article.title}</strong>
        {article.description && (
          <span className="owb-article-picker__description">
            {article.description}
          </span>
        )}
        {(article.date || article.category) && (
          <span className="owb-article-picker__meta">
            {[article.date.slice(0, 10), article.category]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </span>
    </button>
  ));
}

export default function ArticlePicker({ onSelect, onClose }: PickerProps) {
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [coursewareUnavailable, setCoursewareUnavailable] = useState(false);
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const selected = useRef(false);

  useEffect(() => {
    const previous = document.activeElement;
    search.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    setLoading(true);
    setError('');
    setCoursewareUnavailable(false);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);
    void loadArticleOptions(controller.signal)
      .then(({ articles, coursewareUnavailable }) => {
        if (!disposed) {
          setArticles(articles);
          setCoursewareUnavailable(coursewareUnavailable);
        }
      })
      .catch((cause: unknown) => {
        if (!disposed)
          setError(
            timedOut
              ? '加载超时，请检查网络后重试。'
              : cause instanceof Error
                ? cause.message
                : '加载文章失败，请重试。'
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  return (
    <dialog
      open
      className="owb-article-picker"
      aria-label="选择博客文章"
      data-board-interactive="true"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="owb-article-picker__header">
        <div>
          <h2>博客文章</h2>
          <p>选择一篇文章放到白板</p>
        </div>
        <button
          type="button"
          className="owb-article-picker__close"
          title="关闭文章选择"
          aria-label="关闭文章选择"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <input
        ref={search}
        type="search"
        className="owb-article-picker__search"
        aria-label="搜索文章"
        placeholder="搜索文章标题或摘要"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="owb-article-picker__list" aria-busy={loading}>
        {!loading && !error && coursewareUnavailable && (
          <output>部分课件暂时无法加载，普通文章仍可使用。</output>
        )}
        <ArticlePickerResults
          articles={articles}
          loading={loading}
          error={error}
          query={query}
          onRetry={() => setAttempt((value) => value + 1)}
          onSelect={(article) => {
            if (selected.current) return;
            selected.current = true;
            try {
              onSelect(article);
            } catch (cause) {
              selected.current = false;
              setError(
                cause instanceof Error
                  ? cause.message
                  : '添加文章失败，请重试。'
              );
            }
          }}
        />
      </div>
    </dialog>
  );
}
