import { createCheckout } from '@/payment';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Test payment endpoint
 * This is for testing XorPay integration without requiring authentication
 *
 * Access: GET http://localhost:3002/api/test-payment
 */
export async function GET(request: NextRequest) {
  try {
    console.log('Starting XorPay test payment...');
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get('planId') || 'pro';
    const priceId = searchParams.get('priceId') || 'xorpay_pro_monthly';

    // Test checkout parameters - using pro monthly plan
    const testParams = {
      planId,
      priceId, // Using the price ID from query or default config
      customerEmail: 'test@example.com',
      successUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/success`,
      cancelUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/payment/cancel`,
      metadata: {
        test: 'true',
        description: 'XorPay Integration Test',
      },
    };

    console.log('Test parameters:', testParams);

    // Create checkout session
    const result = await createCheckout(testParams);

    console.log('Checkout result:', result);

    // Return result
    return NextResponse.json({
      success: true,
      message: 'XorPay checkout created successfully',
      data: {
        checkoutUrl: result.url,
        orderId: result.id,
        testParams,
      },
      instructions: {
        next: 'Visit the checkoutUrl to complete the payment',
        webhook: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/xorpay`,
      },
    }, { status: 200 });

  } catch (error: any) {
    console.error('XorPay test payment error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Payment test failed',
      details: error.stack,
    }, { status: 500 });
  }
}
