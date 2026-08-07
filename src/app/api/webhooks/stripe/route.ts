import { websiteConfig } from '@/config/website';
import { StripeProvider } from '@/payment/provider/stripe';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Stripe webhook handler
 * This endpoint receives webhook events from Stripe and processes them
 *
 * @param req The incoming request
 * @returns NextResponse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (websiteConfig.payment.provider !== 'stripe') {
    return NextResponse.json(
      { error: 'Stripe payments are not enabled' },
      { status: 404 }
    );
  }

  // Get the request body as text
  const payload = await req.text();

  // Get the Stripe signature from headers
  const signature = req.headers.get('stripe-signature') || '';

  try {
    // Validate inputs
    if (!payload) {
      return NextResponse.json(
        { error: 'Missing webhook payload' },
        { status: 400 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing Stripe signature' },
        { status: 400 }
      );
    }

    // This route must only ever dispatch to Stripe. Using the globally selected
    // provider here could pass Stripe headers and JSON to another provider.
    const stripeProvider = new StripeProvider();
    await stripeProvider.handleWebhookEvent(payload, signature);

    // Return success
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in webhook route:', error);

    // Return error
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
