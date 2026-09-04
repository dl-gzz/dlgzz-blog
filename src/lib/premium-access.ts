import { getDb } from '@/db';
import { oneworkEntitlement, payment } from '@/db/schema';
import { hasActiveMembership } from '@/lib/membership';
import { getSession } from '@/lib/server';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

/**
 * 检查指定用户是否拥有有效的付费订阅
 *
 * 自动化检查逻辑：
 * - 订阅类型（月付/年付）：检查 status='active' 且 periodEnd > 当前时间
 * - 过期的订阅会自动被排除，无需手动处理
 *
 * @param userId 要检查的用户 ID
 * @returns true 表示用户拥有有效且未过期的订阅
 */
export async function userHasPremiumAccess(userId: string): Promise<boolean> {
  try {
    const db = await getDb();

    const now = new Date();
    const [membershipAccess, userPayments, oneWorkRows] = await Promise.all([
      hasActiveMembership(userId),
      db.select().from(payment).where(eq(payment.userId, userId)),
      db
        .select({ id: oneworkEntitlement.id })
        .from(oneworkEntitlement)
        .where(
          and(
            eq(oneworkEntitlement.userId, userId),
            eq(oneworkEntitlement.status, 'active'),
            or(
              isNull(oneworkEntitlement.expiresAt),
              gt(oneworkEntitlement.expiresAt, now)
            )
          )
        )
        .limit(1),
    ]);

    if (membershipAccess || oneWorkRows.length > 0) {
      return true;
    }

    return userPayments.some((p) => {
      if (
        p.type !== 'subscription' ||
        (p.status !== 'active' && p.status !== 'completed')
      ) {
        return false;
      }

      if (!p.periodEnd) {
        return false;
      }

      return p.periodEnd > now;
    });
  } catch {
    return false;
  }
}

/**
 * 检查当前登录用户是否拥有付费内容访问权限
 *
 * @returns true 表示用户已登录且拥有有效订阅
 */
export async function hasAccessToPremiumContent(): Promise<boolean> {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return false;
    }

    return userHasPremiumAccess(session.user.id);
  } catch {
    return false;
  }
}
