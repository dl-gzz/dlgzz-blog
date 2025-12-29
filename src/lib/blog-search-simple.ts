import { create, insertMultiple, search } from '@orama/orama';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

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
 * 直接从文件系统读取博客文章
 */
function loadBlogPosts() {
  const blogDir = join(process.cwd(), 'content/blog');

  // 检查目录是否存在
  if (!existsSync(blogDir)) {
    console.warn(`⚠️ Blog directory not found: ${blogDir}`);
    return [];
  }

  // 只加载中文博客，过滤掉 .en.mdx 文件
  const files = readdirSync(blogDir).filter(f =>
    f.endsWith('.mdx') && !f.endsWith('.en.mdx')
  );

  const posts = files.map(file => {
    const filePath = join(blogDir, file);
    const fileContent = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    // 移除 frontmatter，只保留正文
    const cleanContent = content
      .replace(/^#{1,6}\s+/gm, '') // 移除标题符号
      .replace(/```[\s\S]*?```/g, '') // 移除代码块
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 移除链接，保留文字
      .replace(/[*_~`#]/g, '') // 移除所有 Markdown 符号
      .replace(/\n+/g, ' ') // 将多个换行替换为单个空格
      .trim();

    // 处理文件名：
    // 保留语言后缀作为唯一 ID，避免冲突
    // 但 URL 不包含语言后缀
    const id = file.replace(/\.mdx?$/, ''); // comparisons.zh.mdx -> comparisons.zh
    const slug = file.replace(/\.(en|zh)\.mdx?$/, '').replace(/\.mdx?$/, ''); // -> comparisons

    return {
      id: id,  // 唯一标识符，保留语言后缀
      title: data.title || file,
      description: data.description || '',
      content: cleanContent,
      url: `/blog/${slug}`,  // URL 不包含语言后缀
    };
  });

  console.log(`📚 Loaded ${posts.length} blog posts from filesystem`);
  posts.forEach(p => {
    console.log(`  - "${p.title}" (${p.content.length} chars)`);
  });

  return posts;
}

/**
 * 创建并初始化博客搜索索引
 */
async function createBlogIndex() {
  const db = await create({
    schema: {
      id: 'string',
      title: 'string',
      description: 'string',
      content: 'string',
      url: 'string',
    },
  });

  const posts = loadBlogPosts();

  if (posts.length > 0) {
    await insertMultiple(db, posts);
    console.log(`✅ Indexed ${posts.length} blog posts`);
  } else {
    console.warn('⚠️ No blog posts found!');
  }

  return db;
}

// 全局缓存
let blogIndexCache: Awaited<ReturnType<typeof create>> | null = null;

async function getBlogIndex() {
  if (!blogIndexCache) {
    blogIndexCache = await createBlogIndex();
  }
  return blogIndexCache;
}

/**
 * 搜索博客内容
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
      tolerance: 1,
      boost: {
        title: 2,
        description: 1.5,
        content: 1,
      },
    });

    console.log(`🔍 Search query: "${query}" found ${results.hits.length} results`);

    // Debug: Log first few results
    if (results.hits.length > 0) {
      console.log('📝 Top results:');
      results.hits.slice(0, 3).forEach((hit: any, idx: number) => {
        console.log(`  ${idx + 1}. "${hit.document.title}" (score: ${hit.score})`);
        console.log(`     Content preview: ${String(hit.document.content).substring(0, 100)}...`);
      });
    } else {
      console.log('⚠️ No results found for query:', query);
    }

    return results.hits.map((hit: any) => ({
      id: String(hit.document.id),
      title: String(hit.document.title),
      description: hit.document.description,
      content: String(hit.document.content),
      url: String(hit.document.url),
      score: hit.score,
    }));
  } catch (error) {
    console.error('Blog search error:', error);
    return [];
  }
}

export function clearBlogIndexCache() {
  blogIndexCache = null;
}
