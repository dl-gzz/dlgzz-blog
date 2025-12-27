import { NextRequest, NextResponse } from 'next/server';

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

    console.log('Received OpenID from XorPay:', openid);

    // Store openid in session/cookie for later use
    // For now, we'll redirect to a payment page with openid as parameter
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/payment/create?openid=${openid}`
    );

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
