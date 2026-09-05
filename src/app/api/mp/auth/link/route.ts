import { getMembershipStatus } from '@/lib/membership';
import {
  MiniappAuthError,
  getOptionalMiniappSession,
  linkVerifiedWebsiteAccount,
} from '@/lib/miniapp-auth';
import { verifyWebsiteCredentials } from '@/lib/miniapp-website-login';
import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Authenticate WeChat before invoking any password verification.
    if (!(await getOptionalMiniappSession(request))) {
      throw new MiniappAuthError('请先完成微信登录', 'UNAUTHORIZED');
    }
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !password || password.length > 128) {
      throw new MiniappAuthError(
        '请输入网站注册邮箱和密码',
        'INVALID_CREDENTIALS',
        400
      );
    }
    const userId = await verifyWebsiteCredentials(request, email, password);
    await linkVerifiedWebsiteAccount(request, userId);
    return NextResponse.json(
      {
        success: true,
        needsBinding: false,
        membership: await getMembershipStatus(userId),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof MiniappAuthError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    // Credentials and auth responses must never appear in logs.
    console.error('[mp/auth/link] account linking failed');
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: '关联失败，请稍后重试' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
