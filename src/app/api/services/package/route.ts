import { getServiceCatalogItem } from '@/lib/service-catalog';
import {
  buildServiceAccessErrorResponse,
  getServiceRequestAccess,
} from '@/lib/service-route-access';
import { buildShapePackage } from '@/lib/shape-package';
import { type NextRequest, NextResponse } from 'next/server';

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
        {
          success: false,
          error: '服务不存在或未发布',
          code: 'SERVICE_NOT_FOUND',
        },
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

    const shapePackage = await buildShapePackage(
      locale,
      slug,
      request.nextUrl.origin
    );
    if (!shapePackage) {
      return NextResponse.json(
        {
          success: false,
          error: '构建 shape package 失败',
          code: 'PACKAGE_BUILD_FAILED',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      shape_package: shapePackage,
      component_package: shapePackage,
      skill_package: shapePackage.skill_spec
        ? {
            schema_version: '1',
            package_kind: 'skill',
            service_id: shapePackage.service_id,
            slug: shapePackage.slug,
            locale: shapePackage.locale,
            packaged_at: shapePackage.packaged_at,
            skill_spec: shapePackage.skill_spec,
            shape_hint: shapePackage.shape_hint,
            manifest: shapePackage.manifest,
            runtime: {
              mode: 'skill_shape',
              shape_type: 'skill_shape',
              entry_props: {
                serviceId: shapePackage.service_id,
                title: shapePackage.skill_spec.title,
                description: shapePackage.skill_spec.summary,
                icon: shapePackage.shape_hint?.icon,
                articleSlug: shapePackage.slug,
                articleLocale: shapePackage.locale,
              },
            },
            article_bundle: shapePackage.article_bundle,
            agent_spec: shapePackage.agent_spec,
            source: shapePackage.source,
          }
        : null,
      access: {
        premium: item.manifest.pricing.mode === 'premium',
        license: item.manifest.pricing.mode === 'license',
        granted: true,
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: '读取 shape package 失败',
        code: 'PACKAGE_ROUTE_FAILED',
      },
      { status: 500 }
    );
  }
}
