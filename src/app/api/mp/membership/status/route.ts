import { getMembershipEntitlementForUser } from '@/lib/entitlements';
import { getMiniappSession } from '@/lib/mp-auth';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await getMiniappSession(request);
    if (!session) {
      return NextResponse.json({
        success: true,
        data: {
          authenticated: false,
          membership: { active: false, source: null },
        },
      });
    }

    const membership = await getMembershipEntitlementForUser(session.userId);
    return NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        membership,
      },
    });
  } catch (error) {
    console.error('mp membership status api error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load membership status' },
      { status: 500 }
    );
  }
}
