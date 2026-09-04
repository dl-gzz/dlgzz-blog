import { requireSession } from '@/lib/api-security';
import { getMembershipStatus } from '@/lib/membership';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;

  try {
    return NextResponse.json({
      success: true,
      ...(await getMembershipStatus(auth.session.user.id)),
    });
  } catch (error) {
    console.error('[membership/me]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'MEMBERSHIP_UNAVAILABLE',
        error: '会员信息暂时无法读取，请稍后重试',
      },
      { status: 503 }
    );
  }
}
