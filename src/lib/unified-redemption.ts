import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { membershipEntitlement, oneworkEntitlement, user } from '@/db/schema';
import {
  CLUB_MEMBERSHIP_PRODUCT,
  getMembershipStatus,
  redeemMembershipActivationCode,
} from '@/lib/membership';
import { redeemOneWorkActivation } from '@/lib/onework-access';
import { ALL_PACKS_GRANT } from '@/lib/onework-constants';
import { extendMembershipExpiry } from '@/lib/membership-expiry';
import { and, eq } from 'drizzle-orm';

/** One public redemption contract. Both rights and code consumption roll back together. */
export async function redeemUnifiedMembership({
  userId,
  code,
}: { userId: string; code: string }) {
  const db = await getDb();
  const rawCode = code.trim().toUpperCase();
  const result = await db.transaction(async (tx) => {
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('update')
      .limit(1);
    const now = new Date();
    if (rawCode.startsWith('MEM-')) {
      const [existing] = await tx
        .select()
        .from(oneworkEntitlement)
        .where(
          and(
            eq(oneworkEntitlement.userId, userId),
            eq(oneworkEntitlement.knowledgePackId, ALL_PACKS_GRANT)
          )
        )
        .limit(1);
      if (
        existing?.status === 'active' &&
        (!existing.expiresAt || existing.expiresAt > now)
      ) {
        const [club] = await tx
          .select()
          .from(membershipEntitlement)
          .where(
            and(
              eq(membershipEntitlement.userId, userId),
              eq(membershipEntitlement.productId, CLUB_MEMBERSHIP_PRODUCT)
            )
          )
          .limit(1);
        const baseExpiry = laterExpiry(
          club?.status === 'active' ? club.expiresAt : undefined,
          existing.expiresAt
        );
        await tx
          .insert(membershipEntitlement)
          .values({
            id: 'membership_' + randomUUID(),
            userId,
            productId: CLUB_MEMBERSHIP_PRODUCT,
            level: 'member',
            source: existing.source,
            status: 'active',
            expiresAt: baseExpiry,
          })
          .onConflictDoUpdate({
            target: [
              membershipEntitlement.userId,
              membershipEntitlement.productId,
            ],
            set: { status: 'active', expiresAt: baseExpiry, updatedAt: now },
          });
      }
      const granted = await redeemMembershipActivationCode({
        userId,
        code: rawCode,
        database: tx,
      });
      const configured = Number(process.env.ONEWORK_MONTHLY_QUOTA || 1000);
      const monthlyQuota = Math.max(
        existing?.monthlyQuota || 0,
        Number.isInteger(configured) && configured > 0 ? configured : 1000
      );
      const expiresAt = laterExpiry(
        existing?.status === 'active' ? existing.expiresAt : undefined,
        granted.expiresAt
      );
      await tx
        .insert(oneworkEntitlement)
        .values({
          id: 'entitlement_' + randomUUID(),
          userId,
          knowledgePackId: ALL_PACKS_GRANT,
          source: granted.source,
          status: 'active',
          monthlyQuota,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            oneworkEntitlement.userId,
            oneworkEntitlement.knowledgePackId,
          ],
          set: { status: 'active', monthlyQuota, expiresAt, updatedAt: now },
        });
      // If this account already had a longer unified AI membership, preserve
      // that deadline in both views instead of shortening it on redemption.
      await tx
        .update(membershipEntitlement)
        .set({ expiresAt, updatedAt: now })
        .where(
          and(
            eq(membershipEntitlement.userId, userId),
            eq(membershipEntitlement.productId, CLUB_MEMBERSHIP_PRODUCT)
          )
        );
      return { packs: [ALL_PACKS_GRANT], monthlyQuota };
    }
    const granted = await redeemOneWorkActivation({
      userId,
      code: rawCode,
      database: tx,
    });
    const rows = await tx
      .select()
      .from(oneworkEntitlement)
      .where(eq(oneworkEntitlement.userId, userId));
    const grantedRows = rows.filter(
      (row) =>
        granted.packIds.includes(row.knowledgePackId) && row.status === 'active'
    );
    const [existing] = await tx
      .select()
      .from(membershipEntitlement)
      .where(
        and(
          eq(membershipEntitlement.userId, userId),
          eq(membershipEntitlement.productId, CLUB_MEMBERSHIP_PRODUCT)
        )
      )
      .limit(1);
    let expiresAt: Date | null = granted.expiresAt;
    for (const row of grantedRows)
      expiresAt = laterExpiry(row.expiresAt, expiresAt);
    expiresAt = laterExpiry(
      expiresAt,
      extendMembershipExpiry(
        existing?.status === 'active' ? existing.expiresAt : undefined,
        granted.trialDays,
        now
      )
    );
    await tx
      .insert(membershipEntitlement)
      .values({
        id: 'membership_' + randomUUID(),
        userId,
        productId: CLUB_MEMBERSHIP_PRODUCT,
        level: 'member',
        source: 'activation',
        status: 'active',
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [membershipEntitlement.userId, membershipEntitlement.productId],
        set: { status: 'active', expiresAt, updatedAt: now },
      });
    for (const row of grantedRows)
      await tx
        .update(oneworkEntitlement)
        .set({ expiresAt, updatedAt: now })
        .where(eq(oneworkEntitlement.id, row.id));
    // Legacy codes retain their purchased pack scope; do not widen old grants.
    return { packs: granted.packIds, monthlyQuota: granted.monthlyQuota };
  });
  return { ...result, ...(await getMembershipStatus(userId)) };
}

function laterExpiry(
  existing: Date | null | undefined,
  requested: Date | null
) {
  if (existing === null || requested === null) return null;
  return existing && existing > requested ? existing : requested;
}
