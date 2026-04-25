import { getMiniappBlogPosts } from '@/lib/mp-blog';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const locale = searchParams.get('locale') || 'zh';
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.min(
      20,
      Math.max(1, Number(searchParams.get('pageSize') || '10'))
    );

    const posts = await getMiniappBlogPosts(locale);
    const start = (page - 1) * pageSize;
    const pagedItems = posts.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      data: {
        items: pagedItems,
        pagination: {
          page,
          pageSize,
          total: posts.length,
          hasMore: start + pageSize < posts.length,
        },
      },
    });
  } catch (error) {
    console.error('mp posts api error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load posts' },
      { status: 500 }
    );
  }
}
