import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { getDb } from '@/db';
import { payment, user, xorpayOrderSnapshot } from '@/db/schema';
import { findPlanByPriceId, findPriceInPlan } from '@/lib/price-plan';
import { desc, eq } from 'drizzle-orm';
import type {
  CheckoutResult,
  CreateCheckoutParams,
  CreatePortalParams,
  PaymentProvider,
  PaymentStatus,
  PaymentTypes,
  PortalResult,
  Subscription,
  getSubscriptionsParams,
} from '../types';

/**
 * XorPay payment provider implementation
 * XorPay is a Chinese payment gateway supporting Alipay and WeChat Pay
 *
 * API Documentation: https://xorpay.com/doc
 */
export class XorPayProvider implements PaymentProvider {
  private appId: string;
  private appSecret: string;

  /**
   * Initialize XorPay provider with credentials
   */
  constructor() {
    const appId = process.env.XORPAY_APP_ID;
    if (!appId) {
      throw new Error('XORPAY_APP_ID environment variable is not set');
    }

    const appSecret = process.env.XORPAY_APP_SECRET;
    if (!appSecret) {
      throw new Error('XORPAY_APP_SECRET environment variable is not set');
    }

    this.appId = appId;
    this.appSecret = appSecret;
  }

  /**
   * Create or get customer in database
   */
  private async createOrGetCustomer(
    userId: string,
    email: string
  ): Promise<string> {
    const db = await getDb();

    // Find existing user by email
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const account = existingUser[0];
    if (
      !account ||
      account.email !== email ||
      (account.banned &&
        (!account.banExpires || account.banExpires > new Date()))
    ) {
      throw new Error('Checkout account is unavailable');
    }

    if (existingUser.length > 0 && existingUser[0].customerId) {
      return existingUser[0].customerId;
    }

    // Generate a unique customer ID for XorPay
    const customerId = `xorpay_${randomUUID()}`;

    // Update user with customer ID
    if (existingUser.length > 0) {
      await db
        .update(user)
        .set({
          customerId: customerId,
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));
    }

    return customerId;
  }

  /**
   * Create a checkout session for XorPay (WeChat JSAPI Payment or Alipay)
   */
  async createCheckout(
    params: CreateCheckoutParams & { openid?: string }
  ): Promise<CheckoutResult> {
    try {
      const { priceId, userId, customerEmail, successUrl, openid } = params;

      // Get price information
      const plan = findPlanByPriceId(priceId);
      if (!plan) {
        throw new Error(`Plan not found for price ID: ${priceId}`);
      }

      const price = findPriceInPlan(plan.id, priceId);
      if (!price) {
        throw new Error(`Price not found in plan: ${priceId}`);
      }

      if (
        plan.disabled ||
        price.disabled ||
        price.currency.toUpperCase() !== 'CNY' ||
        !Number.isSafeInteger(price.amount) ||
        price.amount <= 0 ||
        price.amount > 2_147_483_647
      ) {
        throw new Error('Checkout price is unavailable');
      }
      const amountMinor = price.amount;

      const db = await getDb();
      // Fail before calling the payment gateway if the snapshot migration has
      // not been applied. Never return a payable order with missing local checks.
      await db
        .select({ paymentId: xorpayOrderSnapshot.paymentId })
        .from(xorpayOrderSnapshot)
        .limit(0);

      // Create or get customer
      const customerId = await this.createOrGetCustomer(userId, customerEmail);

      // Generate order number
      const orderNo = `ORDER_${Date.now()}_${randomUUID().substring(0, 8)}`;

      // Notify URL - MUST be accessible from internet
      const notifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/xorpay`;

      // Build request parameters
      // Use WeChat JSAPI if openid is provided, otherwise use Alipay
      const payType = openid ? 'jsapi' : 'alipay';

      const requestParams: Record<string, string> = {
        name: plan.name || 'OneWorkOS 会员',
        pay_type: payType,
        price: (amountMinor / 100).toFixed(2), // Convert cents to yuan, format like "1.80"
        order_id: orderNo,
        notify_url: notifyUrl,
      };

      // Add openid for WeChat JSAPI payment
      if (openid) {
        requestParams.openid = openid;
      }

      // Generate signature according to XorPay docs
      // Formula: MD5(name + pay_type + price + order_id + notify_url + app_secret)
      // Note: openid is NOT included in signature calculation
      const signString = `${requestParams.name}${requestParams.pay_type}${requestParams.price}${requestParams.order_id}${requestParams.notify_url}${this.appSecret}`;
      const sign = createHash('md5').update(signString).digest('hex');

      // Make API request to XorPay
      const formBody = new URLSearchParams({
        ...requestParams,
        sign,
        return_url: successUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/billing`,
        order_uid: customerEmail,
      }).toString();

      const response = await fetch(`https://xorpay.com/api/pay/${this.appId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
        signal: AbortSignal.timeout(15000),
      });

      const result = await response.json();

      // Check response status
      if (result.status !== 'ok') {
        // If missing openid, return the authorization URL
        if (result.status === 'missing_argument' && result.info === 'openid') {
          // XorPay should return a URL for getting openid
          // For now, we'll return an error asking the user to use WeChat browser
          throw new Error(
            'Please open this payment page in WeChat browser to complete payment'
          );
        }

        // Handle other error statuses
        const errorInfo =
          result.missing_argument ||
          result.pay_type_error ||
          result.info ||
          result.status ||
          'Unknown error';
        throw new Error(`XorPay checkout failed: ${errorInfo}`);
      }

      const aoid =
        typeof result.aoid === 'string'
          ? result.aoid
          : Number.isSafeInteger(result.aoid) && result.aoid > 0
            ? String(result.aoid)
            : '';
      if (
        !response.ok ||
        !aoid ||
        aoid.length > 256 ||
        typeof result.info?.qr !== 'string' ||
        !result.info.qr ||
        result.info.qr.length > 8192
      ) {
        throw new Error('Invalid payment gateway response');
      }

      // Calculate period end based on subscription interval
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);

      // Calculate expiry date based on interval
      if (price.interval === 'month') {
        // Monthly subscription: +1 month
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else if (price.interval === 'year') {
        // Yearly subscription: +1 year
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Save the payment and trusted request fields together, or neither.
      const paymentId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(payment).values({
          id: paymentId,
          userId,
          customerId: customerId,
          priceId: priceId,
          type: price.type,
          interval: price.interval || null,
          status: 'processing',
          periodStart: periodStart,
          periodEnd: periodEnd, // ⭐ 自动计算的到期时间
          cancelAtPeriodEnd: false,
          trialStart: null,
          trialEnd: null,
          subscriptionId: aoid, // Use XorPay order ID as subscription ID
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await tx.insert(xorpayOrderSnapshot).values({
          paymentId,
          providerOrderId: orderNo,
          amountMinor,
          currency: 'CNY',
        });
      });

      // Return payment URL with QR code data
      // Encode QR code and expiry info in URL for immediate use
      const qrCodeUrl = encodeURIComponent(result.info.qr);
      const expiresIn = result.expires_in || 7200;

      const encodedReturnUrl = successUrl
        ? `&return_url=${encodeURIComponent(successUrl)}`
        : '';

      return {
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/checkout?aoid=${encodeURIComponent(aoid)}&qr=${qrCodeUrl}&expires=${expiresIn}&expires_at=${Date.now() + Number(expiresIn) * 1000}${encodedReturnUrl}`,
        id: aoid, // XorPay order ID
      };
    } catch (error) {
      console.error(
        'XorPay createCheckout error:',
        error instanceof Error ? error.name : 'UnknownError'
      );
      throw error;
    }
  }

  /**
   * Create customer portal (not supported by XorPay)
   */
  async createCustomerPortal(
    params: CreatePortalParams
  ): Promise<PortalResult> {
    // XorPay doesn't have a built-in customer portal
    // Return to billing page
    const returnUrl =
      params.returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/billing`;

    return {
      url: returnUrl,
    };
  }

  /**
   * Get customer subscriptions
   */
  async getSubscriptions(
    params: getSubscriptionsParams
  ): Promise<Subscription[]> {
    const db = await getDb();

    // Get payments from database for this user
    const payments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, params.userId))
      .orderBy(desc(payment.createdAt));

    // Convert payments to subscriptions format
    return payments
      .filter((p) => p.status === 'active' || p.status === 'completed')
      .map((p) => ({
        id: p.subscriptionId || p.id,
        customerId: p.customerId,
        status: p.status as PaymentStatus,
        priceId: p.priceId,
        type: p.type as PaymentTypes,
        currentPeriodStart: p.periodStart || p.createdAt,
        currentPeriodEnd: p.periodEnd || undefined,
        createdAt: p.createdAt,
      }));
  }

  /** XorPay only accepts signed form notifications at /api/webhooks/xorpay. */
  async handleWebhookEvent(
    _payload: string,
    _signature: string
  ): Promise<void> {
    throw new Error('XorPay JSON webhook processing is disabled');
  }
}
