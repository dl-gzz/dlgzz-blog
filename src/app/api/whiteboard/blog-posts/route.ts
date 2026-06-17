import { type NextRequest, NextResponse } from 'next/server';
import { blogSource } from '@/lib/source';
import { listCoursewareMdxPosts } from '@/lib/courseware-mdx';
import { listDatabaseCoursewarePosts } from '@/lib/edu-content';

export async function GET(request: NextRequest) {
  try {
    const locale =
      request.nextUrl.searchParams.get('locale') || 'zh';

    const localePosts = blogSource.getPages(locale);
    const publishedPosts = localePosts
      .filter((post) => post.data.published)
      .sort(
        (a, b) =>
          new Date(b.data.date).getTime() -
          new Date(a.data.date).getTime()
      );

    const fsPosts = listCoursewareMdxPosts(locale);
    const dbPosts = await listDatabaseCoursewarePosts(locale);
    const fsPostBySlug = new Map(fsPosts.map((post) => [post.slug, post]));

    const posts = publishedPosts.map((post) => {
      const whiteboardPrompt =
        typeof (post.data as any).whiteboard_prompt === 'string'
          ? (post.data as any).whiteboard_prompt.trim()
          : '';
      const whiteboardCategory =
        typeof (post.data as any).whiteboard_category === 'string'
          ? (post.data as any).whiteboard_category.trim()
          : '';
      const slug = Array.isArray(post.slugs) ? post.slugs.join('/') : String(post.slugs || '');
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
    for (const post of [...fsPosts, ...dbPosts]) {
      if (knownSlugs.has(post.slug)) continue;
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

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch blog posts' },
      { status: 500 }
    );
  }
}
