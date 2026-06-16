import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;
const SAVED_HTML_START = '{/* dlgzz-courseware-html:start */}';
const SAVED_HTML_END = '{/* dlgzz-courseware-html:end */}';

export type CoursewareMdxPost = {
  slug: string;
  locale: string;
  fileName: string;
  title: string;
  description: string;
  date: string;
  published: boolean;
  whiteboardCategory: string;
  whiteboardPrompt: string;
  hasSavedCourseware: boolean;
  body: string;
  mdx: string;
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return fallback;
}

function readDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return readString(value);
}

function slugFromFileName(fileName: string) {
  return fileName
    .replace(/\.(en|zh)\.mdx$/i, '')
    .replace(/\.mdx$/i, '');
}

function localeFromFileName(fileName: string) {
  const match = fileName.match(/\.([a-z]{2})\.mdx$/i);
  return match?.[1] || 'default';
}

function cleanMdxBody(body: string) {
  return body
    .replace(/^import\s+.*$/gm, '')
    .replace(/^\s*export\s+.*$/gm, '')
    .trim();
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

function toSafeSlug(value: string, fallback = 'courseware') {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\.zh\.mdx$|\.mdx$/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return normalized || `${fallback}-${Date.now()}`;
}

function ensureUniqueFileName(slug: string, locale = 'zh') {
  const safeSlug = toSafeSlug(slug);
  let index = 0;

  while (index < 1000) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const nextSlug = `${safeSlug}${suffix}`;
    const fileName = `${nextSlug}.${locale}.mdx`;
    if (!fs.existsSync(path.join(BLOG_DIR, fileName))) {
      return { slug: nextSlug, fileName };
    }
    index += 1;
  }

  const fallbackSlug = `${safeSlug}-${Date.now()}`;
  return { slug: fallbackSlug, fileName: `${fallbackSlug}.${locale}.mdx` };
}

export function extractSavedCoursewareHtml(body: string) {
  const markerStart = body.indexOf(SAVED_HTML_START);
  const markerEnd = body.indexOf(SAVED_HTML_END);
  const marked =
    markerStart >= 0 && markerEnd > markerStart
      ? body.slice(markerStart + SAVED_HTML_START.length, markerEnd)
      : body;
  const fenced = marked.match(/`{3,}html\s*([\s\S]*?)`{3,}/i);
  const html = (fenced?.[1] || '').trim();

  if (
    /<!doctype\s+html|<html[\s>]|<body[\s>]/i.test(html) &&
    /<\/html>|<\/body>|<script[\s>]|<style[\s>]/i.test(html)
  ) {
    return html;
  }

  return '';
}

function parsePost(fileName: string): CoursewareMdxPost | null {
  const filePath = path.join(BLOG_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = matter(raw);
  const data = parsed.data || {};
  const body = cleanMdxBody(parsed.content);
  const slug = slugFromFileName(fileName);

  return {
    slug,
    locale: localeFromFileName(fileName),
    fileName,
    title: readString(data.title, slug),
    description: readString(data.description),
    date: readDate(data.date),
    published: readBoolean(data.published, true),
    whiteboardCategory: readString(data.whiteboard_category),
    whiteboardPrompt: readString(data.whiteboard_prompt),
    hasSavedCourseware: Boolean(extractSavedCoursewareHtml(body)),
    body,
    mdx: raw,
  };
}

function chooseLocaleFile(files: string[], slug: string, locale: string) {
  const preferred = `${slug}.${locale}.mdx`;
  if (files.includes(preferred)) return preferred;

  const neutral = `${slug}.mdx`;
  if (files.includes(neutral)) return neutral;

  return files.find((file) => slugFromFileName(file) === slug) || null;
}

export function listCoursewareMdxPosts(locale = 'zh') {
  if (!fs.existsSync(BLOG_DIR)) return [];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .filter((file) => (locale === 'zh' ? !file.endsWith('.en.mdx') : true));

  const bySlug = new Map<string, string>();
  for (const file of files) {
    const slug = slugFromFileName(file);
    const current = bySlug.get(slug);
    if (!current) {
      bySlug.set(slug, file);
      continue;
    }
    if (file === `${slug}.${locale}.mdx`) {
      bySlug.set(slug, file);
    }
  }

  return Array.from(bySlug.values())
    .map((file) => parsePost(file))
    .filter((post): post is CoursewareMdxPost => Boolean(post && post.published))
    .sort((a, b) => {
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      return bTime - aTime;
    });
}

export function getCoursewareMdxPost(slug: string, locale = 'zh') {
  const safeSlug = decodeURIComponent(slug).trim();
  if (!SAFE_SLUG_RE.test(safeSlug)) {
    throw new Error('无效的 MDX slug');
  }

  if (!fs.existsSync(BLOG_DIR)) return null;

  const files = fs.readdirSync(BLOG_DIR).filter((file) => file.endsWith('.mdx'));
  const fileName = chooseLocaleFile(files, safeSlug, locale);
  return fileName ? parsePost(fileName) : null;
}

export function saveGeneratedCoursewareMdx({
  title,
  slug,
  description,
  sourceSlug,
  whiteboardPrompt,
  html,
  provider,
  model,
  locale = 'zh',
}: {
  title: string;
  slug: string;
  description: string;
  sourceSlug?: string;
  whiteboardPrompt?: string;
  html: string;
  provider?: string;
  model?: string;
  locale?: string;
}) {
  if (!html.trim()) {
    throw new Error('缺少可保存的课件 HTML');
  }
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const safeTitle = title.trim() || 'AI 互动课件';
  const safeDescription =
    description.trim() || `由老师后台生成的「${safeTitle}」触屏互动课件。`;
  const unique = ensureUniqueFileName(slug || sourceSlug || safeTitle, locale);
  const today = new Date().toISOString().slice(0, 10);
  const prompt =
    whiteboardPrompt?.trim() ||
    `打开已保存的互动课件《${safeTitle}》，直接在白板上渲染并支持答题上报。`;
  const mdx = `---
title: ${yamlString(safeTitle)}
description: ${yamlString(safeDescription)}
date: ${yamlString(today)}
image: /images/blog/interactive-math-game.png
published: true
author: admin
premium: false
featured: false
whiteboard_category: education
whiteboard_prompt: ${yamlString(prompt)}
generated_courseware: true
${sourceSlug ? `source_mdx_slug: ${yamlString(sourceSlug)}\n` : ''}${provider ? `courseware_provider: ${yamlString(provider)}\n` : ''}${model ? `courseware_model: ${yamlString(model)}\n` : ''}---

# ${safeTitle}

${safeDescription}

这篇 MDX 保存了一份可复用的白板互动课件。老师在白板课件库中点击它时，会直接加载下面保存的 HTML，不需要重新调用大模型。

${SAVED_HTML_START}

\`\`\`html
${html.trim()}
\`\`\`

${SAVED_HTML_END}
`;

  const filePath = path.join(BLOG_DIR, unique.fileName);
  fs.writeFileSync(filePath, mdx, 'utf-8');

  return {
    slug: unique.slug,
    fileName: unique.fileName,
    filePath,
    title: safeTitle,
    description: safeDescription,
    url: `/blog/${unique.slug}`,
  };
}
