import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/urls/urls';

/**
 * Get OpenID from XorPay
 * This endpoint redirects to XorPay to get user's WeChat OpenID
 *
 * Usage: Redirect user to this endpoint, XorPay will redirect back with openid
 */
export async function GET(req: NextRequest) {
  try {
    const appId = process.env.XORPAY_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: 'XORPAY_APP_ID not configured' },
        { status: 500 }
      );
    }

    // Get callback URL from query params or use default
    const searchParams = req.nextUrl.searchParams;
    // Use the configured public origin instead of the request Host header;
    // otherwise a forged Host could make XorPay redirect the OpenID to an
    // attacker-controlled domain.
    const publicOrigin = new URL(getBaseUrl()).origin;
    const defaultCallbackUrl = `${publicOrigin}/api/xorpay/openid-callback`;
    const requestedCallback = searchParams.get('callback');
    let callbackUrl = defaultCallbackUrl;
    if (requestedCallback) {
      try {
        const candidate = new URL(requestedCallback, publicOrigin);
        if (
          candidate.origin === publicOrigin &&
          candidate.pathname === '/api/xorpay/openid-callback'
        ) {
          callbackUrl = candidate.toString();
        }
      } catch {
        // Use the fixed same-origin callback below.
      }
    }

    // Encode callback URL
    const encodedCallback = encodeURIComponent(callbackUrl);

    // Redirect to XorPay OpenID endpoint
    const xorpayUrl = `https://xorpay.com/api/openid/${appId}?callback=${encodedCallback}`;

    return NextResponse.redirect(xorpayUrl);
  } catch (error: any) {
    console.error('Error redirecting to XorPay OpenID:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get OpenID' },
      { status: 500 }
    );
  }
}
