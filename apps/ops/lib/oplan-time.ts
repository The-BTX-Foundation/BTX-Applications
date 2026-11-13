// The Outreach Plan page's date words and month-line geometry (pure, unit tested in tests/oplan-time.test.ts). Everything
// is counted from the view's `today` (an Eastern calendar day), so server and browser draw the same words.
import { atDay, daysFrom, MO, rel, shortDate, weekday } from './refresh-time';

const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The header's date: "Tue, Nov 10". */
export function headerDate(today: string): string {
  const d = atDay(today);
  return `${weekday(today)}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A row's date word: past days read as "Mon Nov 2"; otherwise "Today", "Tomorrow", "Thu", "Next Sat" or "Mon Nov 30". */
export function pnRel(today: string, day: string | null): string {
  if (!day) return 'No date';
  return daysFrom(today, day) < 0 ? shortDate(day) : rel(today, day);
}

/** The month a day sits in: "2026-11". */
export const monthKey = (day: string): string => day.slice(0, 7);

/** The month after `key`: "2026-11" -> "2026-12", "2026-12" -> "2027-01". */
export function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** "2026-11" -> "November". */
export const monthLong = (key: string): string => MOL[Number(key.slice(5, 7)) - 1] ?? '';

/** How many days the month has (28 to 31). */
export function daysIn(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Where a day of the month sits on the month line, in percent (day 1 at 0, the last day at 100). */
export function linePos(key: string, day: number): number {
  return ((day - 1) / (daysIn(key) - 1)) * 100;
}

/** One label under the month line: the first day, each Monday not crowding an edge, the last day. */
export type WeekMark = { day: number; label: string; edge: 'l' | 'r' | null };

/** The labels under the month line ("Nov 1", "Nov 9", "Nov 16", "Nov 23", "Nov 30" for November 2026). */
export function weekMarks(key: string): WeekMark[] {
  const last = daysIn(key);
  const mo = MO[Number(key.slice(5, 7)) - 1];
  const out: WeekMark[] = [{ day: 1, label: `${mo} 1`, edge: 'l' }];
  for (let d = 2; d < last; d++) {
    // A Monday at least four days from either edge (closer ones would overlap the edge labels).
    if (atDay(`${key}-${String(d).padStart(2, '0')}`).getUTCDay() === 1 && d - 1 >= 4 && last - d >= 4) out.push({ day: d, label: `${mo} ${d}`, edge: null });
  }
  out.push({ day: last, label: `${mo} ${last}`, edge: 'r' });
  return out;
}

/** The day of the month of "2026-11-21" (21). */
export const dayOf = (day: string): number => Number(day.slice(8, 10));
