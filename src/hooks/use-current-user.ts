import { authClient } from '@/lib/auth-client';

export const useCurrentUser = () => {
  const { data: session, error, isPending } = authClient.useSession();

  // Log error only if it's meaningful (not empty object)
  if (error && Object.keys(error).length > 0) {
    console.error('useCurrentUser, error:', error);
  }

  // Return null if still loading or has error
  if (isPending || error) {
    return null;
  }

  return session?.user ?? null;
};
