import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-security';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Get XorPay payment parameters
 * This endpoint fetches payment parameters from XorPay for WeChat JSAPI payment
 *
 * @param req - The request object with aoid query parameter
 * @returns Payment parameters for WeixinJSBridge
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession('请登录后继续支付');
    if ('response' in auth) return auth.response;
    const searchParams = req.nextUrl.searchParams;
    const aoid = searchParams.get('aoid');

    if (!aoid) {
      return NextResponse.json(
        { error: 'Missing aoid parameter' },
        { status: 400 }
      );
    }

    const appId = process.env.XORPAY_APP_ID;
    const db = await getDb();
    const [order] = await db
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.subscriptionId, aoid),
          eq(payment.userId, auth.session.user.id)
        )
      )
      .limit(1);
    if (!order)
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (!appId) {
      return NextResponse.json(
        { error: 'XORPAY_APP_ID not configured' },
        { status: 500 }
      );
    }

    // Fetch payment parameters from XorPay
    const response = await fetch(
      `https://xorpay.com/api/query/${appId}/${encodeURIComponent(aoid)}`,
      { signal: AbortSignal.timeout(10000), cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`XorPay API error: ${response.status}`);
    }

    const data = await response.json();

    // Return payment parameters
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('Error fetching XorPay payment params:', error);
    return NextResponse.json(
      { error: '获取支付信息失败，请重试' },
      { status: 500 }
    );
  }
}
