import { type NextRequest, NextResponse } from 'next/server';
import { blogSource } from '@/lib/source';
import { listCoursewareMdxPosts } from '@/lib/courseware-mdx';
import { listDatabaseCoursewarePosts } from '@/lib/edu-content';

function logLoadFailure(source: string, error: unknown) {
  const failure = error as {
    code?: unknown;
    cause?: { code?: unknown };
  } | null;
  const code = failure?.cause?.code ?? failure?.code;
  console.warn(
    `[whiteboard/blog-posts] ${source} unavailable`,
    typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code) ? code : ''
  );
}

async function readOptionalCourseware<T>(
  source: string,
  load: () => T[] | Promise<T[]>
) {
  try {
    return { posts: await load(), unavailable: false };
  } catch (error) {
    logLoadFailure(source, error);
    return { posts: [], unavailable: true };
  }
}

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';

    const localePosts = blogSource.getPages(locale);
    const publishedPosts = localePosts
      .filter((post) => post.data.published)
      .sort(
        (a, b) =>
          new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
      );

    const [fileCourseware, databaseCourseware] = await Promise.all([
      readOptionalCourseware('file courseware', () =>
        listCoursewareMdxPosts(locale)
      ),
      readOptionalCourseware('database courseware', () =>
        listDatabaseCoursewarePosts(locale, { includePrivate: false })
      ),
    ]);
    const fsPostBySlug = new Map(
      fileCourseware.posts.map((post) => [post.slug, post])
    );

    const posts = publishedPosts.map((post) => {
      const whiteboardPrompt =
        typeof (post.data as any).whiteboard_prompt === 'string'
          ? (post.data as any).whiteboard_prompt.trim()
          : '';
      const whiteboardCategory =
        typeof (post.data as any).whiteboard_category === 'string'
          ? (post.data as any).whiteboard_category.trim()
          : '';
      const slug = Array.isArray(post.slugs)
        ? post.slugs.join('/')
        : String(post.slugs || '');
      const fsPost = fsPostBySlug.get(slug);

      return {
        title: post.data.title,
        description: post.data.description || '',
        image: post.data.image || '',
        date: post.data.date,
        url: post.url,
        slugs: post.slugs,
        slug,
        whiteboardPrompt: whiteboardPrompt || undefined,
        hasWhiteboardPrompt: Boolean(whiteboardPrompt),
        whiteboardCategory: whiteboardCategory || undefined,
        hasSavedCourseware: Boolean(fsPost?.hasSavedCourseware),
      };
    });

    const knownSlugs = new Set(posts.map((post) => post.slug));
    for (const post of [...fileCourseware.posts, ...databaseCourseware.posts]) {
      if (knownSlugs.has(post.slug)) continue;
      knownSlugs.add(post.slug);
      posts.push({
        title: post.title,
        description: post.description || '',
        image: '/images/blog/interactive-math-game.png',
        date: post.date,
        url: `/blog/${post.slug}`,
        slugs: [post.slug],
        slug: post.slug,
        whiteboardPrompt: post.whiteboardPrompt || undefined,
        hasWhiteboardPrompt: Boolean(post.whiteboardPrompt),
        whiteboardCategory: post.whiteboardCategory || undefined,
        hasSavedCourseware: post.hasSavedCourseware,
      });
    }

    return NextResponse.json({
      success: true,
      posts,
      coursewareUnavailable:
        fileCourseware.unavailable || databaseCourseware.unavailable,
    });
  } catch (error) {
    logLoadFailure('published articles', error);
    return NextResponse.json(
      { success: false, error: '暂时无法加载文章，请重试。' },
      { status: 500 }
    );
  }
}
