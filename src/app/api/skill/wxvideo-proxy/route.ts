import { NextRequest, NextResponse } from 'next/server';

// 代理下载：服务器从源站取视频流，转发给浏览器
// 浏览器会弹出"另存为"对话框，用户可自由选择保存位置
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const filename = searchParams.get('filename') || 'video.mp4';

  if (!url) {
    return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
  }

  // 简单防盗：只允许代理 dajiala.com 的链接
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('dajiala.com') && !parsed.hostname.endsWith('qq.com') && !parsed.hostname.endsWith('weixin.qq.com')) {
      return NextResponse.json({ error: '不允许代理该域名' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: '无效的 url' }, { status: 400 });
  }

  const upstream = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `上游请求失败 ${upstream.status}` }, { status: 502 });
  }

  const contentLength = upstream.headers.get('content-length');
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    ...(contentLength ? { 'Content-Length': contentLength } : {}),
  });

  return new NextResponse(upstream.body, { status: 200, headers });
}
