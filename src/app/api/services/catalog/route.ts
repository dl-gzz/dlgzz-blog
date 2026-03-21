import { type NextRequest, NextResponse } from 'next/server';
import { getServiceCatalog } from '@/lib/service-catalog';

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const items = getServiceCatalog(locale);

    return NextResponse.json({
      success: true,
      items: items.map((item) => ({
        locale: item.locale,
        slug: item.slug,
        url: item.url,
        title: item.title,
        description: item.description,
        image: item.image,
        date: item.date,
        premium: item.premium,
        categories: item.categories,
        installApiPath: item.installApiPath,
        manifest: item.manifest,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: '读取服务目录失败' },
      { status: 500 }
    );
  }
}
