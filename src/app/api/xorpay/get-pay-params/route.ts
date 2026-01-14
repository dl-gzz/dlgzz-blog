import { NextRequest, NextResponse } from 'next/server';

/**
 * Get XorPay payment parameters
 * This endpoint fetches payment parameters from XorPay for WeChat JSAPI payment
 *
 * @param req - The request object with aoid query parameter
 * @returns Payment parameters for WeixinJSBridge
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const aoid = searchParams.get('aoid');

    if (!aoid) {
      return NextResponse.json(
        { error: 'Missing aoid parameter' },
        { status: 400 }
      );
    }

    const appId = process.env.XORPAY_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: 'XORPAY_APP_ID not configured' },
        { status: 500 }
      );
    }

    // Fetch payment parameters from XorPay
    const response = await fetch(`https://xorpay.com/api/query/${appId}/${aoid}`);

    if (!response.ok) {
      throw new Error(`XorPay API error: ${response.status}`);
    }

    const data = await response.json();

    console.log('XorPay payment params:', data);

    // Return payment parameters
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching XorPay payment params:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment parameters' },
      { status: 500 }
    );
  }
}
