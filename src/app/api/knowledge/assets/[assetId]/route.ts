import { type NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    assetId: string;
  }>;
}

type AssetRow = {
  public_url: string | null;
  mime_type: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  object_key: string | null;
  status: string;
  visibility: string;
};

let sqlSingleton: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (sqlSingleton) return sqlSingleton;

  const explicit = (process.env.DATABASE_SSL || '').toLowerCase();
  const ssl =
    explicit === 'false' || explicit === 'disable' || explicit === 'off'
      ? false
      : 'require';

  sqlSingleton = postgres(process.env.DATABASE_URL!, {
    ssl,
    max: 2,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 30,
  });
  return sqlSingleton;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isBrowserSensitiveCdn(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'www.codebuddy.cn' || hostname === 'codebuddy.cn';
  } catch {
    return false;
  }
}

function getCosObjectUrl(asset: AssetRow) {
  if (
    asset.storage_provider !== 'cos' ||
    !asset.storage_bucket ||
    !asset.object_key
  ) {
    return asset.public_url;
  }

  const endpoint = process.env.KNOWLEDGE_ASSET_ENDPOINT?.trim();
  if (endpoint) {
    return `${endpoint.replace(/\/$/, '')}/${asset.object_key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  const region = process.env.KNOWLEDGE_ASSET_REGION || 'ap-chengdu';
  return `https://${asset.storage_bucket}.cos.${region}.myqcloud.com/${asset.object_key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { assetId } = await context.params;
  if (!assetId) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const rows = await getSql()<AssetRow[]>`
      select public_url, mime_type, storage_provider, storage_bucket, object_key, status, visibility
      from knowledge_assets
      where id = ${assetId}
      limit 1
    `;
    const asset = rows[0];

    if (
      !asset ||
      asset.status !== 'active' ||
      asset.visibility !== 'public' ||
      !asset.public_url ||
      !isHttpsUrl(asset.public_url)
    ) {
      return new NextResponse('Not found', { status: 404 });
    }

    const fetchUrl = getCosObjectUrl(asset);
    if (!fetchUrl || !isHttpsUrl(fetchUrl)) {
      return new NextResponse('Image unavailable', { status: 502 });
    }
    const target = new URL(fetchUrl);

    // 统一由同源代理读取图片并返回二进制。部分宿主（包括 WorkBuddy）
    // 不会跟随图片 URL 的跨域 307；直接返回 200 才能让 Markdown/原生图片渲染稳定工作。
    const upstream = await fetch(target, {
      headers: {
        Accept:
          'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        ...(isBrowserSensitiveCdn(asset.public_url)
          ? {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36',
            }
          : {}),
      },
      cache: 'force-cache',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse('Image unavailable', { status: 502 });
    }

    const contentType =
      upstream.headers.get('content-type') || asset.mime_type || 'image/png';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new NextResponse('Unsupported media type', { status: 415 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Knowledge asset proxy failed:', error);
    return new NextResponse('Image unavailable', { status: 502 });
  }
}
