import { NextRequest, NextResponse } from 'next/server';

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
    const callbackUrl = searchParams.get('callback') ||
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/xorpay/openid-callback`;

    // Encode callback URL
    const encodedCallback = encodeURIComponent(callbackUrl);

    // Redirect to XorPay OpenID endpoint
    const xorpayUrl = `https://xorpay.com/api/openid/${appId}?callback=${encodedCallback}`;

    console.log('Redirecting to XorPay OpenID:', xorpayUrl);

    return NextResponse.redirect(xorpayUrl);
  } catch (error: any) {
    console.error('Error redirecting to XorPay OpenID:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get OpenID' },
      { status: 500 }
    );
  }
}
