const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function timeAgo(ts: number | string, now = Date.now()): string {
  const t = typeof ts === 'string' ? Date.parse(ts) : ts;
  const diff = now - t;
  if (diff < 45_000) return 'just now';
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  if (diff < 7 * DAY) return `${Math.round(diff / DAY)} d ago`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: diff > 300 * DAY ? 'numeric' : undefined });
}

export function timeLeft(ts: number, now = Date.now()): string {
  const diff = ts - now;
  if (diff <= 0) return 'expired';
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min left`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h left`;
  return `${Math.round(diff / DAY)} d left`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export function dayPart(d = new Date()): 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night' {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 11) return 'morning';
  if (h < 15) return 'lunch';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

export const formatClock = (d: Date | number) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');

export const formatDay = (d: Date | number) =>
  new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatDateRange(start: number, end?: number): string {
  const s = new Date(start);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today.getTime() + DAY);
  const label = sameDay(s, today) ? 'Today' : sameDay(s, tomorrow) ? 'Tomorrow' : formatDay(s);
  if (!end) return `${label}, ${formatClock(s)}`;
  const e = new Date(end);
  return sameDay(s, e) ? `${label}, ${formatClock(s)} – ${formatClock(e)}` : `${label} – ${formatDay(e)}`;
}

export const isWeekend = (d = new Date()) => d.getDay() === 0 || d.getDay() === 6 || (d.getDay() === 5 && d.getHours() >= 16);

export { MIN, HOUR, DAY };
