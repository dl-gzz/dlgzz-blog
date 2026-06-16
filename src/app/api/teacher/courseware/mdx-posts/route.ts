import { listCoursewareMdxPosts } from '@/lib/courseware-mdx';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const posts = listCoursewareMdxPosts(locale).map((post) => ({
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
