import 'server-only';

import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { PaymentTypes } from '@/payment/types';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';

export const ACTIVE_MEMBERSHIP_PAYMENT_STATUSES = [
  'active',
  'completed',
  'trialing',
] as const;

export interface MembershipEntitlement {
  active: boolean;
  source: 'subscription' | null;
  priceId?: string | null;
  periodEnd?: Date | null;
}

export async function getMembershipEntitlementForUser(
  userId?: string | null
): Promise<MembershipEntitlement> {
  if (!userId) return { active: false, source: null };

  try {
    const db = await getDb();
    const now = new Date();
    const rows = await db
      .select({
        priceId: payment.priceId,
        periodEnd: payment.periodEnd,
      })
      .from(payment)
      .where(
        and(
          eq(payment.userId, userId),
          eq(payment.type, PaymentTypes.SUBSCRIPTION),
          inArray(payment.status, [...ACTIVE_MEMBERSHIP_PAYMENT_STATUSES]),
          gt(payment.periodEnd, now)
        )
      )
      .orderBy(desc(payment.periodEnd), desc(payment.createdAt))
      .limit(1);

    if (!rows.length) return { active: false, source: null };

    return {
      active: true,
      source: 'subscription',
      priceId: rows[0].priceId,
      periodEnd: rows[0].periodEnd,
    };
  } catch {
    return { active: false, source: null };
  }
}

export async function userHasMembershipAccess(userId?: string | null) {
  const entitlement = await getMembershipEntitlementForUser(userId);
  return entitlement.active;
}
