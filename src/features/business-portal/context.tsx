import { createContext, useContext } from 'react';
import type { PortalListing } from '@/services/businessPortal';
import type { UserProfile } from '@/types';

export interface PortalContextValue {
  user: UserProfile;
  /** The listing the portal is currently showing. */
  listing: PortalListing;
  /** Every listing this account owns, newest first. */
  listings: PortalListing[];
  selectListing: (id: string) => void;
}

export const PortalContext = createContext<PortalContextValue | null>(null);

/** For screens that manage a listing. The layout only renders them once there is one. */
export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext);
  if (!value) throw new Error('This screen needs a business listing. Open it from the business portal.');
  return value;
}

/** For screens that also work before the first listing exists (onboarding, claiming). */
export const useOptionalPortal = (): PortalContextValue | null => useContext(PortalContext);
