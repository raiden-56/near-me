import { create } from 'zustand';
import type { Place, ReportType } from '@/types';

interface UiState {
  /** Sign-in sheet shown when a guest tries something that needs an account. */
  authGate: { open: boolean; reason: string; onDone?: () => void };
  reportComposer: { open: boolean; place?: Place; type?: ReportType };
  locationPicker: boolean;
  online: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  requireAuth: (reason: string, onDone?: () => void) => void;
  closeAuthGate: () => void;
  openReport: (place?: Place, type?: ReportType) => void;
  closeReport: () => void;
  setLocationPicker: (open: boolean) => void;
  setOnline: (online: boolean) => void;
  setInstallEvent: (e: BeforeInstallPromptEvent | null) => void;
}

export const useUi = create<UiState>((set) => ({
  authGate: { open: false, reason: '' },
  reportComposer: { open: false },
  locationPicker: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  installEvent: null,
  requireAuth: (reason, onDone) => set({ authGate: { open: true, reason, onDone } }),
  closeAuthGate: () => set((s) => ({ authGate: { ...s.authGate, open: false } })),
  openReport: (place, type) => set({ reportComposer: { open: true, place, type } }),
  closeReport: () => set((s) => ({ reportComposer: { ...s.reportComposer, open: false } })),
  setLocationPicker: (open) => set({ locationPicker: open }),
  setOnline: (online) => set({ online }),
  setInstallEvent: (installEvent) => set({ installEvent }),
}));
