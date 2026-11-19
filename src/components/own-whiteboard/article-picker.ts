import { readApiResponse, safeWebUrl, stringValue } from './cards/helpers';

export type ArticleOption = {
  title: string;
  description: string;
  image: string;
  date: string;
  url: string;
  category: string;
};

export function parseArticleOptions(
  data: Record<string, unknown>
): ArticleOption[] {
  if (!Array.isArray(data.posts))
    throw new Error('文章列表格式不正确，请重试。');
  const seen = new Set<string>();
  return data.posts.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const post = item as Record<string, unknown>;
    const url = safeWebUrl(post.url);
    const title = stringValue(post.title).trim();
    if (!url || !title || seen.has(url)) return [];
    seen.add(url);
    return [
      {
        title,
        description: stringValue(post.description),
        image: safeWebUrl(post.image),
        date: stringValue(post.date),
        url,
        category: stringValue(post.whiteboardCategory),
      },
    ];
  });
}

export function filterArticleOptions(posts: ArticleOption[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  return search
    ? posts.filter((post) =>
        `${post.title} ${post.description} ${post.category}`
          .toLocaleLowerCase()
          .includes(search)
      )
    : posts;
}

export async function loadArticleOptions(signal: AbortSignal, request = fetch) {
  const response = await request('/api/whiteboard/blog-posts?locale=zh', {
    signal,
  });
  const data = await readApiResponse(response);
  return {
    articles: parseArticleOptions(data),
    coursewareUnavailable: data.coursewareUnavailable === true,
  };
}
