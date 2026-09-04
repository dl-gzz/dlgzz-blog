import { createHash } from 'crypto';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { grantMembershipEntitlement } from '@/lib/membership';
import {
  getOneWorkPaymentPacks,
  grantOneWorkEntitlements,
  shouldGrantOneWorkForPrice,
} from '@/lib/onework-access';
import { and, eq, lt, ne, or } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * XorPay webhook handler
 * Handles payment notifications from XorPay
 *
 * Signature verification formula (from XorPay docs):
 * sign = MD5(aoid + order_id + pay_price + pay_time + app_secret)
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Parse form data from XorPay
    const formData = await req.formData();
    const aoid = formData.get('aoid') as string;
    const order_id = formData.get('order_id') as string;
    const pay_price = formData.get('pay_price') as string;
    const pay_time = formData.get('pay_time') as string;
    const sign = formData.get('sign') as string;

    console.log('XorPay webhook received:', {
      aoid,
      order_id,
      pay_price,
      pay_time,
    });

    // Validate required parameters
    if (!aoid || !order_id || !pay_price || !pay_time || !sign) {
      console.error('Missing required parameters');
      return NextResponse.json(
        { error: 'Missing parameters' },
        { status: 400 }
      );
    }

    // Verify signature
    const appSecret = process.env.XORPAY_APP_SECRET;
    if (!appSecret) {
      console.error('XORPAY_APP_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Calculate expected signature
    const signString = `${aoid}${order_id}${pay_price}${pay_time}${appSecret}`;
    const expectedSign = createHash('md5').update(signString).digest('hex');

    if (sign !== expectedSign) {
      console.error('Invalid XorPay webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // 先原子锁定这笔回调，防止 XorPay 并发重试重复发放权益。
    const db = await getDb();
    const grantingStaleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const claimedPayments = await db
      .update(payment)
      .set({
        status: 'granting',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payment.subscriptionId, aoid),
          ne(payment.status, 'completed'),
          or(
            ne(payment.status, 'granting'),
            lt(payment.updatedAt, grantingStaleBefore)
          )
        )
      )
      .returning();

    if (claimedPayments.length === 0) {
      const [existing] = await db
        .select({ status: payment.status })
        .from(payment)
        .where(eq(payment.subscriptionId, aoid))
        .limit(1);
      if (!existing) {
        console.error(`Payment record not found for aoid: ${aoid}`);
        return new NextResponse('error', { status: 404 });
      }
      if (existing.status === 'completed') {
        return new NextResponse('ok', { status: 200 });
      }
      // 另一个回调正在发放，让支付平台稍后重试。
      return new NextResponse('retry', { status: 503 });
    }

    const paid = claimedPayments[0];
    try {
      if (shouldGrantOneWorkForPrice(paid.priceId)) {
        const periodStart = paid.periodStart || paid.createdAt;
        const periodEnd = paid.periodEnd;
        const periodDays = periodEnd
          ? Math.max(
              1,
              Math.ceil(
                (periodEnd.getTime() - periodStart.getTime()) /
                  (24 * 60 * 60 * 1000)
              )
            )
          : paid.interval === 'year'
            ? 365
            : 30;
        const configuredQuota = Number(
          process.env.ONEWORK_MONTHLY_QUOTA || 1000
        );
        const monthlyQuota =
          Number.isInteger(configuredQuota) && configuredQuota > 0
            ? configuredQuota
            : 1000;

        await grantOneWorkEntitlements({
          userId: paid.userId,
          packIds: getOneWorkPaymentPacks(),
          trialDays: periodDays,
          monthlyQuota,
          source: 'xorpay',
          externalOrderId: `xorpay:${aoid}`,
        });
        await grantMembershipEntitlement({
          userId: paid.userId,
          durationDays: periodDays,
          source: 'website',
          externalId: `xorpay:${aoid}`,
        });
      }

      await db
        .update(payment)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(payment.id, paid.id), eq(payment.status, 'granting')));
      console.log(`Payment ${aoid} marked as completed`);
    } catch (error) {
      await db
        .update(payment)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(eq(payment.id, paid.id), eq(payment.status, 'granting')));
      throw error;
    }

    // Return "ok" to XorPay (required)
    return new NextResponse('ok', { status: 200 });
  } catch (error) {
    console.error('Error in XorPay webhook:', error);
    return new NextResponse('error', { status: 500 });
  }
}
