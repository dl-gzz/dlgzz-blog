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
  const filename = (searchParams.get('filename') || 'video.mp4')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120);

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  if (!isAllowed(url)) {
    // 返回实际 hostname 帮助调试
    let hostname = '(无效)';
    try { hostname = new URL(url).hostname; } catch { /* */ }
    return NextResponse.json({ error: `不允许代理该域名: ${hostname}` }, { status: 403 });
  }

  let upstream: Response | null = null;
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    try {
      upstream = await fetch(currentUrl, {
        signal: AbortSignal.timeout(180_000),
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.dajiala.com/',
          'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        },
      });
    } catch {
      return NextResponse.json({ error: '视频上游请求失败' }, { status: 502 });
    }

    if (upstream.status < 300 || upstream.status >= 400) break;
    const location = upstream.headers.get('location');
    if (!location || redirectCount === 3) {
      return NextResponse.json({ error: '视频上游重定向无效' }, { status: 502 });
    }
    let redirectedUrl: URL;
    try {
      redirectedUrl = new URL(location, currentUrl);
    } catch {
      return NextResponse.json({ error: '视频上游重定向地址无效' }, { status: 502 });
    }
    if (!isAllowed(redirectedUrl.toString())) {
      return NextResponse.json({ error: '视频上游重定向到不受信任的域名' }, { status: 502 });
    }
    currentUrl = redirectedUrl.toString();
  }

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: '视频上游返回失败' },
      { status: 502 }
    );
  }

  const contentLength = upstream.headers.get('content-length');
  const contentType = upstream.headers.get('content-type') || 'video/mp4';
  if (!contentType.toLowerCase().startsWith('video/') && contentType !== 'application/octet-stream') {
    return NextResponse.json({ error: '上游不是视频文件' }, { status: 415 });
  }
  if (contentLength && Number(contentLength) > 500 * 1024 * 1024) {
    return NextResponse.json({ error: '视频文件超过 500MB 限制' }, { status: 413 });
  }
  let responseBody = upstream.body;
  if (!contentLength) {
    let bytes = 0;
    responseBody = upstream.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > 500 * 1024 * 1024) {
            controller.error(new Error('视频文件超过 500MB 限制'));
            return;
          }
          controller.enqueue(chunk);
        },
      })
    );
  }

  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ...(contentLength ? { 'Content-Length': contentLength } : {}),
  });

  return new NextResponse(responseBody, { status: 200, headers });
}
