import { verifyApiKey } from '@/lib/api-key';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const DENY_MESSAGE: Record<string, { status: number; error: string }> = {
  missing: { status: 401, error: '缺少 API Key' },
  invalid: { status: 401, error: 'API Key 无效' },
  revoked: { status: 403, error: 'API Key 或设备已被撤销' },
  entitlement_expired: { status: 403, error: 'OneWorkOS 权益已过期' },
  device_mismatch: { status: 403, error: '设备绑定校验失败' },
  quota_exceeded: { status: 429, error: '本月调用额度已用完' },
};

/** 安装后验收：只校验权益、Key 和设备，不消耗检索额度。 */
export async function GET(request: NextRequest) {
  let verified: Awaited<ReturnType<typeof verifyApiKey>>;
  try {
    verified = await verifyApiKey(
      request.headers.get('authorization'),
      request.headers.get('x-onework-device-id')
    );
  } catch (error) {
    console.error('[onework/install/verify] authorization unavailable', error);
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
    // 设备安装本身不应因为账号当月额度已用完而被误报为失败。
    // verifyApiKey 在返回 quota_exceeded 前已经完成 Key、权益和设备校验。
    if (verified.reason === 'quota_exceeded') {
      return NextResponse.json({
        success: true,
        ready: false,
        code: 'QUOTA_EXCEEDED',
        notice: '设备授权已验证，但本月调用额度已用完',
      });
    }
    const deny = DENY_MESSAGE[verified.reason];
    return NextResponse.json(
      {
        success: false,
        code: verified.reason.toUpperCase(),
        error: deny.error,
      },
      { status: deny.status }
    );
  }

  return NextResponse.json({
    success: true,
    ready: true,
    quota: {
      limit: verified.key.monthlyQuota,
      usedThisMonth: verified.usedThisMonth,
      remaining: Math.max(
        0,
        verified.key.monthlyQuota - verified.usedThisMonth
      ),
    },
  });
}
