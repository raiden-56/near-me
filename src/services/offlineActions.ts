import type { ReportInput, ReviewInput } from '@/lib/schemas';
import type { LatLon, Place, UserProfile } from '@/types';
import { communityService } from './community';
import { outbox } from './outbox';
import { reviewsService } from './reviews';

/** Actions that may be taken offline. They run immediately when online and are queued otherwise. */

export interface ReportJob {
  user: UserProfile;
  input: ReportInput;
  place?: Place;
  location: LatLon;
  areaLabel: string;
  asBusiness?: boolean;
}

export interface ReviewJob {
  user: UserProfile;
  place: Place;
  input: ReviewInput;
}

outbox.register<ReportJob>('report.submit', (job) =>
  communityService.submit(job.user, job.input, { place: job.place, location: job.location, areaLabel: job.areaLabel, asBusiness: job.asBusiness }),
);
outbox.register<ReviewJob>('review.save', (job) => reviewsService.save(job.user, job.place, job.input));

export const submitReport = (job: ReportJob) => outbox.run('report.submit', `Update: ${job.input.title}`, job);
export const saveReview = (job: ReviewJob) => outbox.run('review.save', `Review of ${job.place.name}`, job);
