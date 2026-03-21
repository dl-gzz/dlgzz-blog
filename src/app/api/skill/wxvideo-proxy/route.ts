import { NextRequest, NextResponse } from 'next/server';

// 允许代理的域名（视频实际存在腾讯/微信 CDN）
const ALLOWED_HOSTS = [
  'dajiala.com',
  'qq.com',
  'weixin.qq.com',
  'mp.weixin.qq.com',
  'video.weixin.qq.com',
  'szextshort.weixin.qq.com',
  'finder.video.qq.com',
  'vweixinf.tc.qq.com',
  'vweixin.tc.qq.com',
];

function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'video.mp4';

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  if (!isAllowed(url)) {
    // 返回实际 hostname 帮助调试
    let hostname = '(无效)';
    try { hostname = new URL(url).hostname; } catch { /* */ }
    return NextResponse.json({ error: `不允许代理该域名: ${hostname}` }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      signal: AbortSignal.timeout(180_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.dajiala.com/',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `fetch 失败: ${e.message}` }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `上游返回 ${upstream.status}`, url },
      { status: 502 }
    );
  }

  const contentLength = upstream.headers.get('content-length');
  const contentType = upstream.headers.get('content-type') || 'video/mp4';
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ...(contentLength ? { 'Content-Length': contentLength } : {}),
  });

  return new NextResponse(upstream.body, { status: 200, headers });
}
