import { getMembershipStatus } from '@/lib/membership';
import { MiniappAuthError, bindMiniappSession } from '@/lib/miniapp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await bindMiniappSession({
      request,
      code: typeof body?.code === 'string' ? body.code : '',
    });
    return NextResponse.json({
      success: true,
      ...result,
      membership: await getMembershipStatus(result.userId),
    });
  } catch (error) {
    if (error instanceof MiniappAuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    console.error('[mp/auth/bind]', error);
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        error: '小程序绑定失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}
