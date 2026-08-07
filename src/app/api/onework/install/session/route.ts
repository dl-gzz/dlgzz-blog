import { requireSession } from '@/lib/api-security';
import { createOneWorkInstallToken } from '@/lib/onework-access';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await createOneWorkInstallToken({
    userId: auth.session.user.id,
    platform: typeof body?.platform === 'string' ? body.platform : 'unknown',
    deviceName: typeof body?.deviceName === 'string' ? body.deviceName : '',
  });
  const baseUrl = request.nextUrl.origin;

  return NextResponse.json({
    success: true,
    token: result.rawToken,
    expiresAt: result.expiresAt,
    claimUrl: `${baseUrl}/api/onework/install/claim`,
    notice: '安装授权 10 分钟内有效，且只能使用一次。',
  });
}

