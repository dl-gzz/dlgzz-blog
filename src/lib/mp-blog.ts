import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import { authorSource, blogSource } from '@/lib/source';
import matter from 'gray-matter';

export interface MiniappBlogListItem {
  slug: string;
  locale: string;
  title: string;
  description: string;
  image?: string;
  images?: string[];
  date: string;
  premium: boolean;
  authorName?: string;
  authorAvatar?: string;
  excerpt: string;
}

export interface MiniappBlogDetail extends MiniappBlogListItem {
  locked: boolean;
  contentParagraphs: string[];
  previewParagraphs: string[];
}

function normalizeLocale(locale?: string) {
  return locale === 'en' ? 'en' : 'zh';
}

async function resolveBlogArticlePath(locale: string, slug: string) {
  const normalizedSlug = slug.trim();
  const candidates = [
    path.join(
      process.cwd(),
      'content',
      'blog',
      `${normalizedSlug}.${locale}.mdx`
    ),
    path.join(process.cwd(), 'content', 'blog', `${normalizedSlug}.mdx`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function cleanMdxToText(content: string) {
  return content
    .replace(/^import\s+.*$/gm, '')
    .replace(/^export\s+.*$/gm, '')
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/```[a-zA-Z0-9_-]*\n?/, '')
        .replace(/```/g, '')
        .trim()
    )
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitParagraphs(content: string) {
  return cleanMdxToText(content)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export async function getMiniappBlogPosts(locale?: string) {
  const normalizedLocale = normalizeLocale(locale);
  const posts = blogSource
    .getPages(normalizedLocale)
    .filter((post) => post.data.published)
    .sort(
      (a, b) =>
        new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
    );

  const results = await Promise.all(
    posts.map(async (post) => {
      const slug = post.slugs.join('/');
      const articlePath = await resolveBlogArticlePath(normalizedLocale, slug);
      const raw = articlePath ? await fs.readFile(articlePath, 'utf8') : '';
      const parsed = raw ? matter(raw) : null;
      const paragraphs = parsed ? splitParagraphs(parsed.content) : [];
      const authorSlug =
        typeof post.data.author === 'string' ? post.data.author : '';
      const author = authorSlug
        ? authorSource.getPage([authorSlug], normalizedLocale) ||
          authorSource.getPage([authorSlug])
        : null;

      return {
        slug,
        locale: normalizedLocale,
        title: post.data.title,
        description: post.data.description || '',
        image: post.data.image || undefined,
        images: post.data.images || undefined,
        date: post.data.date,
        premium: Boolean(post.data.premium),
        authorName: author?.data.name,
        authorAvatar: author?.data.avatar,
        excerpt: paragraphs[0] || post.data.description || '',
      } satisfies MiniappBlogListItem;
    })
  );

  return results;
}

export async function getMiniappBlogDetail(
  locale: string | undefined,
  slug: string
) {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedSlug = slug.trim();
  const post = blogSource.getPage([normalizedSlug], normalizedLocale);
  if (!post || !post.data.published) {
    return null;
  }

  const articlePath = await resolveBlogArticlePath(
    normalizedLocale,
    normalizedSlug
  );
  if (!articlePath) {
    return null;
  }

  const raw = await fs.readFile(articlePath, 'utf8');
  const parsed = matter(raw);
  const paragraphs = splitParagraphs(parsed.content);
  const premium = Boolean(post.data.premium);
  const previewParagraphs = paragraphs.slice(0, Math.min(3, paragraphs.length));
  const authorSlug =
    typeof post.data.author === 'string' ? post.data.author : '';
  const author = authorSlug
    ? authorSource.getPage([authorSlug], normalizedLocale) ||
      authorSource.getPage([authorSlug])
    : null;

  return {
    slug: normalizedSlug,
    locale: normalizedLocale,
    title: post.data.title,
    description: post.data.description || '',
    image: post.data.image || undefined,
    images: post.data.images || undefined,
    date: post.data.date,
    premium,
    authorName: author?.data.name,
    authorAvatar: author?.data.avatar,
    excerpt: previewParagraphs[0] || post.data.description || '',
    locked: premium,
    contentParagraphs: premium ? previewParagraphs : paragraphs,
    previewParagraphs,
  } satisfies MiniappBlogDetail;
}
