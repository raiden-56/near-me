import { seeded } from '@/lib/utils';
import type { DailyPoint } from '@/services/analytics';
import type { Insights } from '@/services/businessPortal';
import type { AnalyticsKind } from '@/types';

export type Metric = 'impression' | 'view' | 'direction' | 'call' | 'save';

export interface MetricMeta {
  key: Metric;
  label: string;
  description: string;
  /** Chart colour. The colour belongs to the metric and never changes with what else is on screen. */
  color: string;
}

export const METRICS: Record<Metric, MetricMeta> = {
  impression: { key: 'impression', label: 'Search impressions', description: 'Times your listing appeared in search results and lists.', color: 'var(--ink)' },
  view: { key: 'view', label: 'Views', description: 'Times someone opened your listing.', color: '#E97845' },
  direction: { key: 'direction', label: 'Direction requests', description: 'Times someone asked for directions to you.', color: '#5E8767' },
  call: { key: 'call', label: 'Calls', description: 'Times someone tapped your phone number.', color: '#C49A1F' },
  save: { key: 'save', label: 'Saves', description: 'Times someone saved your listing.', color: '#A56A4B' },
};

export const METRIC_ORDER: readonly Metric[] = ['view', 'impression', 'direction', 'call', 'save'];

export type SeriesPoint = Record<Metric, number> & { label: string };

const WEEKDAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

/**
 * Calendar day of point `index` in a series of `days` points that ends today.
 * Derived from the position rather than the point's `date` string, which is written in UTC
 * and so can name the previous day for time zones ahead of it.
 */
export function dayAt(index: number, days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1 - index));
  return d;
}

const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const localKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Deterministic example figures for a listing with nothing tracked yet. Each day's numbers depend
 * only on the listing and the date, so every screen and every period shows the same example.
 * Callers must label the result as sample data.
 */
export function sampleInsights(seedKey: string, days: number): Insights {
  const totals: Record<AnalyticsKind, number> = { view: 0, impression: 0, direction: 0, call: 0, save: 0, share: 0, website: 0 };
  const daily: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = dayAt(i, days);
    const rand = seeded(`${seedKey}:${localKey(d)}`);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const busy = (weekend ? 1.35 : 1) * (0.75 + rand() * 0.5);
    const impression = Math.round(64 * busy);
    const view = Math.round(impression * (0.24 + rand() * 0.12));
    const direction = Math.round(view * (0.2 + rand() * 0.14));
    const call = Math.round(view * (0.08 + rand() * 0.1));
    const save = Math.round(view * (0.05 + rand() * 0.08));
    daily.push({ date: localKey(d), label: dayLabel(d), view, impression, direction, call, save });
    totals.view += view;
    totals.impression += impression;
    totals.direction += direction;
    totals.call += call;
    totals.save += save;
  }
  return { days, totals, daily, hasData: true };
}

/** Daily points for short periods, weekly totals for long ones, so the chart never turns into a comb. */
export function toSeries(daily: DailyPoint[]): { points: SeriesPoint[]; unit: 'day' | 'week' } {
  const days = daily.length;
  if (days <= 31) {
    return { unit: 'day', points: daily.map((p, i) => ({ label: dayLabel(dayAt(i, days)), view: p.view, impression: p.impression, direction: p.direction, call: p.call, save: p.save })) };
  }
  const points: SeriesPoint[] = [];
  // Weeks are counted back from today, so the last bar is always the most recent seven days.
  for (let end = days; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    const point: SeriesPoint = { label: dayLabel(dayAt(start, days)), view: 0, impression: 0, direction: 0, call: 0, save: 0 };
    for (const p of daily.slice(start, end)) {
      point.view += p.view;
      point.impression += p.impression;
      point.direction += p.direction;
      point.call += p.call;
      point.save += p.save;
    }
    points.unshift(point);
  }
  return { unit: 'week', points };
}

export interface WeekdayPoint {
  label: string;
  full: string;
  /** Average interactions (views, directions, calls and saves) on this weekday. */
  value: number;
}

export function weekdayAverages(daily: DailyPoint[]): WeekdayPoint[] {
  const days = daily.length;
  const sum = Array.from({ length: 7 }, () => 0);
  const count = Array.from({ length: 7 }, () => 0);
  daily.forEach((p, i) => {
    const weekday = (dayAt(i, days).getDay() + 6) % 7;
    sum[weekday] = sum[weekday]! + p.view + p.direction + p.call + p.save;
    count[weekday] = count[weekday]! + 1;
  });
  return WEEKDAYS.map((d, i) => ({ label: d.short, full: d.full, value: count[i] ? Math.round((sum[i]! / count[i]!) * 10) / 10 : 0 }));
}

const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** Share of people who took the next step. Null when there is nothing to divide by. */
export function conversion(totals: Record<AnalyticsKind, number>) {
  return {
    viewRate: ratio(totals.view, totals.impression),
    directionRate: ratio(totals.direction, totals.view),
    callRate: ratio(totals.call, totals.view),
    saveRate: ratio(totals.save, totals.view),
  };
}

export const formatRate = (rate: number | null): string => {
  if (rate == null) return 'No data';
  const pct = Math.min(rate, 9.99) * 100;
  return `${pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
};
