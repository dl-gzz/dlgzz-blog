'use client';

import { checkSubscriptionStatusAction } from '@/actions/check-subscription-status';
import { authClient } from '@/lib/auth-client';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useState } from 'react';
import type { PaymentStatus } from '@/payment/types';

interface SubscriptionStatus {
  hasAccess: boolean;
  isLifetime: boolean;
  subscriptionStatus: PaymentStatus | null;
  periodEnd?: Date;
  isLoading: boolean;
  error?: string;
}

/**
 * Hook to check user's subscription access to premium features
 */
export function useSubscriptionAccess() {
  const [status, setStatus] = useState<SubscriptionStatus>({
    hasAccess: false,
    isLifetime: false,
    subscriptionStatus: null,
    isLoading: true,
  });

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const { execute, isExecuting, result } = useAction(checkSubscriptionStatusAction);

  // Check subscription status when user ID is available
  useEffect(() => {
    if (userId) {
      execute({ userId });
    } else {
      setStatus({
        hasAccess: false,
        isLifetime: false,
        subscriptionStatus: null,
        isLoading: false,
      });
    }
  }, [userId, execute]);

  // Update status when result changes
  useEffect(() => {
    if (result && result.data) {
      if (result.data.success) {
        setStatus({
          hasAccess: result.data.hasAccess,
          isLifetime: result.data.isLifetime || false,
          subscriptionStatus: result.data.subscriptionStatus || null,
          periodEnd: result.data.periodEnd ? new Date(result.data.periodEnd) : undefined,
          isLoading: false,
        });
      } else {
        setStatus({
          hasAccess: false,
          isLifetime: false,
          subscriptionStatus: null,
          isLoading: false,
          error: result.data.error,
        });
      }
    } else if (result?.serverError || result?.validationErrors) {
      setStatus({
        hasAccess: false,
        isLifetime: false,
        subscriptionStatus: null,
        isLoading: false,
        error: result.serverError || 'Validation error',
      });
    }
  }, [result]);

  // Set loading state when executing
  useEffect(() => {
    if (isExecuting) {
      setStatus(prev => ({ ...prev, isLoading: true }));
    }
  }, [isExecuting]);

  const refetch = () => {
    if (userId) {
      execute({ userId });
    }
  };

  return {
    ...status,
    refetch,
  };
} 