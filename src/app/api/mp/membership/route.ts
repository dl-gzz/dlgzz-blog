import {
  MembershipError,
  getMembershipStatus,
  redeemMembershipActivationCode,
} from '@/lib/membership';
import { MiniappAuthError, requireMiniappSession } from '@/lib/miniapp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await requireMiniappSession(request);
    return NextResponse.json({
      success: true,
      ...(await getMembershipStatus(session.userId)),
    });
  } catch (error) {
    return handleMembershipError(error, '[mp/membership]');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMiniappSession(request);
    const body = await request.json().catch(() => ({}));
    await redeemMembershipActivationCode({
      userId: session.userId,
      code: typeof body?.code === 'string' ? body.code : '',
    });
    return NextResponse.json({
      success: true,
      ...(await getMembershipStatus(session.userId)),
      notice: '会员权益已开通，网站和小程序将共享这份权益。',
    });
  } catch (error) {
    return handleMembershipError(error, '[mp/membership/redeem]');
  }
}

function handleMembershipError(error: unknown, logLabel: string) {
  if (error instanceof MiniappAuthError || error instanceof MembershipError) {
    return NextResponse.json(
      { success: false, code: error.code, error: error.message },
      { status: error.status }
    );
  }
  console.error(logLabel, error);
  return NextResponse.json(
    {
      success: false,
      code: 'INTERNAL_ERROR',
      error: '会员操作失败，请稍后重试',
    },
    { status: 500 }
  );
}
