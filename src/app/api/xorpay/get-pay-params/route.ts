import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { requireSession } from '@/lib/api-security';
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
    const auth = await requireSession();
    if ('response' in auth) return auth.response;

    const searchParams = req.nextUrl.searchParams;
    const aoid = searchParams.get('aoid');

    if (!aoid) {
      return NextResponse.json(
        { error: 'Missing aoid parameter' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const [ownedPayment] = await db
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.subscriptionId, aoid), eq(payment.userId, auth.session.user.id)))
      .limit(1);
    if (!ownedPayment) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    }

    const appId = process.env.XORPAY_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: 'XORPAY_APP_ID not configured' },
        { status: 500 }
      );
    }

    // Fetch payment parameters from XorPay
    const response = await fetch(`https://xorpay.com/api/query/${appId}/${aoid}`);

    if (!response.ok) {
      throw new Error(`XorPay API error: ${response.status}`);
    }

    const data = await response.json();

    // Return payment parameters
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching XorPay payment params:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment parameters' },
      { status: 500 }
    );
  }
}
