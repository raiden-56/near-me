import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PortalUiState {
  /** Which of the owner's listings the portal is showing. Only a preference: the service checks ownership. */
  activeListingId: string | null;
  setActiveListing: (id: string | null) => void;
}

/** Portal-only UI state. Small enough for localStorage, so the chosen listing survives a reload. */
export const usePortalUi = create<PortalUiState>()(
  persist(
    (set) => ({
      activeListingId: null,
      setActiveListing: (activeListingId) => set({ activeListingId }),
    }),
    { name: 'nearme-business-portal', version: 1 },
  ),
);
