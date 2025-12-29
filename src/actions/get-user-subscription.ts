'use server';

import { getSession } from '@/lib/server';
import { getDb } from '@/db';
import { payment } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAllPricePlans } from '@/payment/price';

export interface UserSubscription {
  planName: string;
  interval: 'month' | 'year';
  status: 'active' | 'expired';
  periodStart: Date;
  periodEnd: Date;
  daysRemaining: number;
  amount: number;
  currency: string;
  priceId: string;
}

/**
 * Get current user's active subscription details
 *
 * @returns User subscription details or null if no active subscription
 */
export async function getUserSubscription(): Promise<UserSubscription | null> {
  try {
    // Get current session
    const session = await getSession();

    if (!session?.user?.id) {
      return null;
    }

    // Get database connection
    const db = await getDb();

    // Get all user payments
    const userPayments = await db
      .select()
      .from(payment)
      .where(eq(payment.userId, session.user.id));

    if (userPayments.length === 0) {
      return null;
    }

    const now = new Date();

    // Find the most recent active subscription
    const activeSubscriptions = userPayments
      .filter((p) => {
        return (
          p.type === 'subscription' &&
          p.status === 'active' &&
          p.periodEnd &&
          p.periodEnd > now
        );
      })
      .sort((a, b) => {
        // Sort by periodEnd descending (latest expiry first)
        return b.periodEnd!.getTime() - a.periodEnd!.getTime();
      });

    if (activeSubscriptions.length === 0) {
      return null;
    }

    const subscription = activeSubscriptions[0];

    // Calculate days remaining
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.ceil(
      (subscription.periodEnd!.getTime() - now.getTime()) / msPerDay
    );

    // Get plan details
    const plans = getAllPricePlans();
    let planName = '独立工作者会员';

    // Find plan name from price ID
    for (const [, plan] of Object.entries(plans)) {
      if (plan.prices) {
        const priceEntry = Object.entries(plan.prices).find(
          ([, price]) => price.id === subscription.priceId
        );
        if (priceEntry) {
          planName = plan.name || planName;
          break;
        }
      }
    }

    return {
      planName,
      interval: (subscription.interval as 'month' | 'year') || 'month',
      status: 'active',
      periodStart: subscription.periodStart!,
      periodEnd: subscription.periodEnd!,
      daysRemaining,
      amount: subscription.amount || 0,
      currency: subscription.currency || 'CNY',
      priceId: subscription.priceId || '',
    };
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return null;
  }
}
