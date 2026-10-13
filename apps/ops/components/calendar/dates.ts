// Calendar-date arithmetic on "YYYY-MM-DD" strings (UTC math, so daylight saving never shifts a day).
import { dateOnlyLabel } from '@/lib/format';
import type { CalItem } from './types';

const DAY = 86_400_000;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => fmt(new Date(parse(s).getTime() + n * DAY));
export const dow = (s: string) => parse(s).getUTCDay();
export const weekStart = (s: string) => addDays(s, -dow(s));
export const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
export const addMonths = (s: string, n: number) => {
  const d = parse(monthStart(s));
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
export const dayNum = (s: string) => Number(s.slice(8, 10));

/** "October 2026". */
export const monthTitle = (s: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(parse(s));
/** "Mon Oct 5". */
export const dayLabel = (s: string) => dateOnlyLabel(s);

/** The weeks (arrays of 7 dates, Sunday first) that cover the month of `s`. */
export function monthWeeks(s: string): string[][] {
  const first = monthStart(s);
  const next = addMonths(first, 1);
  const total = daysBetween(first, next);
  const start = weekStart(first);
  const rows = Math.ceil((dow(first) + total) / 7);
  return Array.from({ length: rows }, (_, r) => Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));
}

/** "10:00 AM" -> minutes after midnight, for sorting; null (all day) sorts as -1. */
export function minutes(t: string | null): number {
  if (!t) return -1;
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t);
  if (!m) return -1;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (m[3] === 'PM' ? 720 : 0);
}

/** The items that sit on one day (spans excluded), in the order the list shows them. */
export function dayItems(items: CalItem[], day: string): CalItem[] {
  return items.filter((i) => !i.span && i.date === day);
}

/** The same day's items in the month grid's order. */
export function chipOrder(list: CalItem[]): CalItem[] {
  return list
    .map((it, n) => ({ it, n }))
    .sort((a, b) => (a.it.chipRank ?? a.n) - (b.it.chipRank ?? b.n) || a.n - b.n)
    .map((x) => x.it);
}

/** "Tomorrow, Mon Oct 5" / "Today, Sun Oct 4" / "Mon Oct 12". */
export function panelHeading(day: string, today: string): string {
  const d = daysBetween(today, day);
  const label = dayLabel(day);
  return d === 0 ? `Today, ${label}` : d === 1 ? `Tomorrow, ${label}` : label;
}
