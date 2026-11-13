// Plain-word time shared by every refreshed Ops Hub page ("1 day late", "Tomorrow", "Thu", "Next Mon", "Thu Nov 12"),
// calendar-week groups (Mon to Sun), the snooze targets and Eastern clock times. Pure functions only: everything is counted
// from the view's `today` (an Eastern calendar day, "2026-11-10"), so server and browser always draw the same words.
// Page-specific words (Today's needs card, interview tickets, the add-a-task parser) live in that page's lib/<page>-time.ts.

export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = 86_400_000;
const TZ = 'America/New_York';

/** Where a dated item sits in a list grouped by calendar week. */
export type WeekGroup = 'late' | 'week' | 'next' | 'later' | 'wait';

/** Turns "2026-11-12" into a UTC-midnight Date (calendar days only, so no time zone can shift the day). */
export function atDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Turns a UTC-midnight Date back into "2026-11-12".
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `today` to `day` (negative = in the past). */
export function daysFrom(today: string, day: string): number {
  return Math.round((atDay(day).getTime() - atDay(today).getTime()) / DAY);
}

/** The calendar day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  return iso(new Date(atDay(day).getTime() + n * DAY));
}

/** Three-letter weekday of a calendar day ("Thu"). */
export function weekday(day: string): string {
  return WD[atDay(day).getUTCDay()];
}

/** "Thu Nov 12". */
export function shortDate(day: string): string {
  const d = atDay(day);
  return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Thursday, November 12" (hover titles and screen-reader text). */
export function fullDate(day: string): string {
  const d = atDay(day);
  return `${WDL[d.getUTCDay()]}, ${MOL[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Days from `today` to the Sunday that ends its calendar week (Mon to Sun); 0 when today is Sunday. */
export function daysToSunday(today: string): number {
  return (7 - atDay(today).getUTCDay()) % 7;
}

/** The due word on a row: "No date", "2 days late", "Today", "Tomorrow", "Thu", "Next Thu", or "Fri Nov 27". */
export function rel(today: string, day: string | null): string {
  if (!day) return 'No date';
  const n = daysFrom(today, day);
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  // Same calendar weeks as groupOf, so a row under "Next week" never says just "Mon".
  const toSun = daysToSunday(today);
  if (n <= toSun) return weekday(day);
  if (n <= toSun + 7) return `Next ${weekday(day)}`;
  return shortDate(day);
}

/** The hover title of a row's due word: "Due Thursday, November 12", "Was due ...", or "No due date". */
export function dueTitle(today: string, day: string | null): string {
  if (!day) return 'No due date';
  return `${daysFrom(today, day) < 0 ? 'Was due' : 'Due'} ${fullDate(day)}`;
}

/**
 * Which group an item sits in: waiting first, then by calendar week (Mon to Sun). "This week" runs from today through
 * this coming Sunday, "Next week" is the following Mon to Sun, "Later" is after that (and undated items).
 */
export function groupOf(today: string, day: string | null, waiting = false): WeekGroup {
  if (waiting) return 'wait';
  if (!day) return 'later';
  const n = daysFrom(today, day);
  const toSun = daysToSunday(today);
  return n < 0 ? 'late' : n <= toSun ? 'week' : n <= toSun + 7 ? 'next' : 'later';
}

/** The two snooze targets: tomorrow and next Monday (the first Monday after `today`, so always in "Next week"). */
export function snoozeDays(today: string): { tomorrow: string; nextMonday: string } {
  const wd = atDay(today).getUTCDay();
  return { tomorrow: addDays(today, 1), nextMonday: addDays(today, ((8 - wd) % 7) || 7) };
}

// The parts of an instant in Eastern time.
function eastern(instant: string): { day: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/** The Eastern calendar day of an instant ("2026-11-12"). */
export function easternDay(instant: string): string {
  return eastern(instant).day;
}

/** "5:30 PM" in Eastern time. */
export function clock(instant: string): string {
  const { hour, minute } = eastern(instant);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
