// The "Add event" form's rules on the Calendar page, kept apart from the screen so the unit tests
// (tests/calendar-event.test.ts) can check them. The table is `calendar_events`: title (1 to 200 characters), starts_at,
// all_day and area (the four area slugs). It has no separate time column: the time is part of starts_at.
import type { CalArea } from '@/components/calendar/types';

export const EVENT_TITLE_MAX = 200;
export const AREAS: CalArea[] = ['scholarships', 'programs', 'money', 'outreach'];
/** The time box's value for an event with no set time. */
export const ALL_DAY = 'all-day';
/** The time the form starts on. */
export const DEFAULT_TIME = '18:00';

/** "18:00" -> "6:00 PM". */
export function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The choices in the time box: all day, then every half hour from 7:00 AM to 10:00 PM. */
export const EVENT_TIMES: { value: string; label: string }[] = [
  { value: ALL_DAY, label: 'All day' },
  ...Array.from({ length: 31 }, (_, i) => {
    const mins = 7 * 60 + i * 30;
    const value = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return { value, label: timeLabel(value) };
  }),
];

export type EventInput = { title: string; date: string; time: string; area: string };
export type EventCheck = { ok: true; title: string; date: string; time: string; area: CalArea } | { ok: false; message: string };

const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Checks the form in the order it is read; the first problem comes back as a plain sentence. */
export function checkEvent(input: EventInput): EventCheck {
  const title = (input.title ?? '').trim();
  if (!title) return { ok: false, message: 'Give the event a title.' };
  if (title.length > EVENT_TITLE_MAX) return { ok: false, message: `Keep the title to ${EVENT_TITLE_MAX} characters or fewer.` };
  if (!validDate(input.date)) return { ok: false, message: 'Pick a date.' };
  if (!EVENT_TIMES.some((t) => t.value === input.time)) return { ok: false, message: 'Pick a time.' };
  if (!AREAS.includes(input.area as CalArea)) return { ok: false, message: 'Pick an area.' };
  return { ok: true, title, date: input.date, time: input.time, area: input.area as CalArea };
}

// How far Eastern time is from UTC at a moment, in milliseconds (negative: -4 or -5 hours).
function easternOffset(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
}

/** The moment a date and clock time ("2026-10-12", "18:00") mean in Eastern time, as an ISO timestamp. */
export function easternToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let ms = wall;
  for (let i = 0; i < 2; i++) ms = wall - easternOffset(ms);
  return new Date(ms).toISOString();
}

/** What gets saved: starts_at (all-day events sit at noon Eastern, so they never slip to another day) and all_day. */
export function eventTimes(date: string, time: string): { starts_at: string; all_day: boolean } {
  return time === ALL_DAY ? { starts_at: easternToIso(date, '12:00'), all_day: true } : { starts_at: easternToIso(date, time), all_day: false };
}
