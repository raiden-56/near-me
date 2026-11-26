import { useCallback } from 'react';
import { useAuth } from '@/store/auth';
import { useUi } from '@/store/ui';
import type { UserProfile } from '@/types';

/**
 * Browsing never needs an account. Actions that do (reviews, live updates, claims …) go through
 * this hook: signed-in users proceed immediately, guests see the sign-in sheet and then continue.
 */
export function useRequireAuth() {
  const requireAuth = useUi((s) => s.requireAuth);
  return useCallback(
    (reason: string, action: (user: UserProfile) => void) => {
      const user = useAuth.getState().user;
      if (user) return action(user);
      requireAuth(reason, () => {
        const signedIn = useAuth.getState().user;
        if (signedIn) action(signedIn);
      });
    },
    [requireAuth],
  );
}
