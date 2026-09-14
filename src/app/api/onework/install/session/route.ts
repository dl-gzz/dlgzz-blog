import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  OneWorkAccessError,
  createOneWorkInstallToken,
  isLegacyInstallerEnabled,
} from '@/lib/onework-access';
import { getBaseUrl } from '@/lib/urls/urls';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isLegacyInstallerEnabled()) {
    return NextResponse.json(
      {
        success: false,
        code: 'LEGACY_INSTALLER_DISABLED',
        error:
          '旧版安装方式已停用，请安装 one-worker-os 完整插件并使用 OAuth 连接。',
      },
      { status: 410 }
    );
  }

  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 10_000) {
    return NextResponse.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' },
      { status: 413 }
    );
  }

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (
    (body?.platform !== undefined &&
      (typeof body.platform !== 'string' || body.platform.length > 80)) ||
    (body?.deviceName !== undefined &&
      (typeof body.deviceName !== 'string' || body.deviceName.length > 200))
  ) {
    return NextResponse.json(
      { success: false, code: 'BAD_REQUEST', error: '安装设备参数无效' },
      { status: 400 }
    );
  }

  try {
    const result = await createOneWorkInstallToken({
      userId: auth.session.user.id,
      platform: typeof body?.platform === 'string' ? body.platform : 'unknown',
      deviceName: typeof body?.deviceName === 'string' ? body.deviceName : '',
    });
    const baseUrl = getBaseUrl();

    return NextResponse.json({
      success: true,
      token: result.rawToken,
      expiresAt: result.expiresAt,
      claimUrl: `${baseUrl}/api/onework/install/claim`,
      notice: '安装授权 10 分钟内有效，且只能使用一次。',
    });
  } catch (error) {
    if (error instanceof OneWorkAccessError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[onework/install/session]', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '生成安装授权失败' },
      { status: 500 }
    );
  }
}
