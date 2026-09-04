import { getMembershipStatus } from '@/lib/membership';
import { MiniappAuthError, createMiniappSession } from '@/lib/miniapp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await createMiniappSession(
      typeof body?.code === 'string' ? body.code : ''
    );
    const membership = result.userId
      ? await getMembershipStatus(result.userId).catch(() => null)
      : null;

    return NextResponse.json(
      { success: true, ...result, membership },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof MiniappAuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('[mp/auth/login]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        error: '小程序登录失败，请稍后重试',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
