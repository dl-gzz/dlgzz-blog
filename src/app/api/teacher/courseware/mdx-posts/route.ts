import { listCoursewareMdxPosts } from '@/lib/courseware-mdx';
import { listDatabaseCoursewarePosts } from '@/lib/edu-content';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const fsPosts = listCoursewareMdxPosts(locale);
    const dbPosts = await listDatabaseCoursewarePosts(locale);
    const bySlug = new Map([...fsPosts, ...dbPosts].map((post) => [post.slug, post]));
    const posts = Array.from(bySlug.values()).sort((a, b) => {
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      return bTime - aTime;
    }).map((post) => ({
      slug: post.slug,
      locale: post.locale,
      fileName: post.fileName,
      title: post.title,
      description: post.description,
      date: post.date,
      whiteboardCategory: post.whiteboardCategory || undefined,
      whiteboardPrompt: post.whiteboardPrompt || undefined,
      hasWhiteboardPrompt: Boolean(post.whiteboardPrompt),
      hasSavedCourseware: post.hasSavedCourseware,
      bodyPreview: post.body.slice(0, 1200),
    }));

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '读取 MDX 课件失败',
      },
      { status: 500 }
    );
  }
}
