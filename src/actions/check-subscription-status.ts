'use server';

import { getSession } from '@/lib/server';
import { getSubscriptions } from '@/payment';
import { getLifetimeStatusAction } from '@/actions/get-lifetime-status';
import { createSafeActionClient } from 'next-safe-action';
import { z } from 'zod';

// Create a safe action client
const actionClient = createSafeActionClient();

const checkSubscriptionSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Check if user has an active subscription or lifetime access
 */
export const checkSubscriptionStatusAction = actionClient
  .schema(checkSubscriptionSchema)
  .action(async ({ parsedInput }) => {
    const { userId } = parsedInput;
    
    try {
      // Get current session to verify authorization
      const session = await getSession();
      
      if (!session?.user?.id) {
        return {
          success: false,
          error: 'Unauthorized request to check subscription status',
          hasAccess: false,
        };
      }

      // Only allow users to check their own subscription status
      if (session.user.id !== userId) {
        return {
          success: false,
          error: `Current user ${session.user.id} is not authorized to check subscription for user ${userId}`,
          hasAccess: false,
        };
      }

      // Check if user is a lifetime member
      const lifetimeResult = await getLifetimeStatusAction({ userId });
      if (lifetimeResult?.data?.success && lifetimeResult.data.isLifetimeMember) {
        return {
          success: true,
          hasAccess: true,
          isLifetime: true,
          subscriptionStatus: null,
        };
      }

      // Check for active subscription
      const subscriptions = await getSubscriptions({ userId });
      
      if (subscriptions && subscriptions.length > 0) {
        // Find the most recent active subscription
        const activeSubscription = subscriptions.find(
          (sub) => sub.status === 'active' || sub.status === 'trialing' || sub.status === 'completed'
        );

        if (activeSubscription) {
          // Check if subscription is still within valid period
          const now = new Date();
          const periodEnd = activeSubscription.currentPeriodEnd;
          
          if (periodEnd && periodEnd > now) {
            return {
              success: true,
              hasAccess: true,
              isLifetime: false,
              subscriptionStatus: activeSubscription.status,
              periodEnd: periodEnd,
            };
          }
        }
      }

      // No active subscription found
      return {
        success: true,
        hasAccess: false,
        isLifetime: false,
        subscriptionStatus: null,
      };

    } catch (error) {
      console.error('Check subscription status error:', error);
      return {
        success: false,
        error: 'Failed to check subscription status',
        hasAccess: false,
      };
    }
  }); 