import type { OpenStatus } from '@/types';

/**
 * A pragmatic parser for the OpenStreetMap `opening_hours` syntax. It covers the patterns that
 * make up the vast majority of real values (24/7, day ranges, several time ranges, overnight
 * hours, "off") and deliberately returns null for anything it cannot represent, so the UI says
 * "Hours not listed" instead of guessing.
 */

type Interval = [start: number, end: number]; // minutes from midnight; end may pass 1440 (overnight)
export type WeekSchedule = Interval[][]; // index 0 = Monday

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const UNSUPPORTED = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|week|easter|sunrise|sunset|dawn|dusk|sh)\b|\[|\d{4}/i;

const cache = new Map<string, WeekSchedule | 'always' | null>();

function parseDays(sel: string): number[] | null {
  const out = new Set<number>();
  for (const part of sel.split(',')) {
    const p = part.trim().toLowerCase();
    if (!p) continue;
    const range = p.split('-').map((s) => s.trim());
    const a = DAYS.indexOf(range[0]!.slice(0, 2));
    if (a < 0) return null;
    if (range.length === 1) {
      out.add(a);
      continue;
    }
    const b = DAYS.indexOf(range[1]!.slice(0, 2));
    if (b < 0) return null;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return out.size ? [...out] : null;
}

function parseTimes(sel: string): Interval[] | null {
  const out: Interval[] = [];
  for (const part of sel.split(',')) {
    const m = part.trim().match(/^(\d{1,2})[:.](\d{2})\s*(?:-\s*(\d{1,2})[:.](\d{2})|(\+))?$/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = m[3] != null ? Number(m[3]) * 60 + Number(m[4]) : 1440;
    if (start > 1440 || end > 2880) return null;
    if (end <= start) end += 1440;
    out.push([start, end]);
  }
  return out.length ? out : null;
}

export function parseOpeningHours(raw: string | undefined | null): WeekSchedule | 'always' | null {
  if (!raw) return null;
  const key = raw.trim();
  if (cache.has(key)) return cache.get(key)!;

  const result = ((): WeekSchedule | 'always' | null => {
    let value = key.replace(/"[^"]*"/g, '').split('||')[0]!.trim();
    if (!value) return null;
    if (/^24\s*\/\s*7$/i.test(value) || /^(mo-su\s+)?(00:00-24:00|0:00-24:00|00:00-23:59)$/i.test(value)) return 'always';
    if (/^open$/i.test(value)) return 'always';
    if (UNSUPPORTED.test(value)) return null;
    value = value.replace(/\s+/g, ' ');

    const week: WeekSchedule = Array.from({ length: 7 }, () => []);
    let touched = false;

    for (const ruleRaw of value.split(';')) {
      const rule = ruleRaw.trim();
      if (!rule) continue;
      if (/^ph\b/i.test(rule)) continue; // public-holiday exceptions do not change the weekly pattern

      const withoutPh = rule.replace(/,?\s*ph\b/gi, '').trim();
      const m = withoutPh.match(/^((?:mo|tu|we|th|fr|sa|su)[a-z]*(?:\s*[-,]\s*(?:mo|tu|we|th|fr|sa|su)[a-z]*)*)?\s*:?\s*(.*)$/i);
      if (!m) return null;
      const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
      if (!days) return null;
      const rest = (m[2] ?? '').trim();

      if (!rest) {
        // "Mo-Fr" with no time means open all day on those days.
        days.forEach((d) => (week[d] = [[0, 1440]]));
        touched = true;
        continue;
      }
      if (/^(off|closed)$/i.test(rest)) {
        days.forEach((d) => (week[d] = []));
        touched = true;
        continue;
      }
      if (/^24\s*\/\s*7$/.test(rest)) {
        days.forEach((d) => (week[d] = [[0, 1440]]));
        touched = true;
        continue;
      }
      const times = parseTimes(rest);
      if (!times) return null;
      // A later rule replaces earlier ones for the days it names.
      days.forEach((d) => (week[d] = times.map((t) => [...t] as Interval)));
      touched = true;
    }

    if (!touched) return null;
    if (week.every((d) => d.length === 1 && d[0]![0] === 0 && d[0]![1] >= 1440)) return 'always';
    return week;
  })();

  cache.set(key, result);
  return result;
}

const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
};

const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

export function getOpenStatus(raw: string | undefined | null, now = new Date()): OpenStatus {
  const schedule = parseOpeningHours(raw);
  if (schedule === null) return { state: 'unknown', label: raw ? 'See hours' : 'Hours not listed' };
  if (schedule === 'always') return { state: 'open', label: 'Open 24 hours', alwaysOpen: true };

  const today = mondayIndex(now);
  const minute = now.getHours() * 60 + now.getMinutes();

  // Open now? Check today's intervals, then yesterday's that run past midnight.
  let closesAt: number | null = null;
  for (const [s, e] of schedule[today]!) if (minute >= s && minute < e) closesAt = Math.max(closesAt ?? 0, e);
  for (const [s, e] of schedule[(today + 6) % 7]!) if (e > 1440 && minute < e - 1440 && s <= 1440) closesAt = Math.max(closesAt ?? 0, e - 1440);

  if (closesAt != null) {
    const left = closesAt - minute;
    const detail = closesAt >= 1440 && closesAt % 1440 === 0 ? 'Closes midnight' : `Closes ${clock(closesAt)}`;
    return left <= 45 ? { state: 'closing_soon', label: 'Closing soon', detail } : { state: 'open', label: 'Open', detail };
  }

  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7;
    const next = schedule[day]!
      .map(([s]) => s)
      .filter((s) => offset > 0 || s > minute)
      .sort((a, b) => a - b)[0];
    if (next == null) continue;
    const when = offset === 0 ? '' : offset === 1 ? ' tomorrow' : ` ${DAY_SHORT[day]}`;
    return { state: 'closed', label: 'Closed', detail: `Opens ${clock(next)}${when}` };
  }
  return { state: 'closed', label: 'Closed' };
}

export function isOpenNow(raw: string | undefined | null, now = new Date()): boolean | null {
  const s = getOpenStatus(raw, now).state;
  return s === 'unknown' ? null : s !== 'closed';
}

export interface DayHours {
  day: string;
  short: string;
  text: string;
  isToday: boolean;
  closed: boolean;
}

export function weekTable(raw: string | undefined | null, now = new Date()): DayHours[] | null {
  const schedule = parseOpeningHours(raw);
  if (schedule === null) return null;
  const today = mondayIndex(now);
  return DAY_NAMES.map((day, i) => {
    const intervals = schedule === 'always' ? ([[0, 1440]] as Interval[]) : schedule[i]!;
    const allDay = intervals.length === 1 && intervals[0]![0] === 0 && intervals[0]![1] >= 1440;
    return {
      day,
      short: DAY_SHORT[i]!,
      isToday: i === today,
      closed: intervals.length === 0,
      text: intervals.length === 0 ? 'Closed' : allDay ? 'Open 24 hours' : intervals.map(([s, e]) => `${clock(s)} – ${clock(e)}`).join(', '),
    };
  });
}

/** Build an OSM opening_hours string from the business-portal week editor. */
export function toOpeningHoursString(week: Record<string, { closed: boolean; open: string; close: string }>): string {
  const order = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  const label = (k: string) => k[0]!.toUpperCase() + k[1];
  const groups: { days: string[]; text: string }[] = [];
  for (const k of order) {
    const d = week[k];
    if (!d) continue;
    const text = d.closed ? 'off' : `${d.open}-${d.close}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.days.push(k);
    else groups.push({ days: [k], text });
  }
  return groups
    .map((g) => `${g.days.length > 1 ? `${label(g.days[0]!)}-${label(g.days[g.days.length - 1]!)}` : label(g.days[0]!)} ${g.text}`)
    .join('; ');
}
