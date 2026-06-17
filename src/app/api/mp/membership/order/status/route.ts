import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { getMiniappSession } from '@/lib/mp-auth';
import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const session = await getMiniappSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const aoid = request.nextUrl.searchParams.get('aoid') || '';
    if (!aoid) {
      return NextResponse.json(
        { success: false, error: 'Missing aoid' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const rows = await db
      .select({
        status: payment.status,
        periodEnd: payment.periodEnd,
      })
      .from(payment)
      .where(
        and(
          eq(payment.userId, session.userId),
          eq(payment.subscriptionId, aoid)
        )
      )
      .limit(1);

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const status = rows[0].status;
    return NextResponse.json({
      success: true,
      data: {
        status,
        completed: status === 'active' || status === 'completed',
        periodEnd: rows[0].periodEnd,
      },
    });
  } catch (error) {
    console.error('mp membership order status api error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load order status' },
      { status: 500 }
    );
  }
}
