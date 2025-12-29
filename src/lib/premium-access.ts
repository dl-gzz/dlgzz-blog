import { getSession } from '@/lib/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Check if the current user has access to premium content
 *
 * 自动化检查逻辑：
 * - 订阅类型（月付/年付）：检查 status='active' 且 periodEnd > 当前时间
 * - 过期的订阅会自动被排除，无需手动处理
 *
 * @returns true if user is authenticated and has a valid non-expired subscription
 */
export async function hasAccessToPremiumContent(): Promise<boolean> {
  try {
    // Get current session
    const session = await getSession();

    // Not logged in = no access
    if (!session?.user?.id) {
      return false;
    }

    // Get database connection
    const db = await getDb();

    // Check if user has any payments
    const userPayments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, session.user.id));

    if (userPayments.length === 0) {
      return false;
    }

    const now = new Date();

    // Check if user has any valid subscription
    const hasValidPayment = userPayments.some((p) => {
      // Only check subscriptions with 'active' status
      if (p.type !== 'subscription' || p.status !== 'active') {
        return false;
      }

      // Subscription must have periodEnd set
      if (!p.periodEnd) {
        console.warn(`Subscription payment ${p.id} has no periodEnd set`);
        return false;
      }

      // ⭐ 核心检查：订阅是否已过期
      const isNotExpired = p.periodEnd > now;

      if (!isNotExpired) {
        console.log(`Subscription expired for user ${session.user.id}, periodEnd: ${p.periodEnd}, now: ${now}`);
      }

      return isNotExpired; // ✅ 订阅有效且未过期
    });

    return hasValidPayment;
  } catch (error) {
    console.error('Error checking premium access:', error);
    return false;
  }
}

/**
 * Check if a specific user has premium access (by user ID)
 *
 * 自动化检查逻辑：
 * - 订阅类型（月付/年付）：检查 status='active' 且 periodEnd > 当前时间
 * - 过期的订阅会自动被排除，无需手动处理
 *
 * @param userId User ID to check
 * @returns true if user has a valid non-expired subscription
 */
export async function userHasPremiumAccess(userId: string): Promise<boolean> {
  try {
    const db = await getDb();

    const userPayments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, userId));

    if (userPayments.length === 0) {
      return false;
    }

    const now = new Date();

    return userPayments.some((p) => {
      // Only check subscriptions with 'active' status
      if (p.type !== 'subscription' || p.status !== 'active') {
        return false;
      }

      // Subscription must have periodEnd set
      if (!p.periodEnd) {
        console.warn(`Subscription payment ${p.id} has no periodEnd set`);
        return false;
      }

      // ⭐ 核心检查：订阅是否已过期
      const isNotExpired = p.periodEnd > now;

      if (!isNotExpired) {
        console.log(`Subscription expired for user ${userId}, periodEnd: ${p.periodEnd}, now: ${now}`);
      }

      return isNotExpired; // ✅ 订阅有效且未过期
    });
  } catch (error) {
    console.error('Error checking user premium access:', error);
    return false;
  }
}
