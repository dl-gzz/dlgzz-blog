import { createHash, randomUUID } from 'crypto';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { getMembershipEntitlementForUser } from '@/lib/entitlements';
import { getDefaultMembershipPrice } from '@/lib/membership-plan';
import { getMiniappSession } from '@/lib/mp-auth';
import { getBaseUrl } from '@/lib/urls/urls';
import { type NextRequest, NextResponse } from 'next/server';

function md5(value: string) {
  return createHash('md5').update(value).digest('hex');
}

function normalizeWxPayParams(info: unknown) {
  if (!info || typeof info !== 'object') return null;
  const data = info as Record<string, unknown>;
  const source =
    (typeof data.payParams === 'object' && data.payParams) ||
    (typeof data.pay_params === 'object' && data.pay_params) ||
    data;
  const params = source as Record<string, unknown>;
  const timeStamp = String(
    params.timeStamp || params.timestamp || params.time_stamp || ''
  );
  const nonceStr = String(params.nonceStr || params.nonce_str || '');
  const packageValue = String(
    params.package || params.packageValue || params.package_str || ''
  );
  const signType = String(params.signType || params.sign_type || 'MD5');
  const paySign = String(
    params.paySign || params.pay_sign || params.sign || ''
  );

  if (!timeStamp || !nonceStr || !packageValue || !paySign) return null;
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType,
    paySign,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getMiniappSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const existingMembership = await getMembershipEntitlementForUser(
      session.userId
    );
    if (existingMembership.active) {
      return NextResponse.json({
        success: true,
        data: {
          alreadyActive: true,
          membership: existingMembership,
        },
      });
    }

    const appId = process.env.XORPAY_APP_ID;
    const appSecret = process.env.XORPAY_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { success: false, error: 'XorPay is not configured' },
        { status: 500 }
      );
    }

    const { planId, price } = getDefaultMembershipPrice();
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (price.interval === 'year') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const orderId = `MP_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const notifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL || getBaseUrl()}/api/webhooks/xorpay`;
    const requestParams: Record<string, string> = {
      name: '独立工作者会员',
      pay_type: 'jsapi',
      price: (price.amount / 100).toFixed(2),
      order_id: orderId,
      notify_url: notifyUrl,
      openid: session.openid,
    };
    const sign = md5(
      `${requestParams.name}${requestParams.pay_type}${requestParams.price}${requestParams.order_id}${requestParams.notify_url}${appSecret}`
    );

    const response = await fetch(`https://xorpay.com/api/pay/${appId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...requestParams,
        sign,
        order_uid: session.openid,
      }).toString(),
    });

    const result = await response.json();
    if (result.status !== 'ok') {
      const errorInfo =
        result.info ||
        result.missing_argument ||
        result.status ||
        'Payment failed';
      return NextResponse.json(
        { success: false, error: String(errorInfo) },
        { status: 502 }
      );
    }

    const db = await getDb();
    await db.insert(payment).values({
      id: randomUUID(),
      priceId: price.priceId,
      type: price.type,
      interval: price.interval || null,
      userId: session.userId,
      customerId: `mp_${session.accountId}`,
      subscriptionId: result.aoid,
      status: 'processing',
      periodStart,
      periodEnd,
      cancelAtPeriodEnd: false,
      trialStart: null,
      trialEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: {
        alreadyActive: false,
        aoid: result.aoid,
        planId,
        priceId: price.priceId,
        payParams: normalizeWxPayParams(result.info),
      },
    });
  } catch (error) {
    console.error('mp membership order api error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create order',
      },
      { status: 500 }
    );
  }
}
