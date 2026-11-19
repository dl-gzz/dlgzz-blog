/** Bounded, pure helpers. URLs identify local articles; they are never fetched. */
export const ARTICLE_CONTEXT_LIMITS = {
  items: 3,
  contentCharacters: 12_000,
  requestBytes: 12_000,
} as const;

export type ArticleLocale = 'zh' | 'en';
export type ArticleContextItem = { id: string; url: string };
export type ArticleContextRequest = {
  items: ArticleContextItem[];
  locale: ArticleLocale;
};

export class ArticleContextInputError extends Error {}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export function parseArticleContextRequest(
  value: unknown
): ArticleContextRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArticleContextInputError('文章请求格式无效');
  }
  const { items, locale = 'zh' } = value as Record<string, unknown>;
  if (locale !== 'zh' && locale !== 'en') {
    throw new ArticleContextInputError('不支持的文章语言');
  }
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > ARTICLE_CONTEXT_LIMITS.items
  ) {
    throw new ArticleContextInputError('每次请选择 1 至 3 篇文章');
  }
  const ids = new Set<string>();
  const parsed = items.map((item): ArticleContextItem => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ArticleContextInputError('文章条目格式无效');
    }
    const { id, url } = item as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(id) ||
      ids.has(id)
    ) {
      throw new ArticleContextInputError('文章卡片标识无效或重复');
    }
    if (typeof url !== 'string' || !url || url.length > 2048) {
      throw new ArticleContextInputError('文章链接无效或过长');
    }
    ids.add(id);
    return { id, url };
  });
  return { items: parsed, locale };
}

export function resolveArticleReference(
  input: string,
  fallbackLocale: ArticleLocale,
  allowedOrigins: string[]
): { slug: string; locale: ArticleLocale } {
  const fail = () => new ArticleContextInputError('只支持本站已发布文章的链接');
  if (
    /[\s\\]/.test(input) ||
    hasControlCharacters(input) ||
    input.startsWith('//')
  )
    throw fail();
  const relative = input.startsWith('/');
  if (!relative && !/^https?:\/\//i.test(input)) throw fail();
  // Reject traversal before URL normalization can silently collapse dot segments.
  const rawPath = relative
    ? input.split(/[?#]/)[0]
    : input.replace(/^https?:\/\/[^/]*(?=\/|$)/i, '').split(/[?#]/)[0];
  if (/%2f|%5c/i.test(rawPath)) throw fail();
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw fail();
  }
  if (/[\\%]/.test(decodedPath) || hasControlCharacters(decodedPath))
    throw fail();
  if (decodedPath.split('/').some((part) => part === '.' || part === '..'))
    throw fail();

  let url: URL;
  try {
    url = new URL(input, allowedOrigins[0]);
  } catch {
    throw fail();
  }
  if (url.username || url.password || !allowedOrigins.includes(url.origin))
    throw fail();
  const segments = decodedPath.replace(/\/$/, '').split('/').slice(1);
  let locale = fallbackLocale;
  if (segments[0] === 'zh' || segments[0] === 'en') {
    locale = segments.shift() as ArticleLocale;
  }
  if (segments.shift() !== 'blog' || segments.length < 1 || segments.length > 8)
    throw fail();
  if (segments.some((part) => !/^[\p{L}\p{N}_-]{1,160}$/u.test(part)))
    throw fail();
  const slug = segments.join('/');
  if (slug.length > 512) throw fail();
  return { slug, locale };
}

export function boundArticleContent(content: string) {
  const cleaned = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/^\s*(?:import|export)\s+.*$/gm, '')
    .replace(
      /\{\/\*\s*dlgzz-courseware-html:start\s*\*\/\}[\s\S]*?\{\/\*\s*dlgzz-courseware-html:end\s*\*\/\}/g,
      ''
    )
    .trim();
  return {
    content: cleaned.slice(0, ARTICLE_CONTEXT_LIMITS.contentCharacters),
    truncated: cleaned.length > ARTICLE_CONTEXT_LIMITS.contentCharacters,
  };
}
