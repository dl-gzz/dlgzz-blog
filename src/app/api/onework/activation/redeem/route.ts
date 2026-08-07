import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  OneWorkAccessError,
  redeemOneWorkActivation,
} from '@/lib/onework-access';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  try {
    const result = await redeemOneWorkActivation({
      userId: auth.session.user.id,
      code: typeof body?.code === 'string' ? body.code : '',
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
      notice: 'rawKey 只显示这一次，请立即复制保存。以后换电脑可在网站重新生成安装授权。',
    });
  } catch (error) {
    if (error instanceof OneWorkAccessError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[onework/redeem]', error);
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '兑换暂时失败，请稍后重试' },
      { status: 500 }
    );
  }
}
