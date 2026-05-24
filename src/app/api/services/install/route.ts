import { type NextRequest, NextResponse } from 'next/server';
import { getServiceCatalogItem } from '@/lib/service-catalog';
import {
  buildServiceAccessErrorResponse,
  getServiceRequestAccess,
} from '@/lib/service-route-access';
import { getServiceArticleBundle } from '@/lib/service-article';

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const slug = request.nextUrl.searchParams.get('slug') || '';

    if (!slug.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少 slug', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }

    const item = getServiceCatalogItem(locale, slug);
    if (!item) {
      return NextResponse.json(
        { success: false, error: '服务不存在或未发布', code: 'SERVICE_NOT_FOUND' },
        { status: 404 }
      );
    }

    const { access } = await getServiceRequestAccess({
      locale,
      item,
    });
    const accessErrorResponse = buildServiceAccessErrorResponse({
      locale,
      access,
    });
    if (accessErrorResponse) {
      return accessErrorResponse;
    }

    const articleBundle = await getServiceArticleBundle(locale, slug);

    return NextResponse.json({
      success: true,
      article: {
        locale: item.locale,
        slug: item.slug,
        url: item.url,
        title: item.title,
        description: item.description,
        image: item.image,
        date: item.date,
        premium: item.premium,
      },
      article_bundle: articleBundle,
      manifest: item.manifest,
      whiteboard_prompt: item.whiteboardPrompt || null,
      access: {
        premium: item.manifest.pricing.mode === 'premium',
        license: item.manifest.pricing.mode === 'license',
        granted: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: '读取服务安装信息失败', code: 'INSTALL_ROUTE_FAILED' },
      { status: 500 }
    );
  }
}
