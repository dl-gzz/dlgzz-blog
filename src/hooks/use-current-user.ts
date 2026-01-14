import { authClient } from '@/lib/auth-client';

export const useCurrentUser = () => {
  const { data: session, isPending } = authClient.useSession();

  // Return null if still loading
  if (isPending) {
    return null;
  }

  return session?.user ?? null;
};
