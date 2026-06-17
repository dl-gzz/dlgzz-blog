import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import matter from 'gray-matter';
import { getDb } from '@/db';
import { eduBlogPost, eduCourseware, eduWorkspace } from '@/db/schema';
import {
  type CoursewareMdxPost,
  extractSavedCoursewareHtml,
  getCoursewareMdxPost,
} from '@/lib/courseware-mdx';

const DEFAULT_WORKSPACE_ID = 'edu_workspace_default';
const DEFAULT_WORKSPACE_SLUG = 'default';
const SAVED_HTML_START = '{/* dlgzz-courseware-html:start */}';
const SAVED_HTML_END = '{/* dlgzz-courseware-html:end */}';

export type DatabaseCoursewarePost = CoursewareMdxPost & {
  storage: 'database';
  coursewareId: string | null;
  htmlContent: string;
};

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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

function cleanMdxBody(body: string) {
  return body
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^import\s+.*$/gm, '')
    .replace(/^\s*export\s+.*$/gm, '')
    .trim();
}

function buildCoursewareMdx({
  title,
  description,
  sourceSlug,
  whiteboardPrompt,
  html,
  provider,
  model,
}: {
  title: string;
  description: string;
  sourceSlug?: string;
  whiteboardPrompt: string;
  html: string;
  provider?: string;
  model?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${yamlString(today)}
image: /images/blog/interactive-math-game.png
published: true
author: admin
premium: false
featured: false
whiteboard_category: education
whiteboard_prompt: ${yamlString(whiteboardPrompt)}
generated_courseware: true
${sourceSlug ? `source_mdx_slug: ${yamlString(sourceSlug)}\n` : ''}${provider ? `courseware_provider: ${yamlString(provider)}\n` : ''}${model ? `courseware_model: ${yamlString(model)}\n` : ''}---

# ${title}

${description}

这篇 MDX 保存了一份可复用的白板互动课件。老师在白板课件库中点击它时，会直接加载下面保存的 HTML，不需要重新调用大模型。

${SAVED_HTML_START}

\`\`\`html
${html.trim()}
\`\`\`

${SAVED_HTML_END}
`;
}

function buildPromptBlockMdx({
  title,
  description,
  whiteboardPrompt,
  body,
  provider,
  model,
}: {
  title: string;
  description: string;
  whiteboardPrompt: string;
  body: string;
  provider?: string;
  model?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const cleanBody = body.trim() || `# ${title}\n\n${description}\n\n## 白板生成提示词\n\n${whiteboardPrompt}`;

  return `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${yamlString(today)}
image: /images/blog/interactive-math-game.png
published: true
author: admin
premium: false
featured: false
whiteboard_category: education
whiteboard_prompt: ${yamlString(whiteboardPrompt)}
generated_prompt_block: true
${provider ? `prompt_block_provider: ${yamlString(provider)}\n` : ''}${model ? `prompt_block_model: ${yamlString(model)}\n` : ''}---

${cleanBody}
`;
}

async function ensureDefaultWorkspace() {
  const db = await getDb();
  await db
    .insert(eduWorkspace)
    .values({
      id: DEFAULT_WORKSPACE_ID,
      name: '默认教育工作区',
      slug: DEFAULT_WORKSPACE_SLUG,
      status: 'active',
      metadata: { source: 'system-default' },
    })
    .onConflictDoNothing({ target: eduWorkspace.id });

  return DEFAULT_WORKSPACE_ID;
}

async function databasePostExists(slug: string, locale: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: eduBlogPost.id })
    .from(eduBlogPost)
    .where(
      and(
        eq(eduBlogPost.workspaceId, DEFAULT_WORKSPACE_ID),
        eq(eduBlogPost.slug, slug),
        eq(eduBlogPost.locale, locale)
      )
    )
    .limit(1);
  return rows.length > 0;
}

function filePostExists(slug: string, locale: string) {
  try {
    return Boolean(getCoursewareMdxPost(slug, locale));
  } catch {
    return false;
  }
}

async function ensureUniqueSlug(seed: string, locale: string) {
  const safeSlug = toSafeSlug(seed);

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const candidate = `${safeSlug}${suffix}`;
    const exists = filePostExists(candidate, locale) || (await databasePostExists(candidate, locale));
    if (!exists) return candidate;
  }

  return `${safeSlug}-${Date.now()}`;
}

function dateToIso(value: Date | string | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function rowToCoursewarePost({
  post,
  courseware,
}: {
  post: typeof eduBlogPost.$inferSelect;
  courseware: typeof eduCourseware.$inferSelect | null;
}): DatabaseCoursewarePost {
  const mdx = post.mdxSource || courseware?.mdxSource || '';
  const body = cleanMdxBody(mdx);
  const htmlContent = courseware?.htmlContent || extractSavedCoursewareHtml(body);

  return {
    slug: post.slug,
    locale: post.locale,
    fileName: `${post.slug}.${post.locale}.mdx`,
    title: post.title,
    description: post.description,
    date: dateToIso(post.publishedAt || post.createdAt),
    published: post.status === 'published',
    whiteboardCategory: post.whiteboardCategory,
    whiteboardPrompt: post.whiteboardPrompt,
    hasSavedCourseware: Boolean(htmlContent),
    body,
    mdx,
    storage: 'database',
    coursewareId: courseware?.id || post.coursewareId,
    htmlContent,
  };
}

export async function listDatabaseCoursewarePosts(locale = 'zh') {
  await ensureDefaultWorkspace();
  const db = await getDb();
  const rows = await db
    .select({
      post: eduBlogPost,
      courseware: eduCourseware,
    })
    .from(eduBlogPost)
    .leftJoin(eduCourseware, eq(eduBlogPost.coursewareId, eduCourseware.id))
    .where(
      and(
        eq(eduBlogPost.workspaceId, DEFAULT_WORKSPACE_ID),
        eq(eduBlogPost.locale, locale),
        eq(eduBlogPost.status, 'published')
      )
    )
    .orderBy(desc(eduBlogPost.publishedAt), desc(eduBlogPost.createdAt))
    .limit(200);

  return rows.map(rowToCoursewarePost);
}

export async function getDatabaseCoursewarePost(slug: string, locale = 'zh') {
  const safeSlug = decodeURIComponent(slug).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(safeSlug)) {
    throw new Error('无效的数据库课件 slug');
  }

  await ensureDefaultWorkspace();
  const db = await getDb();
  const rows = await db
    .select({
      post: eduBlogPost,
      courseware: eduCourseware,
    })
    .from(eduBlogPost)
    .leftJoin(eduCourseware, eq(eduBlogPost.coursewareId, eduCourseware.id))
    .where(
      and(
        eq(eduBlogPost.workspaceId, DEFAULT_WORKSPACE_ID),
        eq(eduBlogPost.slug, safeSlug),
        eq(eduBlogPost.locale, locale),
        eq(eduBlogPost.status, 'published')
      )
    )
    .limit(1);

  const row = rows[0];
  return row ? rowToCoursewarePost(row) : null;
}

export async function saveGeneratedCoursewareToDatabase({
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
  const cleanHtml = readText(html);
  if (!cleanHtml) {
    throw new Error('缺少可保存的课件 HTML');
  }

  const workspaceId = await ensureDefaultWorkspace();
  const safeTitle = readText(title, 'AI 互动课件');
  const safeDescription =
    readText(description) || `由老师后台生成的「${safeTitle}」触屏互动课件。`;
  const safeLocale = readText(locale, 'zh');
  const uniqueSlug = await ensureUniqueSlug(slug || sourceSlug || safeTitle, safeLocale);
  const fileName = `${uniqueSlug}.${safeLocale}.mdx`;
  const prompt =
    readText(whiteboardPrompt) ||
    `打开已保存的互动课件《${safeTitle}》，直接在白板上渲染并支持答题上报。`;
  const mdx = buildCoursewareMdx({
    title: safeTitle,
    description: safeDescription,
    sourceSlug,
    whiteboardPrompt: prompt,
    html: cleanHtml,
    provider,
    model,
  });
  const now = new Date();
  const coursewareId = `ecw_${randomUUID()}`;
  const postId = `ebp_${randomUUID()}`;
  const metadata = {
    generatedCourseware: true,
    source: 'teacher-courseware-backend',
  };

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(eduCourseware).values({
      id: coursewareId,
      workspaceId,
      title: safeTitle,
      slug: uniqueSlug,
      locale: safeLocale,
      description: safeDescription,
      sourceSlug: sourceSlug || null,
      whiteboardPrompt: prompt,
      htmlContent: cleanHtml,
      mdxSource: mdx,
      provider: provider || null,
      model: model || null,
      status: 'published',
      visibility: 'private',
      metadata,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(eduBlogPost).values({
      id: postId,
      workspaceId,
      coursewareId,
      postType: 'courseware',
      title: safeTitle,
      slug: uniqueSlug,
      locale: safeLocale,
      description: safeDescription,
      image: '/images/blog/interactive-math-game.png',
      mdxSource: mdx,
      whiteboardCategory: 'education',
      whiteboardPrompt: prompt,
      status: 'published',
      visibility: 'private',
      publishedAt: now,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    slug: uniqueSlug,
    fileName,
    filePath: null,
    storage: 'database' as const,
    coursewareId,
    blogPostId: postId,
    title: safeTitle,
    description: safeDescription,
    url: `/blog/${uniqueSlug}`,
  };
}

export async function savePromptBlockToDatabase({
  title,
  slug,
  description,
  whiteboardPrompt,
  mdx,
  provider,
  model,
  locale = 'zh',
}: {
  title: string;
  slug: string;
  description?: string;
  whiteboardPrompt?: string;
  mdx: string;
  provider?: string;
  model?: string;
  locale?: string;
}) {
  const parsed = matter(readText(mdx));
  const frontmatter = parsed.data || {};
  const body = readText(parsed.content);
  const safeTitle = readText(title, readText(frontmatter.title, 'AI 课件提示词 Block'));
  const safeDescription =
    readText(description, readText(frontmatter.description)) ||
    `由老师后台生成的「${safeTitle}」可复用课件提示词。`;
  const prompt =
    readText(whiteboardPrompt, readText(frontmatter.whiteboard_prompt)) ||
    `请根据《${safeTitle}》生成一个支持触屏互动、步骤演示和答题上报的白板课件。`;
  const safeLocale = readText(locale, 'zh');
  const uniqueSlug = await ensureUniqueSlug(slug || safeTitle, safeLocale);
  const fileName = `${uniqueSlug}.${safeLocale}.mdx`;
  const workspaceId = await ensureDefaultWorkspace();
  const now = new Date();
  const postId = `ebp_${randomUUID()}`;
  const mdxSource = buildPromptBlockMdx({
    title: safeTitle,
    description: safeDescription,
    whiteboardPrompt: prompt,
    body,
    provider,
    model,
  });

  const db = await getDb();
  await db.insert(eduBlogPost).values({
    id: postId,
    workspaceId,
    coursewareId: null,
    postType: 'prompt_block',
    title: safeTitle,
    slug: uniqueSlug,
    locale: safeLocale,
    description: safeDescription,
    image: '/images/blog/interactive-math-game.png',
    mdxSource,
    whiteboardCategory: 'education',
    whiteboardPrompt: prompt,
    status: 'published',
    visibility: 'private',
    publishedAt: now,
    metadata: {
      generatedPromptBlock: true,
      source: 'teacher-courseware-backend',
      provider: provider || null,
      model: model || null,
    },
    createdAt: now,
    updatedAt: now,
  });

  return {
    slug: uniqueSlug,
    fileName,
    filePath: null,
    storage: 'database' as const,
    blogPostId: postId,
    title: safeTitle,
    description: safeDescription,
    whiteboardPrompt: prompt,
    url: `/blog/${uniqueSlug}`,
  };
}
