import 'server-only';

import { hasAccessToPremiumContent } from '@/lib/premium-access';
import { getSession } from '@/lib/server';
import { type ServiceAccessState, getServiceAccessState } from '@/lib/service-access';
import type { ServiceCatalogItem } from '@/lib/service-catalog';
import { NextResponse } from 'next/server';

export async function getServiceRequestAccess({
  locale,
  item,
}: {
  locale: string;
  item: ServiceCatalogItem;
}) {
  const session = await getSession();
  const userId = session?.user?.id || null;
  const hasPremium = userId ? await hasAccessToPremiumContent() : false;
  const access = await getServiceAccessState({
    locale,
    manifest: item.manifest,
    userId,
    hasPremium,
  });

  return {
    access,
    userId,
    hasPremium,
  };
}

export function buildServiceAccessErrorResponse({
  locale,
  access,
}: {
  locale: string;
  access: ServiceAccessState;
}) {
  if (access.granted) {
    return null;
  }

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

  return NextResponse.json(
    {
      success: false,
      error: '组件授权配置缺失，暂时无法安装',
      code: access.code || 'LICENSE_CONFIG_INVALID',
    },
    { status: 500 }
  );
}
