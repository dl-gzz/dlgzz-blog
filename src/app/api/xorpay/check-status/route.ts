import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/api-security';
import { findPriceInPlan, findPlanByPriceId } from '@/lib/price-plan';

/**
 * Check XorPay payment status
 * This endpoint checks if a payment has been completed
 *
 * @param req - Request with aoid query parameter
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession('请登录后查看支付结果');
    if ('response' in auth) return auth.response;
    const searchParams = req.nextUrl.searchParams;
    const aoid = searchParams.get('aoid');

    if (!aoid) {
      return NextResponse.json(
        { error: 'Missing aoid parameter' },
        { status: 400 }
      );
    }

    // Check payment status in database
    const db = await getDb();
    const paymentRecord = await db
      .select()
      .from(payment)
      .where(
        and(
          eq(payment.subscriptionId, aoid),
          eq(payment.userId, auth.session.user.id)
        )
      )
      .limit(1);

    if (paymentRecord.length === 0) {
      return NextResponse.json(
        { status: 'not_found', message: 'Payment not found' },
        { status: 404 }
      );
    }

    const paymentStatus = paymentRecord[0].status;
    const priceId = paymentRecord[0].priceId;

    // Get price information from config
    const plan = findPlanByPriceId(priceId);
    const price = plan ? findPriceInPlan(plan.id, priceId) : null;

    return NextResponse.json(
      {
        status: paymentStatus,
        aoid: aoid,
        data: {
          priceId: priceId,
          amount: price?.amount || 0,
          currency: price?.currency || 'CNY',
          planId: plan?.id,
          planName: plan?.name || plan?.id,
          type: paymentRecord[0].type,
          interval: paymentRecord[0].interval,
          createdAt: paymentRecord[0].createdAt,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('Error checking payment status:', error);
    return NextResponse.json(
      { error: '查询支付状态失败，请稍后重试' },
      { status: 500 }
    );
  }
}
