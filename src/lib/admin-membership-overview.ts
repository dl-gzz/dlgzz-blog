import 'server-only';

import { getDb } from '@/db';
import {
  membershipActivationCode as codes,
  membershipEntitlement as memberships,
  miniappAccount,
  user,
} from '@/db/schema';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { canAccessHermesAdmin } from './hermes-admin-access';
import { getSession } from '@/lib/server';

export type MembershipCodeState =
  | 'pending'
  | 'redeemed'
  | 'expired'
  | 'revoked';

export function membershipCodeState(
  code: {
    status: string;
    redeemedCount: number;
    maxRedemptions: number;
    codeExpiresAt: Date | null;
  },
  now: Date
): MembershipCodeState {
  if (code.status === 'revoked') return 'revoked';
  if (code.status === 'redeemed' || code.redeemedCount >= code.maxRedemptions)
    return 'redeemed';
  if (code.codeExpiresAt && code.codeExpiresAt <= now) return 'expired';
  return 'pending';
}

// Keep the authorization here, not just in the page or sidebar. Never select
// code hashes, raw codes, WeChat identifiers, or session tokens for the browser.
export async function getAdminMembershipOverview() {
  const session = await getSession();
  if (!canAccessHermesAdmin(session?.user)) throw new Error('FORBIDDEN');

  const db = await getDb();
  const now = new Date();
  const [users, activeMembers, pendingCodes, linkedUsers, recentCodes] =
    await Promise.all([
      db.select({ value: count() }).from(user),
      db
        .select({ value: count() })
        .from(memberships)
        .where(
          and(
            eq(memberships.productId, 'club'),
            eq(memberships.status, 'active'),
            or(isNull(memberships.expiresAt), gt(memberships.expiresAt, now))
          )
        ),
      db
        .select({ value: count() })
        .from(codes)
        .where(
          and(
            eq(codes.productId, 'club'),
            eq(codes.status, 'active'),
            sql`${codes.redeemedCount} < ${codes.maxRedemptions}`,
            or(isNull(codes.codeExpiresAt), gt(codes.codeExpiresAt, now))
          )
        ),
      db
        .select({ value: countDistinct(miniappAccount.userId) })
        .from(miniappAccount),
      db
        .select({
          id: codes.id,
          codePrefix: codes.codePrefix,
          label: codes.label,
          source: codes.source,
          durationDays: codes.durationDays,
          status: codes.status,
          redeemedCount: codes.redeemedCount,
          maxRedemptions: codes.maxRedemptions,
          codeExpiresAt: codes.codeExpiresAt,
          createdAt: codes.createdAt,
          redeemedAt: codes.redeemedAt,
          redeemedName: user.name,
          redeemedEmail: user.email,
        })
        .from(codes)
        .leftJoin(user, eq(user.id, codes.redeemedByUserId))
        .where(eq(codes.productId, 'club'))
        .orderBy(desc(codes.createdAt), desc(codes.id))
        .limit(30),
    ]);

  return {
    checkedAt: now.toISOString(),
    stats: {
      users: users[0].value,
      activeMembers: activeMembers[0].value,
      pendingCodes: pendingCodes[0].value,
      linkedUsers: linkedUsers[0].value,
    },
    codes: recentCodes.map((code) => ({
      id: code.id,
      codePrefix: code.codePrefix,
      label: code.label,
      source: code.source,
      durationDays: code.durationDays,
      state: membershipCodeState(code, now),
      createdAt: code.createdAt.toISOString(),
      redeemedAt: code.redeemedAt?.toISOString() ?? null,
      redeemedName: code.redeemedName,
      redeemedEmail: code.redeemedEmail,
    })),
  };
}

export type AdminMembershipOverview = Awaited<
  ReturnType<typeof getAdminMembershipOverview>
>;
