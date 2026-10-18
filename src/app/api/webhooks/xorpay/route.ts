import { createHash, timingSafeEqual } from 'crypto';
import { getDb } from '@/db';
import { payment, xorpayOrderSnapshot } from '@/db/schema';
import { bodyErrorResponse, readBoundedFormData } from '@/lib/api-security';
import { grantMembershipEntitlement } from '@/lib/membership';
import {
  getOneWorkPaymentPacks,
  grantOneWorkEntitlements,
  grantOneWorkUsageCredits,
  shouldGrantOneWorkForPrice,
} from '@/lib/onework-access';
import { getOneWorkUsageCreditsForPrice } from '@/lib/onework-credit-products';
import { parseXorPayAmount } from '@/lib/xorpay-order';
import { and, eq, inArray, lt, ne, or } from 'drizzle-orm';
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
  const contentType = (req.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (
    !['application/x-www-form-urlencoded', 'multipart/form-data'].includes(
      contentType
    )
  ) {
    return NextResponse.json({ error: 'Expected form data' }, { status: 415 });
  }
  try {
    // Parse form data from XorPay
    const formData = await readBoundedFormData(req, 64 * 1024);
    const value = (name: string) => {
      const entry = formData.get(name);
      return typeof entry === 'string' && entry.length <= 256 ? entry : '';
    };
    const aoid = value('aoid');
    const order_id = value('order_id');
    const pay_price = value('pay_price');
    const pay_time = value('pay_time');
    const sign = value('sign');
    const amountMinor = parseXorPayAmount(pay_price);

    // Validate required parameters
    if (
      !aoid ||
      !order_id ||
      !pay_time ||
      !/^[0-9a-f]{32}$/i.test(sign) ||
      amountMinor === null
    ) {
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

    if (
      !timingSafeEqual(
        Buffer.from(sign.toLowerCase()),
        Buffer.from(expectedSign)
      )
    ) {
      console.error('Invalid XorPay webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const db = await getDb();
    // A valid signature is not enough: bind it to the immutable checkout
    // snapshot, not the current catalog or callback-supplied order/amount.
    const orders = await db
      .select()
      .from(payment)
      .where(eq(payment.subscriptionId, aoid))
      .limit(2);
    if (orders.length !== 1) {
      return new NextResponse('Unknown or ambiguous order', { status: 404 });
    }
    const existingOrder = orders[0];
    const [snapshot] = await db
      .select()
      .from(xorpayOrderSnapshot)
      .where(eq(xorpayOrderSnapshot.paymentId, existingOrder.id))
      .limit(1);
    if (!snapshot) {
      // Acknowledge already-completed legacy orders without granting anything.
      // Pending legacy orders need trusted manual reconciliation, never guessed
      // prices or a snapshot copied from an untrusted callback.
      return new NextResponse(
        existingOrder.status === 'completed'
          ? 'ok'
          : 'Order requires reconciliation',
        { status: existingOrder.status === 'completed' ? 200 : 409 }
      );
    }
    if (
      snapshot.currency !== 'CNY' ||
      snapshot.providerOrderId !== order_id ||
      snapshot.amountMinor !== amountMinor
    ) {
      return NextResponse.json(
        { error: 'Order or amount mismatch' },
        { status: 400 }
      );
    }
    if (existingOrder.status === 'completed') return new NextResponse('ok');
    if (!['processing', 'pending', 'granting'].includes(existingOrder.status)) {
      return new NextResponse('Order cannot be completed', { status: 409 });
    }

    // 先原子锁定这笔回调，防止 XorPay 并发重试重复发放权益。
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
          eq(payment.id, existingOrder.id),
          inArray(payment.status, ['processing', 'pending', 'granting']),
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
        .where(eq(payment.id, existingOrder.id))
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
      await db.transaction(async (tx) => {
        const [currentOrder] = await tx
          .select({ status: payment.status })
          .from(payment)
          .where(eq(payment.id, paid.id))
          .for('update')
          .limit(1);
        if (currentOrder?.status === 'completed') return;
        if (currentOrder?.status !== 'granting')
          throw new Error('Order claim was revoked');
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
            database: tx,
            userId: paid.userId,
            packIds: getOneWorkPaymentPacks(),
            trialDays: periodDays,
            monthlyQuota,
            source: 'xorpay',
            externalOrderId: `xorpay:${aoid}`,
          });
          await grantMembershipEntitlement({
            database: tx,
            paymentId: paid.id,
            userId: paid.userId,
            durationDays: periodDays,
            source: 'website',
            externalId: `xorpay:${aoid}`,
          });
        } else {
          const credits = getOneWorkUsageCreditsForPrice(paid.priceId);
          if (credits) {
            await grantOneWorkUsageCredits({
              database: tx,
              userId: paid.userId,
              credits,
              source: 'xorpay',
              externalOrderId: `xorpay:${aoid}`,
            });
          }
        }

        await tx
          .update(payment)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(payment.id, paid.id), eq(payment.status, 'granting')));
        console.log(`Payment ${aoid} marked as completed`);
      });
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
    const invalidBody = bodyErrorResponse(error);
    if (invalidBody) return invalidBody;
    // Do not write SQL parameters or callback details into ordinary logs.
    console.error(
      'Error in XorPay webhook:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return new NextResponse('error', { status: 500 });
  }
}
