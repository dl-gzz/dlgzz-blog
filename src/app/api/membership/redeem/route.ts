import { requireSameOrigin, requireSession } from '@/lib/api-security';
import {
  MembershipError,
  getMembershipStatus,
  redeemMembershipActivationCode,
} from '@/lib/membership';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const csrf = requireSameOrigin(request);
  if (csrf) return csrf;

  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  try {
    await redeemMembershipActivationCode({
      userId: auth.session.user.id,
      code: typeof body?.code === 'string' ? body.code : '',
    });

    return NextResponse.json({
      success: true,
      ...(await getMembershipStatus(auth.session.user.id)),
      notice: '会员权益已开通，网站和小程序将共享这份权益。',
    });
  } catch (error) {
    if (error instanceof MembershipError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[membership/redeem]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        error: '兑换暂时失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
