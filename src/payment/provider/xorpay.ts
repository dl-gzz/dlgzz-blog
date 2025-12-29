import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { getDb } from '@/db';
import { payment, user } from '@/db/schema';
import {
  findPlanByPriceId,
  findPriceInPlan,
} from '@/lib/price-plan';
import { sendEmail } from '@/mail';
import { sendNotification } from '@/notification/notification';
import { desc, eq } from 'drizzle-orm';
import {
  type CheckoutResult,
  type CreateCheckoutParams,
  type CreatePortalParams,
  type PaymentProvider,
  type PaymentStatus,
  PaymentTypes,
  type PortalResult,
  type Subscription,
  type getSubscriptionsParams,
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
  private webhookSecret: string;
  private apiBaseUrl = 'https://api.xorpay.com';

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

    const webhookSecret = process.env.XORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('XORPAY_WEBHOOK_SECRET is not set. Webhook validation will be disabled.');
    }

    this.appId = appId;
    this.appSecret = appSecret;
    this.webhookSecret = webhookSecret || '';
  }

  /**
   * Generate signature for XorPay API requests
   */
  private generateSignature(params: Record<string, any>): string {
    // Sort parameters by key
    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys
      .map(key => `${key}=${params[key]}`)
      .join('&');

    // Add app secret
    const stringToSign = `${signString}&key=${this.appSecret}`;

    // Generate MD5 hash
    return createHash('md5').update(stringToSign).digest('hex').toUpperCase();
  }

  /**
   * Create or get customer in database
   */
  private async createOrGetCustomer(email: string): Promise<string> {
    const db = await getDb();

    // Find existing user by email
    const existingUser = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

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
          updatedAt: new Date()
        })
        .where(eq(user.email, email));
    }

    return customerId;
  }

  /**
   * Create a checkout session for XorPay (WeChat JSAPI Payment or Alipay)
   */
  async createCheckout(params: CreateCheckoutParams & { openid?: string }): Promise<CheckoutResult> {
    try {
      const { priceId, customerEmail, successUrl, openid } = params;

      // Get price information
      const plan = findPlanByPriceId(priceId);
      if (!plan) {
        throw new Error(`Plan not found for price ID: ${priceId}`);
      }

      const price = findPriceInPlan(plan.id, priceId);
      if (!price) {
        throw new Error(`Price not found in plan: ${priceId}`);
      }

      // Create or get customer
      const customerId = await this.createOrGetCustomer(customerEmail);

      // Generate order number
      const orderNo = `ORDER_${Date.now()}_${randomUUID().substring(0, 8)}`;

      // Notify URL - MUST be accessible from internet
      const notifyUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/xorpay`;

      // Build request parameters
      // Use WeChat JSAPI if openid is provided, otherwise use Alipay
      const payType = openid ? 'jsapi' : 'alipay';

      const requestParams: Record<string, string> = {
        name: plan.name || '独立工作者会员',
        pay_type: payType,
        price: (price.amount / 100).toFixed(2), // Convert cents to yuan, format like "1.80"
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

      console.log('XorPay request params:', {
        ...requestParams,
        sign,
        apiUrl: `${this.apiBaseUrl}/pay/${this.appId}`,
      });

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
      });

      const result = await response.json();

      console.log('XorPay response:', result);

      // Check response status
      if (result.status !== 'ok') {
        // If missing openid, return the authorization URL
        if (result.status === 'missing_argument' && result.info === 'openid') {
          // XorPay should return a URL for getting openid
          // For now, we'll return an error asking the user to use WeChat browser
          throw new Error('Please open this payment page in WeChat browser to complete payment');
        }

        // Handle other error statuses
        const errorInfo = result.missing_argument || result.pay_type_error || result.info || result.status || 'Unknown error';
        throw new Error(`XorPay checkout failed: ${errorInfo}`);
      }

      // Get user ID from email for payment record
      const db = await getDb();
      let userRecord = await db
        .select()
        .from(user)
        .where(eq(user.email, customerEmail))
        .limit(1);

      // Create user if not exists (for testing purposes)
      if (userRecord.length === 0) {
        console.log(`Creating test user for email: ${customerEmail}`);
        const newUserId = randomUUID();
        await db.insert(user).values({
          id: newUserId,
          name: 'Test User',
          email: customerEmail,
          emailVerified: true,
          customerId: customerId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        userRecord = [{
          id: newUserId,
          name: 'Test User',
          email: customerEmail,
          emailVerified: true,
          customerId: customerId,
          image: null,
          role: null,
          banned: null,
          banReason: null,
          banExpires: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }];
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

      // Save payment record to database
      await db.insert(payment).values({
        id: randomUUID(),
        userId: userRecord[0].id,
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
        subscriptionId: result.aoid, // Use XorPay order ID as subscription ID
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Return payment URL with QR code data
      // Encode QR code and expiry info in URL for immediate use
      const qrCodeUrl = encodeURIComponent(result.info.qr);
      const expiresIn = result.expires_in || 7200;

      return {
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/checkout?aoid=${result.aoid}&qr=${qrCodeUrl}&expires=${expiresIn}`,
        id: result.aoid, // XorPay order ID
      };
    } catch (error) {
      console.error('XorPay createCheckout error:', error);
      throw error;
    }
  }

  /**
   * Create customer portal (not supported by XorPay)
   */
  async createCustomerPortal(params: CreatePortalParams): Promise<PortalResult> {
    // XorPay doesn't have a built-in customer portal
    // Return to billing page
    const returnUrl = params.returnUrl || `${process.env.NEXT_PUBLIC_BASE_URL}/billing`;

    return {
      url: returnUrl,
    };
  }

  /**
   * Get customer subscriptions
   */
  async getSubscriptions(params: getSubscriptionsParams): Promise<Subscription[]> {
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

  /**
   * Handle XorPay webhook event
   */
  async handleWebhookEvent(payload: string, signature: string): Promise<void> {
    try {
      const event = JSON.parse(payload);

      // Verify signature if webhook secret is set
      if (this.webhookSecret) {
        const expectedSignature = this.generateSignature(event);
        if (signature !== expectedSignature) {
          throw new Error('Invalid webhook signature');
        }
      }

      // Handle different event types
      switch (event.event_type || event.trade_state) {
        case 'SUCCESS':
        case 'TRADE_SUCCESS':
          await this.handlePaymentSuccess(event);
          break;
        case 'CLOSED':
        case 'TRADE_CLOSED':
          await this.handlePaymentCanceled(event);
          break;
        case 'REFUND':
          await this.handleRefund(event);
          break;
        default:
          console.log(`Unhandled XorPay event type: ${event.event_type || event.trade_state}`);
      }
    } catch (error) {
      console.error('XorPay webhook error:', error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSuccess(event: any): Promise<void> {
    const db = await getDb();
    const aoid = event.aoid; // XorPay uses 'aoid' as order ID
    const orderId = event.order_id; // Our system's order ID

    console.log('Processing payment success:', { aoid, orderId });

    // Update payment record status to 'active' (all payments are subscriptions now)
    const updatedPayment = await db
      .update(payment)
      .set({
        status: 'active', // ⭐ 订阅设为 active
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, aoid))
      .returning();

    // Send notification and confirmation email if payment found
    if (updatedPayment.length > 0) {
      const payAmount = parseFloat(event.pay_price || '0');
      const paymentRecord = updatedPayment[0];

      // Get user email from payment record
      const userRecord = await db
        .select()
        .from(user)
        .where(eq(user.id, paymentRecord.userId))
        .limit(1);

      const customerEmail = userRecord.length > 0 ? userRecord[0].email : 'Unknown';

      // Send notification
      await sendNotification(
        aoid,
        paymentRecord.customerId,
        customerEmail,
        payAmount
      );

      // Send payment success confirmation email
      try {
        // Get plan information
        const plan = findPlanByPriceId(paymentRecord.priceId);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        if (plan && customerEmail !== 'Unknown') {
          await sendEmail({
            to: customerEmail,
            template: 'paymentSuccess',
            context: {
              planName: plan.name || '独立工作者会员',
              interval: paymentRecord.interval || 'month',
              amount: payAmount * 100, // Convert yuan to cents for email template
              currency: 'CNY',
              periodStart: paymentRecord.periodStart?.toISOString() || new Date().toISOString(),
              periodEnd: paymentRecord.periodEnd?.toISOString() || new Date().toISOString(),
              dashboardUrl: `${baseUrl}/dashboard`,
            },
            locale: 'zh', // Default to Chinese, could be improved by storing user locale preference
          });

          console.log(`Payment success email sent to: ${customerEmail}`);
        }
      } catch (emailError) {
        console.error('Failed to send payment success email:', emailError);
        // Don't throw - email failure shouldn't block payment processing
      }

      console.log(`Payment completed successfully: ${aoid}`);
    } else {
      console.warn(`Payment record not found for aoid: ${aoid}`);
    }
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(event: any): Promise<void> {
    const db = await getDb();
    const orderNo = event.out_trade_no;

    await db
      .update(payment)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, orderNo));

    console.log(`Payment canceled: ${orderNo}`);
  }

  /**
   * Handle refund
   */
  private async handleRefund(event: any): Promise<void> {
    const db = await getDb();
    const orderNo = event.out_trade_no;

    await db
      .update(payment)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
      })
      .where(eq(payment.subscriptionId, orderNo));

    console.log(`Payment refunded: ${orderNo}`);
  }
}
