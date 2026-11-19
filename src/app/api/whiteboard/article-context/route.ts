import { getDb } from '@/db';
import { eduBlogPost, eduCourseware } from '@/db/schema';
import {
  bodyErrorResponse,
  readBoundedJson,
  requireSameOrigin,
} from '@/lib/api-security';
import { readBlogMarkdown } from '@/lib/blog-markdown';
import { userHasPremiumAccess } from '@/lib/premium-access';
import { requireRequestBudget } from '@/lib/request-rate-limit';
import { getSession } from '@/lib/server';
import { blogSource } from '@/lib/source';
import { getBaseUrl } from '@/lib/urls/urls';
import {
  ARTICLE_CONTEXT_LIMITS,
  ArticleContextInputError,
  boundArticleContent,
  parseArticleContextRequest,
  resolveArticleReference,
} from '@/lib/whiteboard-article-context';
import { and, eq, isNull, or } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/** Same published/public-or-admin boundary as the blog detail page, SELECT only. */
async function readDatabaseArticle(
  slug: string,
  locale: string,
  isAdmin: boolean
) {
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      title: eduBlogPost.title,
      content: eduBlogPost.mdxSource,
      coursewareContent: eduCourseware.mdxSource,
    })
    .from(eduBlogPost)
    .leftJoin(eduCourseware, eq(eduBlogPost.coursewareId, eduCourseware.id))
    .where(
      and(
        eq(eduBlogPost.workspaceId, 'edu_workspace_default'),
        eq(eduBlogPost.slug, slug),
        eq(eduBlogPost.locale, locale),
        eq(eduBlogPost.status, 'published'),
        ...(isAdmin
          ? []
          : [
              eq(eduBlogPost.visibility, 'public'),
              or(
                isNull(eduCourseware.id),
                and(
                  eq(eduCourseware.visibility, 'public'),
                  eq(eduCourseware.status, 'published')
                )
              ),
            ])
      )
    )
    .limit(1);
  return row
    ? { title: row.title, content: row.content || row.coursewareContent || '' }
    : null;
}

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;
  const session = await getSession();
  if (!session?.user?.id)
    return json({ success: false, error: '请先登录后读取文章正文' }, 401);
  const limited = requireRequestBudget(
    'whiteboard-article-context',
    session.user.id,
    20
  );
  if (limited) return limited;

  try {
    const { items, locale } = parseArticleContextRequest(
      await readBoundedJson(request, ARTICLE_CONTEXT_LIMITS.requestBytes)
    );
    const base = new URL(getBaseUrl());
    const allowedOrigins = [base.origin];
    if (base.hostname === 'www.dlgzz.com' || base.hostname === 'dlgzz.com') {
      allowedOrigins.push('https://www.dlgzz.com', 'https://dlgzz.com');
    }
    let premiumAccess: Promise<boolean> | undefined;
    const articles: Array<{
      id: string;
      title: string;
      content: string;
      truncated: boolean;
    }> = [];
    const warnings: Array<{ id: string; message: string }> = [];
    for (const item of items) {
      try {
        const reference = resolveArticleReference(
          item.url,
          locale,
          allowedOrigins
        );
        const post = blogSource.getPage(
          reference.slug.split('/'),
          reference.locale
        );
        let title: string;
        let body: string;
        if (post) {
          if (!post.data.published) {
            warnings.push({ id: item.id, message: '文章不存在或尚未发布' });
            continue;
          }
          if (post.data.premium) {
            premiumAccess ??= userHasPremiumAccess(session.user.id);
            if (!(await premiumAccess)) {
              warnings.push({
                id: item.id,
                message: '这篇文章需要有效会员权限，未读取正文',
              });
              continue;
            }
          }
          title = post.data.title;
          body = await readBlogMarkdown(reference.locale, reference.slug);
        } else {
          const dbPost = await readDatabaseArticle(
            reference.slug,
            reference.locale,
            session.user.role === 'admin'
          );
          if (!dbPost) {
            warnings.push({
              id: item.id,
              message: '文章不存在、尚未发布或没有访问权限',
            });
            continue;
          }
          title = dbPost.title;
          body = dbPost.content;
        }
        const bounded = boundArticleContent(body);
        if (!bounded.content) {
          warnings.push({
            id: item.id,
            message: '这篇文章暂时没有可读取的正文',
          });
          continue;
        }
        articles.push({ id: item.id, title: title.slice(0, 300), ...bounded });
        if (bounded.truncated)
          warnings.push({
            id: item.id,
            message: '文章较长，本次只读取前 12000 个字符',
          });
      } catch (error) {
        warnings.push({
          id: item.id,
          message:
            error instanceof ArticleContextInputError
              ? error.message
              : '文章正文暂时无法读取，请稍后重试',
        });
      }
    }
    return json({ success: true, articles, warnings });
  } catch (error) {
    const bodyError = bodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof ArticleContextInputError)
      return json({ success: false, error: error.message }, 400);
    return json({ success: false, error: '读取文章正文失败，请稍后重试' }, 500);
  }
}
