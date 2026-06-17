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
  format: 'article' | 'gallery';
}

export type MiniappArticleBlock =
  | {
      type: 'heading';
      level: number;
      text: string;
    }
  | {
      type: 'paragraph' | 'quote' | 'code';
      text: string;
      language?: string;
    }
  | {
      type: 'list';
      ordered: boolean;
      items: string[];
    }
  | {
      type: 'image';
      url: string;
      alt: string;
    }
  | {
      type: 'divider';
    };

export interface MiniappBlogDetail extends MiniappBlogListItem {
  locked: boolean;
  contentParagraphs: string[];
  previewParagraphs: string[];
  contentBlocks: MiniappArticleBlock[];
  previewBlocks: MiniappArticleBlock[];
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

function cleanInlineMdx(content: string) {
  return content
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function shouldSkipMdxLine(line: string) {
  const trimmed = line.trim();
  return (
    /^import\s+/.test(trimmed) ||
    /^export\s+/.test(trimmed) ||
    /^<[A-Z][^>]*\/?>$/.test(trimmed) ||
    /^<\/[A-Z][^>]*>$/.test(trimmed)
  );
}

function parseMdxToArticleBlocks(content: string): MiniappArticleBlock[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: MiniappArticleBlock[] = [];
  let index = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const text = cleanInlineMdx(paragraphLines.join(' '));
    if (text) {
      blocks.push({ type: 'paragraph', text });
    }
  };

  while (index < lines.length) {
    const line = lines[index] || '';
    const trimmed = line.trim();

    if (!trimmed || shouldSkipMdxLine(line)) {
      index += 1;
      continue;
    }

    const codeMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)/);
    if (codeMatch) {
      const language = codeMatch[1] || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const text = codeLines.join('\n').trim();
      if (text) {
        blocks.push({ type: 'code', text, language });
      }
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        alt: cleanInlineMdx(imageMatch[1] || ''),
        url: imageMatch[2],
      });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: Math.min(headingMatch[1].length, 3),
        text: cleanInlineMdx(headingMatch[2]),
      });
      index += 1;
      continue;
    }

    const listMatch = trimmed.match(/^((?:[-*+])|(?:\d+\.))\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = lines[index]
          .trim()
          .match(/^((?:[-*+])|(?:\d+\.))\s+(.+)$/);
        if (!itemMatch || /^\d+\./.test(itemMatch[1]) !== ordered) break;
        const item = cleanInlineMdx(itemMatch[2]);
        if (item) items.push(item);
        index += 1;
      }
      if (items.length) {
        blocks.push({ type: 'list', ordered, items });
      }
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      const text = cleanInlineMdx(quoteLines.join(' '));
      if (text) {
        blocks.push({ type: 'quote', text });
      }
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] || '';
      const currentTrimmed = current.trim();
      if (
        !currentTrimmed ||
        shouldSkipMdxLine(current) ||
        /^```/.test(currentTrimmed) ||
        /^---+$/.test(currentTrimmed) ||
        /^!\[([^\]]*)\]\(([^)]+)\)$/.test(currentTrimmed) ||
        /^(#{1,4})\s+/.test(currentTrimmed) ||
        /^((?:[-*+])|(?:\d+\.))\s+/.test(currentTrimmed) ||
        /^>\s?/.test(currentTrimmed)
      ) {
        break;
      }
      paragraphLines.push(currentTrimmed);
      index += 1;
    }
    pushParagraph(paragraphLines);
  }

  return blocks;
}

function getPreviewBlocks(blocks: MiniappArticleBlock[]) {
  const previewBlocks: MiniappArticleBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'image' || block.type === 'divider') {
      continue;
    }
    previewBlocks.push(block);
    if (previewBlocks.length >= 4) {
      break;
    }
  }

  return previewBlocks;
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
        format: (post.data.images?.length || 0) > 1 ? 'gallery' : 'article',
      } satisfies MiniappBlogListItem;
    })
  );

  return results;
}

export async function getMiniappBlogDetail(
  locale: string | undefined,
  slug: string,
  options: { hasMembership?: boolean } = {}
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
  const blocks = parseMdxToArticleBlocks(parsed.content);
  const premium = Boolean(post.data.premium);
  const locked = premium && !options.hasMembership;
  const previewParagraphs = paragraphs.slice(0, Math.min(3, paragraphs.length));
  const previewBlocks = getPreviewBlocks(blocks);
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
    format: (post.data.images?.length || 0) > 1 ? 'gallery' : 'article',
    locked,
    contentParagraphs: locked ? previewParagraphs : paragraphs,
    previewParagraphs,
    contentBlocks: locked ? previewBlocks : blocks,
    previewBlocks,
  } satisfies MiniappBlogDetail;
}
