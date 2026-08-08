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
    });

    return NextResponse.json({
      success: true,
      packs: result.packIds,
      expiresAt: result.expiresAt,
      monthlyQuota: result.monthlyQuota,
      notice: '权益已开通。请点击“复制 AI 安装指令”，由安装器自动绑定当前电脑。',
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
