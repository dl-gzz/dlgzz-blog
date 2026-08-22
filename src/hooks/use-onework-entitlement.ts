import { authClient } from '@/lib/auth-client';
import { useEffect, useState } from 'react';

type Entitlement = {
  status?: string;
  expiresAt?: string | null;
};

function hasActiveEntitlement(entitlements: Entitlement[]) {
  const now = Date.now();
  return entitlements.some((entitlement) => {
    if (entitlement.status !== 'active') return false;
    if (!entitlement.expiresAt) return true;
    const expiresAt = Date.parse(entitlement.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

/**
 * Reads the canonical OneWork membership state for UI decisions.
 * This is intentionally separate from the legacy website payment store.
 */
export function useOneWorkEntitlement() {
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const [hasActiveOneWorkEntitlement, setHasActiveOneWorkEntitlement] =
    useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (isSessionPending) return;

    if (!session?.user?.id) {
      setHasActiveOneWorkEntitlement(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch('/api/onework/entitlements', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(
            payload.error || 'Failed to load OneWork entitlement'
          );
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setHasActiveOneWorkEntitlement(
          hasActiveEntitlement(
            Array.isArray(payload.entitlements) ? payload.entitlements : []
          )
        );
      })
      .catch(() => {
        if (!cancelled) setHasActiveOneWorkEntitlement(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSessionPending, session?.user?.id]);

  return {
    hasActiveOneWorkEntitlement,
    isLoading: isSessionPending || isLoading,
  };
}
