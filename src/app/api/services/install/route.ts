import { type NextRequest, NextResponse } from 'next/server';
import { getServiceAccessState } from '@/lib/service-access';
import { getServiceCatalogItem } from '@/lib/service-catalog';
import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';

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

    const session = await getSession();
    const userId = session?.user?.id || null;
    const premiumGranted = userId ? await hasAccessToPremiumContent() : false;
    const access = await getServiceAccessState({
      locale,
      manifest: item.manifest,
      userId,
      hasPremium: premiumGranted,
    });

    if (!access.granted) {
      if (access.code === 'AUTH_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error:
              access.mode === 'license'
                ? '请先登录后再购买或安装这个授权组件'
                : '请先登录后再安装这个付费组件',
            code: access.code,
            loginPage: access.loginHref || `/${locale}/auth/login`,
            pricingPage: access.purchaseHref || `/${locale}/pricing`,
            purchasePage: access.purchaseHref || `/${locale}/pricing`,
          },
          { status: 401 }
        );
      }

      if (access.code === 'PREMIUM_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error: '此组件需要付费订阅后才能安装',
            code: access.code,
            pricingPage: access.purchaseHref || `/${locale}/pricing`,
          },
          { status: 403 }
        );
      }

      if (access.code === 'LICENSE_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error: '此组件需要单独购买授权后才能安装',
            code: access.code,
            purchasePage: access.purchaseHref || `/${locale}/pricing`,
            pricingPage: access.purchaseHref || `/${locale}/pricing`,
          },
          { status: 403 }
        );
      }

      if (access.code === 'LICENSE_CONFIG_INVALID') {
        return NextResponse.json(
          {
            success: false,
            error: '组件授权配置缺失，暂时无法安装',
            code: access.code,
          },
          { status: 500 }
        );
      }
    }

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
        categories: item.categories,
      },
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
