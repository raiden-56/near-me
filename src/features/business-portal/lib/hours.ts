import { parseOpeningHours } from '@/lib/openingHours';
import type { DayKey, WeekHours } from '@/types';

export const DAY_ORDER: readonly DayKey[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

export const DAY_LABEL: Record<DayKey, string> = {
  mo: 'Monday',
  tu: 'Tuesday',
  we: 'Wednesday',
  th: 'Thursday',
  fr: 'Friday',
  sa: 'Saturday',
  su: 'Sunday',
};

type DayHours = WeekHours[DayKey];

const week = (make: (day: DayKey) => DayHours): WeekHours => Object.fromEntries(DAY_ORDER.map((d) => [d, make(d)])) as WeekHours;

/** A new listing has no hours yet: every day closed, so nothing is claimed that the owner did not enter. */
export const closedWeek = (): WeekHours => week(() => ({ closed: true, open: '09:00', close: '21:00' }));

/** Starting point offered in the editor when no hours have been set. Never saved until the owner confirms it. */
export const suggestedWeek = (): WeekHours => week((d) => ({ closed: d === 'su', open: '09:00', close: '21:00' }));

export const hasOpenDay = (hours: WeekHours): boolean => DAY_ORDER.some((d) => hours[d] && !hours[d].closed);

/** Open around the clock. Stored as 00:00–24:00, which is how OpenStreetMap writes it. */
export const isAllDay = (day: DayHours): boolean => !day.closed && day.open === '00:00' && day.close === '24:00';

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Convert an OpenStreetMap opening_hours value into the week editor's shape.
 * The editor holds one range per day, so a split day (lunch break) becomes first opening to last closing.
 * Returns null when the value cannot be understood, so the owner fills hours in by hand.
 */
export function hoursFromOsm(raw: string | undefined | null): WeekHours | null {
  const schedule = parseOpeningHours(raw);
  if (schedule === null) return null;
  if (schedule === 'always') return week(() => ({ closed: false, open: '00:00', close: '24:00' }));
  return week((d) => {
    const intervals = schedule[DAY_ORDER.indexOf(d)] ?? [];
    if (!intervals.length) return { closed: true, open: '09:00', close: '21:00' };
    const start = Math.min(...intervals.map(([s]) => s));
    const end = Math.max(...intervals.map(([, e]) => e));
    if (end - start >= 1440) return { closed: false, open: '00:00', close: '24:00' };
    return { closed: false, open: hhmm(start % 1440), close: end === 1440 ? '24:00' : hhmm(end % 1440) };
  });
}
