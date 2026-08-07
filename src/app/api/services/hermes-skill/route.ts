import { buildHermesSkillMd } from '@/lib/hermes-skill-md';
import { getServiceArticleBundle } from '@/lib/service-article';
import { getServiceCatalogItem } from '@/lib/service-catalog';
import { getBaseUrl } from '@/lib/urls/urls';
import {
  buildServiceAccessErrorResponse,
  getServiceRequestAccess,
} from '@/lib/service-route-access';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * 文章即服务 → Hermes 安装端点。
 *
 * GET /api/services/hermes-skill?slug=<article-slug>&locale=zh
 *   默认返回 JSON：{ skill: { name, files: { "SKILL.md": ... } }, install }
 *   &format=md 时直接返回 SKILL.md 纯文本（curl 一步落盘）。
 *
 * 访问控制复用组件商店三态（free / premium / license），与 shape 安装同一套。
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') || 'zh';
    const slug = request.nextUrl.searchParams.get('slug') || '';
    const format = request.nextUrl.searchParams.get('format') || 'json';

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

    const { access } = await getServiceRequestAccess({ locale, item });
    const accessErrorResponse = buildServiceAccessErrorResponse({ locale, access });
    if (accessErrorResponse) return accessErrorResponse;

    const bundle = await getServiceArticleBundle(locale, slug);
    if (!bundle?.agentSpec) {
      return NextResponse.json(
        {
          success: false,
          error: '这篇服务文章还没有 agent_spec，无法生成 Hermes Skill',
          code: 'AGENT_SPEC_MISSING',
        },
        { status: 422 }
      );
    }

    const origin = getBaseUrl();
    const articleUrl = `${origin}/${locale}/blog/${slug}`;
    const skillMd = buildHermesSkillMd({
      manifest: item.manifest,
      agentSpec: bundle.agentSpec,
      articleUrl,
      siteOrigin: origin,
    });
    const skillName = `dlgzz-${item.manifest.id}`;

    if (format === 'md') {
      return new NextResponse(skillMd, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="SKILL.md"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      skill: {
        schema_version: '1',
        package_kind: 'hermes_skill',
        name: skillName,
        service_id: item.manifest.id,
        version: item.manifest.version,
        pricing_mode: item.manifest.pricing.mode,
        files: {
          'SKILL.md': skillMd,
        },
      },
      install: {
        dir: `~/.hermes/skills/${skillName}/`,
        steps: [
          `mkdir -p ~/.hermes/skills/${skillName}`,
          `curl -fsSL "${origin}/api/services/hermes-skill?slug=${encodeURIComponent(slug)}&locale=${locale}&format=md" -o ~/.hermes/skills/${skillName}/SKILL.md`,
        ],
        hint: '安装后在 Hermes 里直接对话即可触发；付费服务需先在网站完成购买。',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: '生成 Hermes Skill 失败', code: 'SKILL_ROUTE_FAILED' },
      { status: 500 }
    );
  }
}
