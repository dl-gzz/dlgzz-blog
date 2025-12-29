import { create, insertMultiple, search } from '@orama/orama';
import { blogSource } from '@/lib/source';

/**
 * 博客搜索结果类型
 */
export interface BlogSearchResult {
  id: string;
  title: string;
  description?: string;
  content: string;
  url: string;
  score: number;
}

/**
 * 创建并初始化博客搜索索引
 */
async function createBlogIndex() {
  // 创建 Orama 数据库实例（不使用中文分词器，使用默认即可）
  const db = await create({
    schema: {
      id: 'string',
      title: 'string',
      description: 'string',
      content: 'string',
      url: 'string',
    },
  });

  // 获取所有博客文章
  const posts = blogSource.getPages().map((page) => {
    // 从 page.data 中提取内容
    // 尝试多种方式获取内容
    let content = '';

    if (page.data.body?.raw) {
      content = page.data.body.raw;
    } else if (page.data.exports?.default) {
      content = typeof page.data.exports.default === 'string'
        ? page.data.exports.default
        : JSON.stringify(page.data.exports.default);
    } else if (page.data.structuredData) {
      content = JSON.stringify(page.data.structuredData);
    }

    const post = {
      id: page.slugs.join('/'),
      title: page.data.title || '',
      description: page.data.description || '',
      content: typeof content === 'string' ? content : '',
      url: page.url,
    };

    // 调试日志：查看每篇文章的信息
    console.log(`Indexing blog post: "${post.title}", content length: ${post.content.length}, url: ${post.url}`);

    return post;
  });

  console.log(`✅ Successfully indexed ${posts.length} blog posts`);

  // 批量插入文章到搜索索引
  if (posts.length > 0) {
    await insertMultiple(db, posts);
  }

  return db;
}

// 全局缓存搜索索引（避免每次请求都重建）
let blogIndexCache: Awaited<ReturnType<typeof create>> | null = null;

/**
 * 获取或创建博客搜索索引
 */
async function getBlogIndex() {
  if (!blogIndexCache) {
    blogIndexCache = await createBlogIndex();
  }
  return blogIndexCache;
}

/**
 * 搜索博客内容
 *
 * @param query - 搜索查询
 * @param limit - 返回结果数量限制，默认 5
 * @returns 搜索结果数组
 */
export async function searchBlogContent(
  query: string,
  limit = 5
): Promise<BlogSearchResult[]> {
  try {
    const db = await getBlogIndex();

    const results = await search(db, {
      term: query,
      limit,
      tolerance: 1, // 允许 1 个字符的拼写错误
      boost: {
        title: 2, // 标题匹配权重更高
        description: 1.5,
        content: 1,
      },
    });

    return results.hits.map((hit) => ({
      id: hit.document.id,
      title: hit.document.title,
      description: hit.document.description,
      content: hit.document.content,
      url: hit.document.url,
      score: hit.score,
    }));
  } catch (error) {
    console.error('Blog search error:', error);
    return [];
  }
}

/**
 * 清除搜索索引缓存（用于内容更新时）
 */
export function clearBlogIndexCache() {
  blogIndexCache = null;
}
