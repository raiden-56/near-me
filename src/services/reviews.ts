import { sampleReviews } from '@/data/sample/reviews';
import { sampleStats } from '@/data/sample/stats';
import { reviewSchema, type ReviewInput } from '@/lib/schemas';
import { uid } from '@/lib/utils';
import type { Place, PlaceStats, Review, UserProfile } from '@/types';
import { localDb, toggle, type LocalDbState } from './backend/localDb';
import { contributionsService } from './contributions';
import { moderationService } from './moderation';

export interface ReviewSummary {
  average: number | null;
  count: number;
  /** Index 0 = 1 star … index 4 = 5 stars, counted over the reviews that are listed. */
  histogram: number[];
  aspects: { name: string; average: number }[];
}

function withOverlay(review: Review): Review {
  if (!review.isSample) return review;
  const o = localDb.overlay(review.id);
  return o.helpful.length || o.flagged.length ? { ...review, helpful: [...review.helpful, ...o.helpful], flagged: o.flagged } : review;
}

const visibleUserReviews = (s: LocalDbState, placeId: string) => s.reviews.filter((r) => r.placeId === placeId && r.moderation === 'visible');

/** Rating shown on cards: real reviews, blended with labelled sample figures when sample data is on. */
export function computeStats(place: Place, userReviews: Review[], sample: boolean): PlaceStats {
  const base = sample ? sampleStats(place) : { rating: null, reviewCount: 0, priceLevel: null, isSample: false };
  const mine = userReviews.filter((r) => r.placeId === place.id && r.moderation === 'visible');
  if (!mine.length) return base;
  const sum = mine.reduce((n, r) => n + r.rating, 0) + (base.rating ?? 0) * base.reviewCount;
  const count = mine.length + (base.rating ? base.reviewCount : 0);
  return { rating: Math.round((sum / count) * 10) / 10, reviewCount: count, priceLevel: base.priceLevel, isSample: base.isSample && Boolean(base.rating) };
}

export const reviewsService = {
  async listForPlace(place: Place, sample: boolean): Promise<Review[]> {
    await localDb.ready();
    const s = localDb.get();
    const real = visibleUserReviews(s, place.id);
    const samples = sample ? sampleReviews(place).filter((r) => !s.hiddenIds.includes(r.id)).map(withOverlay) : [];
    return [...real.sort((a, b) => b.createdAt - a.createdAt), ...samples];
  },

  summarize(reviews: Review[]): ReviewSummary {
    const histogram = [0, 0, 0, 0, 0];
    const aspectSum = new Map<string, { sum: number; n: number }>();
    for (const r of reviews) {
      histogram[Math.max(1, Math.min(5, Math.round(r.rating))) - 1]!++;
      for (const [name, v] of Object.entries(r.aspects)) {
        const cur = aspectSum.get(name) ?? { sum: 0, n: 0 };
        aspectSum.set(name, { sum: cur.sum + v, n: cur.n + 1 });
      }
    }
    const count = reviews.length;
    return {
      average: count ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : null,
      count,
      histogram,
      aspects: [...aspectSum.entries()].map(([name, { sum, n }]) => ({ name, average: Math.round((sum / n) * 10) / 10 })),
    };
  },

  async listByUser(userId: string): Promise<Review[]> {
    await localDb.ready();
    return localDb.get().reviews.filter((r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  },

  async mine(placeId: string, userId: string): Promise<Review | null> {
    await localDb.ready();
    return localDb.get().reviews.find((r) => r.placeId === placeId && r.userId === userId) ?? null;
  },

  /** Create or update. One review per person per place: posting again edits the existing one. */
  async save(user: UserProfile, place: Place, input: ReviewInput): Promise<{ review: Review; created: boolean }> {
    const data = reviewSchema.parse(input);
    await localDb.ready();
    const existing = localDb.get().reviews.find((r) => r.placeId === place.id && r.userId === user.id);
    const level = contributionsService.summarySync(user.id).level.name;

    if (existing) {
      const review: Review = { ...existing, ...data, userName: user.name, userLevel: level, updatedAt: Date.now() };
      localDb.set((s) => ({ reviews: s.reviews.map((r) => (r.id === existing.id ? review : r)) }));
      return { review, created: false };
    }

    const review: Review = {
      id: uid('review'),
      placeId: place.id,
      placeName: place.name,
      categoryId: place.categoryId,
      userId: user.id,
      userName: user.name,
      userLevel: level,
      ...data,
      createdAt: Date.now(),
      helpful: [],
      flagged: [],
      moderation: 'visible',
    };
    localDb.set((s) => ({ reviews: [review, ...s.reviews] }));
    await contributionsService.record(user, 'review', `Reviewed ${place.name}`, { refId: review.id, placeId: place.id, status: 'verified' });
    if (data.photos.length)
      await contributionsService.record(user, 'photo', `Added ${data.photos.length} photo${data.photos.length > 1 ? 's' : ''} to ${place.name}`, { refId: `${review.id}:photos`, placeId: place.id, status: 'verified' });
    return { review, created: true };
  },

  async remove(user: UserProfile, reviewId: string): Promise<void> {
    await localDb.ready();
    const review = localDb.get().reviews.find((r) => r.id === reviewId);
    if (!review) return;
    if (review.userId !== user.id && user.role !== 'admin') throw new Error('You can only delete your own reviews.');
    localDb.set((s) => ({ reviews: s.reviews.filter((r) => r.id !== reviewId) }));
    await contributionsService.removeByRef(review.userId, reviewId, 'review');
    await contributionsService.removeByRef(review.userId, `${reviewId}:photos`, 'photo');
  },

  async toggleHelpful(user: UserProfile, review: Review): Promise<void> {
    if (review.userId === user.id) throw new Error('You cannot mark your own review as helpful.');
    await localDb.ready();
    if (review.isSample) {
      const o = localDb.overlay(review.id);
      localDb.setOverlay(review.id, { ...o, helpful: toggle(o.helpful, user.id) });
      return;
    }
    localDb.set((s) => ({ reviews: s.reviews.map((r) => (r.id === review.id ? { ...r, helpful: toggle(r.helpful, user.id) } : r)) }));
  },

  async flag(user: UserProfile, review: Review, reason: string, note?: string): Promise<boolean> {
    await localDb.ready();
    if (review.isSample) {
      const o = localDb.overlay(review.id);
      if (!o.flagged.includes(user.id)) localDb.setOverlay(review.id, { ...o, flagged: [...o.flagged, user.id] });
    } else {
      localDb.set((s) => ({ reviews: s.reviews.map((r) => (r.id === review.id && !r.flagged.includes(user.id) ? { ...r, flagged: [...r.flagged, user.id] } : r)) }));
    }
    const { created } = await moderationService.flag(user, { type: 'review', id: review.id, label: `Review of ${review.placeName} by ${review.userName}` }, reason, note);
    return created;
  },

  /** Business owner reply. */
  async reply(owner: UserProfile, reviewId: string, text: string): Promise<void> {
    const body = text.trim();
    if (body.length < 3) throw new Error('Write a short reply first.');
    await localDb.ready();
    // Only the business that owns the reviewed place (or a moderator) may reply on its behalf.
    const s = localDb.get();
    const review = s.reviews.find((r) => r.id === reviewId);
    if (!review) throw new Error('That review no longer exists.');
    const owns = s.listings.some((l) => l.ownerId === owner.id && (l.placeId === review.placeId || `l_${l.id}` === review.placeId));
    if (!owns && owner.role !== 'admin') throw new Error('Only the business that owns this place can reply to its reviews.');
    localDb.set((s) => ({
      reviews: s.reviews.map((r) => (r.id === reviewId ? { ...r, reply: { text: body.slice(0, 600), at: Date.now(), by: owner.name } } : r)),
    }));
  },
};
