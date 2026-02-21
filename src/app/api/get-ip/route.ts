import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取请求者的真实 IP 地址
 */
export async function GET(request: NextRequest) {
  // 尝试从多个 header 中获取真实 IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown';

  return NextResponse.json({
    ip: ip,
  });
}
