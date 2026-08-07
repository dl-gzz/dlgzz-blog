import { createHash } from 'crypto';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import { markWorkerInstancePayment } from '@/lib/workers';
import {
  getOneWorkPaymentPacks,
  grantOneWorkEntitlements,
  shouldGrantOneWorkForPrice,
} from '@/lib/onework-access';
import { eq } from 'drizzle-orm';
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
      sign,
    });

    // Validate required parameters
    if (!aoid || !order_id || !pay_price || !pay_time || !sign) {
      console.error('Missing required parameters');
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Verify signature
    const appSecret = process.env.XORPAY_APP_SECRET;
    if (!appSecret) {
      console.error('XORPAY_APP_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Calculate expected signature
    const signString = `${aoid}${order_id}${pay_price}${pay_time}${appSecret}`;
    const expectedSign = createHash('md5').update(signString).digest('hex');

    if (sign !== expectedSign) {
      console.error('Invalid signature', { received: sign, expected: expectedSign });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Update payment status in database
    const db = await getDb();
    const [paymentBeforeUpdate] = await db
      .select({ id: payment.id, userId: payment.userId, priceId: payment.priceId, status: payment.status })
      .from(payment)
      .where(eq(payment.subscriptionId, aoid))
      .limit(1);

    const updatedPayment = await db
      .update(payment)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, aoid))
      .returning();

    if (updatedPayment.length > 0) {
      console.log(`Payment ${aoid} marked as completed`);
      await markWorkerInstancePayment({
        subscriptionId: aoid,
        paymentStatus: 'completed',
      });

      // Optional: Send notification to user
      // You can implement email notification here

      // 网站内购的 OneWorkOS 价格需要显式配置 ONEWORK_PRICE_IDS，避免误把普通会员赠送成知识包。
      // XorPay 可能重复回调，只有第一次从 processing -> completed 时才授予权益。
      if (
        paymentBeforeUpdate &&
        paymentBeforeUpdate.status !== 'completed' &&
        shouldGrantOneWorkForPrice(paymentBeforeUpdate.priceId)
      ) {
        await grantOneWorkEntitlements({
          userId: paymentBeforeUpdate.userId,
          packIds: getOneWorkPaymentPacks(),
          source: 'xorpay',
          externalOrderId: aoid,
        });
      }

    } else {
      console.warn(`Payment record not found for aoid: ${aoid}`);
    }

    // Return "ok" to XorPay (required)
    return new NextResponse('ok', { status: 200 });

  } catch (error) {
    console.error('Error in XorPay webhook:', error);
    return new NextResponse('error', { status: 500 });
  }
}
