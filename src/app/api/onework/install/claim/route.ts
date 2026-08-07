import {
  claimOneWorkInstallToken,
  OneWorkAccessError,
} from '@/lib/onework-access';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 给跨平台安装器使用的公开接口。它只接受短时一次性 token，绝不接受用户 API Key。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await claimOneWorkInstallToken({
      token: typeof body?.token === 'string' ? body.token : '',
      deviceId: typeof body?.deviceId === 'string' ? body.deviceId : undefined,
      deviceName: typeof body?.deviceName === 'string' ? body.deviceName : '',
      platform: typeof body?.platform === 'string' ? body.platform : 'unknown',
    });
    return NextResponse.json({
      success: true,
      key: {
        id: result.apiKeyId,
        rawKey: result.rawKey,
        keyPrefix: result.keyPrefix,
      },
      packs: result.packIds,
      expiresAt: result.expiresAt,
      monthlyQuota: result.monthlyQuota,
      notice: 'rawKey 只显示这一次，安装器应立即写入本机凭据文件。',
    });
  } catch (error) {
    if (error instanceof OneWorkAccessError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[onework/install/claim]', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '安装授权失败，请重新生成授权' },
      { status: 500 }
    );
  }
}

