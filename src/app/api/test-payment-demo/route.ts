import { NextResponse } from 'next/server';

/**
 * Demo payment endpoint (no database required)
 * This creates a mock payment session for demonstration purposes
 *
 * Access: GET http://localhost:3003/api/test-payment-demo
 */
export async function GET() {
  try {
    console.log('Starting demo payment (no database)...');

    // Generate a mock order ID
    const mockOrderId = `DEMO_${Date.now()}`;

    // Create mock checkout URL
    const checkoutUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/payment/checkout-demo?aoid=${mockOrderId}`;

    console.log('Demo checkout created:', checkoutUrl);

    // Return result
    return NextResponse.json({
      success: true,
      message: 'Demo checkout created (no database)',
      data: {
        checkoutUrl: checkoutUrl,
        orderId: mockOrderId,
        note: 'This is a demo mode. No actual payment will be processed.',
      },
    }, { status: 200 });

  } catch (error: any) {
    console.error('Demo payment error:', error);

    return NextResponse.json({
      success: false,
      error: error.message || 'Demo payment failed',
      details: error.stack,
    }, { status: 500 });
  }
}
