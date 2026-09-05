import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/** Call only after resolving a published article and its reading permission. */
export async function readBlogMarkdown(locale: string, slug: string) {
  if (
    !['zh', 'en'].includes(locale) ||
    slug.split('/').some((part) => !part || part === '.' || part === '..') ||
    /[\\\0]/.test(slug)
  ) {
    throw new Error('Invalid article path');
  }
  const root = path.join(process.cwd(), 'content', 'blog');
  for (const file of [`${slug}.${locale}.mdx`, `${slug}.mdx`]) {
    try {
      const raw = await fs.readFile(path.join(root, file), 'utf8');
      return matter(raw).content.trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Article source unavailable');
}
