import { NextResponse } from 'next/server';

/**
 * 诊断 API - 获取服务器出站 IP 地址
 * 访问此端点可以看到 Zeabur 服务器用于连接外部服务的 IP 地址
 */
export async function GET() {
  try {
    // 使用多个 IP 检测服务来确保准确性
    const services = [
      'https://api.ipify.org?format=json',
      'https://ifconfig.me/ip',
      'https://api.ip.sb/ip',
    ];

    const results = await Promise.allSettled(
      services.map(async (service) => {
        const response = await fetch(service);
        const data = await response.text();
        return data.trim();
      })
    );

    const ips = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<string>).value);

    return NextResponse.json({
      message: '服务器出站 IP 地址',
      ips: ips,
      primaryIp: ips[0] || 'unknown',
      timestamp: new Date().toISOString(),
      hint: '将 primaryIp 添加到 MemFire Cloud 白名单中',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: '获取 IP 失败',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
