import { getMiniappBlogDetail } from '@/lib/mp-blog';
import { type NextRequest, NextResponse } from 'next/server';

interface RouteProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  try {
    const { slug } = await params;
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const detail = await getMiniappBlogDetail(locale, decodeURIComponent(slug));

    if (!detail) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    console.error('mp post detail api error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load post detail' },
      { status: 500 }
    );
  }
}
