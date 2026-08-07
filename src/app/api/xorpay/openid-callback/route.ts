import { NextRequest, NextResponse } from 'next/server';
import { getBaseUrl } from '@/lib/urls/urls';

/**
 * Handle OpenID callback from XorPay
 * XorPay will redirect back to this endpoint with openid parameter
 *
 * @param req - Request with openid query parameter
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const openid = searchParams.get('openid');

    if (!openid) {
      return NextResponse.json(
        { error: 'Missing openid parameter' },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl();
    // OpenID is already stored in an HttpOnly cookie; do not put it in the URL,
    // browser history, analytics, or the Referrer header.
    const response = NextResponse.redirect(`${baseUrl}/payment/checkout`);

    // Set openid in cookie (valid for 1 hour)
    response.cookies.set('xorpay_openid', openid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600, // 1 hour
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    console.error('Error handling OpenID callback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to handle OpenID callback' },
      { status: 500 }
    );
  }
}
