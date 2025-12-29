import { getSession } from '@/lib/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Check if the current user has access to premium content
 * @returns true if user is authenticated and has an active subscription
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

    // Check if user has any active/completed payments
    const userPayments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, session.user.id))
      .limit(1);

    // User has access if they have at least one payment record with 'active' or 'completed' status
    const hasValidPayment = userPayments.some(
      (p) => p.status === 'active' || p.status === 'completed'
    );

    return hasValidPayment;
  } catch (error) {
    console.error('Error checking premium access:', error);
    return false;
  }
}

/**
 * Check if a specific user has premium access (by user ID)
 * @param userId User ID to check
 * @returns true if user has an active subscription
 */
export async function userHasPremiumAccess(userId: string): Promise<boolean> {
  try {
    const db = await getDb();

    const userPayments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, userId))
      .limit(1);

    return userPayments.some(
      (p) => p.status === 'active' || p.status === 'completed'
    );
  } catch (error) {
    console.error('Error checking user premium access:', error);
    return false;
  }
}
