import { suggestionSchema } from '@/lib/schemas';
import { uid } from '@/lib/utils';
import type { ContributionKind, PlaceSuggestion, UserProfile } from '@/types';
import { localDb } from './backend/localDb';
import { contributionsService } from './contributions';

const CONTRIBUTION_KIND: Record<PlaceSuggestion['kind'], ContributionKind> = {
  add: 'place',
  edit: 'edit',
  closed: 'closed',
  missing: 'missing',
  category: 'category',
  photo: 'photo',
};

const TITLE: Record<PlaceSuggestion['kind'], (name: string) => string> = {
  add: (n) => `Added a place: ${n}`,
  edit: (n) => `Suggested an edit to ${n}`,
  closed: (n) => `Reported ${n} as closed`,
  missing: (n) => `Reported a missing place: ${n}`,
  category: (n) => `Suggested a category: ${n}`,
  photo: (n) => `Added photos to ${n}`,
};

export const contributeService = {
  /**
   * Submit a place contribution. Everything lands in the moderation queue as "pending";
   * points are only awarded once a moderator approves it.
   */
  async submit(
    user: UserProfile,
    input: { kind: PlaceSuggestion['kind']; name: string; details: string; categoryId?: string; placeId?: string; lat?: number; lon?: number; photos?: string[] },
  ): Promise<PlaceSuggestion> {
    const data = suggestionSchema.parse({ name: input.name, categoryId: input.categoryId, details: input.details });
    await localDb.ready();

    // The same person reporting the same thing about the same place twice is one contribution.
    const duplicate = localDb
      .get()
      .suggestions.find((s) => s.userId === user.id && s.kind === input.kind && s.status === 'pending' && (input.placeId ? s.placeId === input.placeId : s.name.toLowerCase() === data.name.toLowerCase()));
    if (duplicate) throw new Error('You have already sent this. It is waiting for review.');

    const suggestion: PlaceSuggestion = {
      id: uid('sugg'),
      kind: input.kind,
      placeId: input.placeId,
      name: data.name,
      categoryId: data.categoryId || undefined,
      lat: input.lat,
      lon: input.lon,
      details: data.details,
      photos: input.photos?.slice(0, 4),
      userId: user.id,
      userName: user.name,
      status: 'pending',
      createdAt: Date.now(),
    };
    localDb.set((s) => ({ suggestions: [suggestion, ...s.suggestions] }));
    await contributionsService.record(user, CONTRIBUTION_KIND[input.kind], TITLE[input.kind](data.name), { refId: suggestion.id, placeId: input.placeId, status: 'pending' });
    return suggestion;
  },

  async mine(userId: string): Promise<PlaceSuggestion[]> {
    await localDb.ready();
    return localDb.get().suggestions.filter((s) => s.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  },
};
