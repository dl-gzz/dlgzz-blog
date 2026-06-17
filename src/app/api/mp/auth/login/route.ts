import { getMembershipEntitlementForUser } from '@/lib/entitlements';
import {
  createMiniappToken,
  exchangeWechatCodeForOpenid,
  getOrCreateMiniappAccount,
} from '@/lib/mp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Missing wx.login code' },
        { status: 400 }
      );
    }

    const wechatSession = await exchangeWechatCodeForOpenid(code);
    const account = await getOrCreateMiniappAccount(wechatSession);
    const token = createMiniappToken(account.id, account.openid);
    const membership = await getMembershipEntitlementForUser(account.userId);

    return NextResponse.json({
      success: true,
      data: {
        token,
        account: {
          id: account.id,
          openid: account.openid,
        },
        membership,
      },
    });
  } catch (error) {
    console.error('mp login api error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      },
      { status: 500 }
    );
  }
}
