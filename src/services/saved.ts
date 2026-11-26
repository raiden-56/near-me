import { placeStore } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { collectionSchema } from '@/lib/schemas';
import { uid } from '@/lib/utils';
import type { Collection, Place, SavedPlace, Tone } from '@/types';
import { localDb } from './backend/localDb';

const STARTERS: { name: string; description: string; icon: string; tone: Tone }[] = [
  { name: 'Favorite Restaurants', description: 'The places you keep going back to', icon: 'UtensilsCrossed', tone: 'brand' },
  { name: 'Weekend Places', description: 'For slow Saturdays and Sundays', icon: 'Sun', tone: 'butter' },
  { name: 'Places to Visit', description: 'On the list, not yet ticked off', icon: 'MapPinned', tone: 'sage' },
  { name: 'Emergency Services', description: 'Hospitals, pharmacies and help nearby', icon: 'Siren', tone: 'danger' },
  { name: 'My Neighborhood', description: 'Everyday spots close to home', icon: 'House', tone: 'clay' },
];

export const COLLECTION_ICONS = ['Heart', 'UtensilsCrossed', 'Coffee', 'Sun', 'MapPinned', 'Siren', 'House', 'Dumbbell', 'ShoppingBag', 'Trees', 'Camera', 'Wrench'];
export const COLLECTION_TONES: Tone[] = ['brand', 'sage', 'butter', 'clay', 'success', 'danger', 'forest', 'sand'];

export const savedService = {
  async ensureStarters(): Promise<void> {
    await localDb.ready();
    if (localDb.get().collections.length) return;
    const now = Date.now();
    localDb.set({
      collections: STARTERS.map((s, i) => ({ id: uid('col'), ...s, placeIds: [], createdAt: now + i, updatedAt: now + i, starter: true })),
    });
  },

  async list(): Promise<SavedPlace[]> {
    await localDb.ready();
    return Object.values(localDb.get().saved).sort((a, b) => b.savedAt - a.savedAt);
  },

  /** Save or unsave. A snapshot of the place is kept so it stays readable offline. */
  async toggle(place: Place): Promise<boolean> {
    await localDb.ready();
    const isSaved = Boolean(localDb.get().saved[place.id]);
    if (isSaved) {
      localDb.set((s) => {
        const { [place.id]: _removed, ...rest } = s.saved;
        return { saved: rest, collections: s.collections.map((c) => ({ ...c, placeIds: c.placeIds.filter((id) => id !== place.id) })) };
      });
      return false;
    }
    localDb.set((s) => ({ saved: { ...s.saved, [place.id]: { placeId: place.id, place, savedAt: Date.now() } } }));
    void placeStore.put(place);
    return true;
  },

  /** Keep the stored snapshot current when richer data for a saved place arrives. */
  async refreshSnapshot(place: Place): Promise<void> {
    await localDb.ready();
    const entry = localDb.get().saved[place.id];
    if (!entry || (entry.place.detail === 'full' && place.detail === 'basic')) return;
    localDb.set((s) => ({ saved: { ...s.saved, [place.id]: { ...entry, place } } }));
  },

  async setNote(placeId: string, note: string): Promise<void> {
    await localDb.ready();
    const entry = localDb.get().saved[placeId];
    if (!entry) return;
    localDb.set((s) => ({ saved: { ...s.saved, [placeId]: { ...entry, note: note.trim().slice(0, 200) || undefined } } }));
  },

  async collections(): Promise<Collection[]> {
    await this.ensureStarters();
    return [...localDb.get().collections].sort((a, b) => a.createdAt - b.createdAt);
  },

  async collection(id: string): Promise<Collection | null> {
    await localDb.ready();
    return localDb.get().collections.find((c) => c.id === id) ?? null;
  },

  async createCollection(input: { name: string; description?: string; icon?: string; tone?: Tone }): Promise<Collection> {
    const data = collectionSchema.parse(input);
    await localDb.ready();
    if (localDb.get().collections.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) throw new Error('You already have a collection with that name.');
    const now = Date.now();
    const collection: Collection = { id: uid('col'), name: data.name, description: data.description || undefined, icon: input.icon ?? 'Heart', tone: input.tone ?? 'brand', placeIds: [], createdAt: now, updatedAt: now };
    localDb.set((s) => ({ collections: [...s.collections, collection] }));
    return collection;
  },

  async updateCollection(id: string, patch: { name?: string; description?: string; icon?: string; tone?: Tone }): Promise<void> {
    await localDb.ready();
    if (patch.name != null) {
      const { name } = collectionSchema.pick({ name: true }).parse({ name: patch.name });
      if (localDb.get().collections.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw new Error('You already have a collection with that name.');
      patch = { ...patch, name };
    }
    localDb.set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)) }));
  },

  async deleteCollection(id: string): Promise<void> {
    await localDb.ready();
    localDb.set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
  },

  /** Add or remove a place from a collection. Adding also saves the place. */
  async toggleInCollection(collectionId: string, place: Place): Promise<boolean> {
    await localDb.ready();
    const col = localDb.get().collections.find((c) => c.id === collectionId);
    if (!col) throw new Error('That collection no longer exists.');
    const has = col.placeIds.includes(place.id);
    if (!has && !localDb.get().saved[place.id]) await this.toggle(place);
    localDb.set((s) => ({
      collections: s.collections.map((c) =>
        c.id === collectionId ? { ...c, placeIds: has ? c.placeIds.filter((id) => id !== place.id) : [...c.placeIds, place.id], updatedAt: Date.now() } : c,
      ),
    }));
    return !has;
  },

  /** Plain-text version of a collection for the share sheet. */
  shareText(collection: Collection, places: Place[]): string {
    const lines = places.map((p, i) => `${i + 1}. ${p.name}${p.address ? `, ${p.address}` : ''}\n   ${appUrl(`/place/${p.id}`)}`);
    return `${collection.name} — a NearMe collection\n\n${lines.join('\n')}`;
  },
};
