import {
  completeApiKeyUsage,
  keyHasPackAccess,
  recordUsage,
  reserveApiKeyUsage,
  verifyApiKey,
} from '@/lib/api-key';
import {
  type KnowledgeAssetResult,
  searchKnowledgeChunks,
} from '@/lib/knowledge-search';
import { getBaseUrl } from '@/lib/urls/urls';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DENY_MESSAGE: Record<string, { status: number; error: string }> = {
  missing: {
    status: 401,
    error: '缺少 API Key（Authorization: Bearer dk_live_…）',
  },
  invalid: { status: 401, error: 'API Key 无效' },
  revoked: { status: 403, error: 'API Key 已被吊销' },
  entitlement_expired: {
    status: 403,
    error: 'OneWorkerOS 权益已过期，请续费后重试',
  },
  device_mismatch: {
    status: 403,
    error: '这把 Key 不属于当前电脑，请在 OneWorkerOS 网站重新生成安装授权',
  },
  quota_exceeded: { status: 429, error: '本月调用额度已用完' },
};

function serializeKnowledgeAsset(
  asset: KnowledgeAssetResult,
  assetProxyBaseUrl: string | null
) {
  const publicUrl = assetProxyBaseUrl
    ? `${assetProxyBaseUrl}/${encodeURIComponent(asset.id)}`
    : asset.publicUrl;

  return {
    id: asset.id,
    type: asset.assetType,
    url: publicUrl,
    ...(publicUrl !== asset.publicUrl ? { originalUrl: asset.publicUrl } : {}),
    mimeType: asset.mimeType,
    ...(asset.title ? { title: asset.title } : {}),
    ...(asset.platform ? { platform: asset.platform } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    ...(asset.embedUrl ? { embedUrl: asset.embedUrl } : {}),
    width: asset.width,
    height: asset.height,
    ...(asset.durationSeconds !== null
      ? { durationSeconds: asset.durationSeconds }
      : {}),
    ...(asset.publishedAt
      ? { publishedAt: asset.publishedAt.toISOString() }
      : {}),
    ...(asset.official ? { official: true } : {}),
    ...(asset.publisher ? { publisher: asset.publisher } : {}),
    ...(asset.sourceType ? { sourceType: asset.sourceType } : {}),
    alt: asset.altText || asset.caption,
    caption: asset.caption,
    role: asset.role,
  };
}

function serializeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === 'host.docker.internal'
    );
  } catch {
    return true;
  }
}

function getAssetProxyBaseUrl() {
  const configuredOrigin =
    process.env.KNOWLEDGE_PUBLIC_ORIGIN ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    getBaseUrl();
  if (configuredOrigin && !isInternalOrigin(configuredOrigin)) {
    return new URL('/api/knowledge/assets', configuredOrigin)
      .toString()
      .replace(/\/$/, '');
  }

  // Zeabur/容器内请求可能只有 0.0.0.0:8080；对外 Skill 必须拿到可渲染的公开域名。
  return 'https://www.dlgzz.com/api/knowledge/assets';
}

/**
 * 知识包检索 API —— 卖数据库模式的收银机。
 *
 * POST /api/knowledge/query
 *   Authorization: Bearer dk_live_...
 *   { "query": "直播间怎么冷启动", "packId": "xhs-operations-v1", "limit": 6, "includeAssets": true, "includeResources": true }
 *
 * 客户的 Hermes（装了对应 Skill）带 Key 调这里 → 校验 Key → 校验是否买了这个包
 * → 检索 → 按次计量。数据库永远不离开服务器，Key 门控 + 计量到位。
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 100_000) {
    return NextResponse.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      { status: 413 }
    );
  }

  let verified: Awaited<ReturnType<typeof verifyApiKey>>;
  try {
    verified = await verifyApiKey(
      request.headers.get('authorization'),
      request.headers.get('x-onework-device-id')
    );
  } catch (error) {
    console.error('[knowledge/query] authorization unavailable', error);
    return NextResponse.json(
      {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        error: '授权服务暂时不可用，请稍后重试',
      },
      { status: 503 }
    );
  }
  if (!verified.ok) {
    const deny = DENY_MESSAGE[verified.reason];
    // 未知 Key 无法归属，只在能定位到 Key 时才计 denied
    return NextResponse.json(
      {
        success: false,
        code: verified.reason.toUpperCase(),
        error: deny.error,
      },
      { status: deny.status }
    );
  }

  let body: {
    query?: unknown;
    packId?: unknown;
    limit?: unknown;
    includeAssets?: unknown;
    includeResources?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '请求体必须是 JSON' },
      { status: 400 }
    );
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
  const limit =
    typeof body.limit === 'number' && body.limit > 0
      ? Math.min(Math.floor(body.limit), 20)
      : 6;
  const includeAssets = body.includeAssets !== false;
  const includeResources =
    typeof body.includeResources === 'boolean'
      ? body.includeResources
      : includeAssets;

  if (
    !query ||
    query.length > 5_000 ||
    !packId ||
    packId.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packId)
  ) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: 'query 或 packId 无效' },
      { status: 400 }
    );
  }

  let hasAccess: boolean;
  try {
    hasAccess = await keyHasPackAccess(verified.key.id, packId);
  } catch (error) {
    console.error('[knowledge/query] entitlement lookup unavailable', error);
    return NextResponse.json(
      {
        success: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        error: '权益校验暂时不可用，请稍后重试',
      },
      { status: 503 }
    );
  }
  if (!hasAccess) {
    await recordUsage({
      apiKeyId: verified.key.id,
      userId: verified.key.userId,
      kind: 'knowledge_query',
      knowledgePackId: packId,
      query,
      status: 'denied',
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        success: false,
        code: 'PACK_NOT_LICENSED',
        error: '这个 Key 没有购买该知识包的访问权限',
      },
      { status: 403 }
    );
  }

  let reservation: Awaited<ReturnType<typeof reserveApiKeyUsage>>;
  try {
    reservation = await reserveApiKeyUsage({
      apiKeyId: verified.key.id,
      userId: verified.key.userId,
      monthlyQuota: verified.key.monthlyQuota,
      kind: 'knowledge_query',
      knowledgePackId: packId,
      query,
    });
  } catch (error) {
    console.error('[knowledge/query] metering unavailable', error);
    return NextResponse.json(
      {
        success: false,
        code: 'METERING_UNAVAILABLE',
        error: '用量校验暂时不可用，请稍后重试',
      },
      { status: 503 }
    );
  }
  if (!reservation) {
    return NextResponse.json(
      { success: false, code: 'QUOTA_EXCEEDED', error: '本月调用额度已用完' },
      { status: 429 }
    );
  }

  try {
    const results = await searchKnowledgeChunks(query, {
      packId,
      limit,
      includeAssets: includeAssets || includeResources,
    });
    await completeApiKeyUsage({
      eventId: reservation.eventId,
      status: 'ok',
      resultCount: results.length,
      latencyMs: Date.now() - startedAt,
    });

    // 部分官方文档 CDN 对没有浏览器 User-Agent 的抓取器返回 404。
    // 统一把知识图片交给同源代理，Skill、Markdown 渲染器和普通浏览器
    // 都能拿到同一张图；原图地址仍通过 originalUrl 保留，便于溯源。
    const assetProxyBaseUrl = getAssetProxyBaseUrl();

    return NextResponse.json({
      success: true,
      packId,
      query,
      quota: {
        limit: verified.key.monthlyQuota,
        usedThisMonth: reservation.usedThisMonth + 1,
      },
      results: results.map((row) => ({
        title: row.title,
        source: row.source,
        sourceUrl: serializeSourceUrl(row.sourceUrl),
        category: row.category,
        heading: row.heading,
        content: row.content,
        score: row.score,
        assets: includeAssets
          ? (row.assets || [])
              .filter((asset) => asset.assetType === 'image')
              .map((asset) => serializeKnowledgeAsset(asset, assetProxyBaseUrl))
          : [],
        resources: includeResources
          ? (row.assets || [])
              .filter((asset) => asset.assetType !== 'image')
              .map((asset) => serializeKnowledgeAsset(asset, null))
          : [],
        metadata: {
          product: row.metadata.product,
          knowledgeType: row.metadata.knowledgeType,
          visibility: row.metadata.visibility,
          persona: row.metadata.persona,
          authority: row.metadata.authority,
          contentRole: row.metadata.contentRole,
          documentType: row.metadata.documentType,
          documentStatus: row.metadata.documentStatus,
          factsVerified: row.metadata.factsVerified,
          updated: row.metadata.updated,
          lastUpdated: row.metadata.lastUpdated,
          fetchedAt: row.metadata.fetchedAt,
          section: row.metadata.section,
          route: row.metadata.route,
          licenseStatus: row.metadata.licenseStatus,
          series: row.metadata.series,
          episode: row.metadata.episode,
          sourceKind: row.metadata.sourceKind,
          platform: row.metadata.platform,
          publisher: row.metadata.publisher,
          publishedAt: row.metadata.publishedAt,
        },
      })),
    });
  } catch (error) {
    await completeApiKeyUsage({
      eventId: reservation.eventId,
      status: 'error',
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        success: false,
        code: 'QUERY_FAILED',
        error: '检索失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
