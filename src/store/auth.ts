import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@/types';
import { idbStorage } from './persist';

interface AuthState {
  user: UserProfile | null;
  ready: boolean;
  setUser: (user: UserProfile | null) => void;
  patchUser: (patch: Partial<UserProfile>) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      ready: false,
      setUser: (user) => set({ user }),
      patchUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
    }),
    {
      name: 'nearme-session',
      storage: idbStorage(),
      version: 1,
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => () => {
        useAuth.setState({ ready: true });
      },
    },
  ),
);

export const currentUser = () => useAuth.getState().user;
