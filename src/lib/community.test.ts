import { describe, expect, it } from 'vitest';
import type { AdminConfig, CommunityReport } from '@/types';
import { deriveReport, levelFor, POINTS, REPORT_TYPES, reportTypesForCategory } from './community';

const MIN = 60_000;
const NOW = 1_800_000_000_000;

const config: AdminConfig = {
  expiryMinutes: { queue: 20, wait_time: 30, parking: 20, traffic: 20, road: 60, availability: 45, service: 45, closure: 240, outage: 180, price: 720, event: 360 },
  minConfirmationsForVerified: 3,
  maxReportsPerHour: 6,
  disagreementsToHide: 4,
  disabledCategoryIds: [],
  featuredCategoryIds: [],
  dealsRequireApproval: false,
  eventsRequireApproval: true,
};

const report = (over: Partial<CommunityReport> = {}): CommunityReport => ({
  id: 'r1', type: 'queue', title: 'Queue: 4 vehicles', level: 'good', lat: 0, lon: 0, areaLabel: 'Area',
  createdAt: NOW - 2 * MIN, updatedAt: NOW - 2 * MIN, expiresAt: NOW + 18 * MIN,
  source: 'community', reporterId: 'u1', reporterName: 'A', reporterLevel: 'Explorer', reporterReputation: 40,
  confirmations: [], disagreements: [], helpful: [], flagged: [], moderation: 'visible', ...over,
});

describe('deriveReport', () => {
  it('treats a single uncorroborated report as unverified and low confidence', () => {
    const view = deriveReport(report(), config, NOW);
    expect(view.verification).toBe('unverified');
    expect(view.freshness).toBe('live');
    expect(view.confidence).toBeLessThan(0.45);
  });

  it('becomes community verified at the configured number of confirmations', () => {
    expect(deriveReport(report({ confirmations: ['a', 'b'] }), config, NOW).verification).toBe('unverified');
    const view = deriveReport(report({ confirmations: ['a', 'b', 'c'] }), config, NOW);
    expect(view.verification).toBe('community_verified');
    expect(view.confidence).toBeGreaterThan(deriveReport(report(), config, NOW).confidence);
  });

  it('marks business posts as business confirmed with high confidence', () => {
    const view = deriveReport(report({ source: 'business', reporterReputation: 90 }), config, NOW);
    expect(view.verification).toBe('business_confirmed');
    expect(view.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('is disputed when clearly more people disagree than agree, even for a business', () => {
    expect(deriveReport(report({ confirmations: ['a'], disagreements: ['x', 'y'] }), config, NOW).verification).toBe('disputed');
    expect(deriveReport(report({ source: 'business', disagreements: ['x', 'y'] }), config, NOW).verification).toBe('disputed');
    // One disagreement alone is not enough to label something disputed.
    expect(deriveReport(report({ disagreements: ['x'] }), config, NOW).verification).toBe('unverified');
  });

  it('ages from live to recent to expired, and never rates an expired report highly', () => {
    expect(deriveReport(report(), config, NOW).freshness).toBe('live');
    expect(deriveReport(report(), config, NOW + 12 * MIN).freshness).toBe('recent');
    const expired = deriveReport(report({ confirmations: ['a', 'b', 'c', 'd'] }), config, NOW + 30 * MIN);
    expect(expired.freshness).toBe('expired');
    expect(expired.confidence).toBeLessThan(0.3);
  });

  it('loses confidence as it gets older', () => {
    const fresh = deriveReport(report({ confirmations: ['a', 'b', 'c'] }), config, NOW).confidence;
    const older = deriveReport(report({ confirmations: ['a', 'b', 'c'] }), config, NOW + 15 * MIN).confidence;
    expect(older).toBeLessThan(fresh);
  });
});

describe('contribution levels', () => {
  it('moves through the four levels at their thresholds', () => {
    expect(levelFor(0).name).toBe('Explorer');
    expect(levelFor(49).name).toBe('Explorer');
    expect(levelFor(50).name).toBe('Local Scout');
    expect(levelFor(200).name).toBe('Neighborhood Expert');
    expect(levelFor(600).name).toBe('Community Hero');
  });

  it('reports progress towards the next level', () => {
    expect(levelFor(25)).toMatchObject({ next: 'Local Scout', toNext: 25, progress: 0.5 });
    expect(levelFor(5000)).toMatchObject({ next: null, progress: 1 });
  });

  it('rewards adding a place more than confirming an update', () => {
    expect(POINTS.place).toBeGreaterThan(POINTS.review);
    expect(POINTS.review).toBeGreaterThan(POINTS.confirm);
  });
});

describe('report types', () => {
  it('offers queue reports first for petrol pumps and wait times for restaurants', () => {
    expect(reportTypesForCategory('petrol-pumps')[0]).toBe('queue');
    expect(reportTypesForCategory('restaurants')[0]).toBe('wait_time');
    expect(reportTypesForCategory('parking')[0]).toBe('parking');
  });

  it('has an expiry policy for every report type', () => {
    for (const t of REPORT_TYPES) expect(config.expiryMinutes[t.type]).toBeGreaterThan(0);
  });
});
