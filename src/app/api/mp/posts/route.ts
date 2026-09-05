import { getMiniappBlogPosts } from '@/lib/mp-blog';
import { type NextRequest, NextResponse } from 'next/server';

function positiveInteger(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const locale = searchParams.get('locale') || 'zh';
    const page = positiveInteger(searchParams.get('page'), 1);
    const pageSize = Math.min(
      20,
      positiveInteger(searchParams.get('pageSize'), 10)
    );

    const posts = await getMiniappBlogPosts(locale);
    const start = (page - 1) * pageSize;
    const pagedItems = posts.slice(start, start + pageSize);

    return NextResponse.json(
      {
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
      },
      {
        // Only public catalog metadata; never reuse this for identity/detail APIs.
        headers: {
          'Cache-Control':
            'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('mp posts api error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load posts' },
      { status: 500 }
    );
  }
}
