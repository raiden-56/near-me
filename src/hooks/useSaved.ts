import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { analyticsService } from '@/services/analytics';
import { useLocalDb } from '@/services/backend/localDb';
import { savedService } from '@/services/saved';
import type { Place } from '@/types';

export const useIsSaved = (placeId: string) => useLocalDb((s) => Boolean(s.saved[placeId]));

export function useToggleSaved(place: Place, onSaved?: () => void) {
  const qc = useQueryClient();
  return useCallback(async () => {
    try {
      const saved = await savedService.toggle(place);
      if (saved) {
        analyticsService.track(place.id, 'save');
        toast.success('Saved', { description: `${place.name} is in your saved places.`, action: onSaved ? { label: 'Add to collection', onClick: onSaved } : undefined });
      } else {
        toast('Removed from saved', { description: place.name });
      }
      void qc.invalidateQueries({ queryKey: ['saved'] });
      void qc.invalidateQueries({ queryKey: ['collections'] });
    } catch {
      toast.error('Could not update your saved places.');
    }
  }, [place, qc, onSaved]);
}

export function useSavedPlaces() {
  const version = useLocalDb((s) => s.saved);
  return useQuery({ queryKey: ['saved', Object.keys(version).length], queryFn: () => savedService.list(), staleTime: 0 });
}

export function useCollections() {
  const collections = useLocalDb((s) => s.collections);
  return useQuery({ queryKey: ['collections', collections], queryFn: () => savedService.collections(), staleTime: 0 });
}
