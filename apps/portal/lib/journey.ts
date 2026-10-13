// The student's path after she submits: which status screen she sees, worked out from real data (the cycle's dates
// against now in Eastern time, whether she holds an interview time, whether she asked for different times, and the
// decision). Pure functions with no database calls, so the rules are easy to test. The Figma sample dates (Sep 15,
// Oct 6, Oct 23) appear only in the mock demos (lib/journey-demo.ts); live mode always passes the real values.
import { daysBetween, easternDate } from './format';

export type JourneyState =
  | 'waiting' // submitted, before interviews open (the screen built with the status page)
  | 'book' // interviews are open and she has no time yet
  | 'sent' // she sent her free times and waits for a time from BTX
  | 'booked' // she just booked (within a day)
  | 'switched' // she just changed her time (within a day)
  | 'soon' // her interview is 1 to 3 days away
  | 'today' // her interview is today
  | 'after' // the interview is over (or the weeks are over) and no decision is shown yet
  | 'won'
  | 'won-sent' // winner, photo and story sent
  | 'not-picked';

export type Booking = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  /** When the booking was made (bookings.created_at). */
  bookedAt: string;
  /** True when it replaced an earlier time (a released booking exists for her application). */
  switched: boolean;
};

/** One free time: an Eastern day ("2026-11-10") with a start and end ("18:00", "21:00"; "24:00" ends the day). */
export type FreeRange = { day: string; start: string; end: string };

/** Her answer to "None of these times work". Newer answers are `ranges` (with `note` = what she typed); older ones are days and windows. */
export type FreeTimes = { days: string[]; windows: string[]; note: string; ranges?: FreeRange[] };

/** The board's decision (needs the Ops Hub tables; mock only until they are applied). */
export type Decision = { kind: 'won'; storySent: boolean } | { kind: 'not-picked' } | null;

export type JourneyInput = {
  now: Date;
  /** "YYYY-MM-DD" cycle dates, or null when the cycle does not set them. */
  interviewStart: string | null;
  interviewEnd: string | null;
  booking: Booking | null;
  freeTimes: FreeTimes | null;
  decision: Decision;
  /** True when the board has opened interview times she can book (open_interview_slots returned some). */
  timesOpen?: boolean;
};

const DAY = 86400000;

// Picks the screen. Rules, in order:
//  1. A decision shows when the database returns one (my_decision is null until an admin releases the decisions), so
//     there is no date check here.
//  2. Before any times are open to book and before the interview weeks (or when the cycle sets no interview dates):
//     the waiting screen. The board opens times after applications close, which can be days before the first
//     interview, so open times (or a booking) end the wait.
//  3. With a booking: interview day, then just booked or switched (first 24 hours), then 1 to 3 days away, then
//     plain booked; once the interview has ended: the after screen.
//  4. Without one: after the interview weeks, the after screen; free times sent, the sent screen; otherwise book.
export function pickState(i: JourneyInput): JourneyState {
  const today = easternDate(i.now);
  if (i.decision) {
    if (i.decision.kind === 'not-picked') return 'not-picked';
    return i.decision.storySent ? 'won-sent' : 'won';
  }
  const started = Boolean(i.interviewStart && today >= i.interviewStart);
  if (!i.booking && !i.timesOpen && !started) return 'waiting';
  if (i.booking) {
    const end = new Date(i.booking.endsAt);
    if (i.now > end) return 'after';
    const day = easternDate(i.booking.startsAt);
    const days = daysBetween(today, day);
    if (days <= 0) return 'today';
    if (i.now.getTime() - new Date(i.booking.bookedAt).getTime() < DAY) return i.booking.switched ? 'switched' : 'booked';
    if (days <= 3) return 'soon';
    return 'booked';
  }
  if (i.interviewEnd && today > i.interviewEnd) return 'after';
  return i.freeTimes ? 'sent' : 'book';
}

const NY = 'America/New_York';
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: NY, ...o }).format(d);

/** "Tue Oct 6" */
export function dayLabel(ts: string): string {
  return fmt(new Date(ts), { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
}
/** "6:00 PM" */
export function clock(ts: string): string {
  return fmt(new Date(ts), { hour: 'numeric', minute: '2-digit' });
}
/** "6:00 to 6:30 PM" (or "11:30 AM to 12:00 PM" across noon). The word "Eastern" is added by the screen. */
export function range(a: string, b: string): string {
  const x = clock(a);
  const y = clock(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)} to ${y}` : `${x} to ${y}`;
}
/** "Sep 15" for the dates under the drawing. */
export function shortLabel(ts: string): string {
  return fmt(new Date(ts), { month: 'short', day: 'numeric' });
}

/** The words beside "Your interview": "In 3 weeks", "In 3 days", "Tomorrow", or on the day "Starts in 8 minutes". */
export function countdown(now: Date, startsAt: string): string {
  const ms = new Date(startsAt).getTime() - now.getTime();
  const days = daysBetween(easternDate(now), easternDate(startsAt));
  if (days <= 0) {
    const mins = Math.max(0, Math.round(ms / 60000));
    if (ms <= 0) return 'Starting now';
    if (mins < 60) return mins === 1 ? 'Starts in 1 minute' : `Starts in ${mins} minutes`;
    const hours = Math.round(mins / 60);
    return hours === 1 ? 'Starts in 1 hour' : `Starts in ${hours} hours`;
  }
  if (days === 1) return 'Tomorrow';
  if (days >= 14) return `In ${Math.round(days / 7)} weeks`;
  if (days >= 7) return 'In 1 week';
  return `In ${days} days`;
}

const WORDS = ['Zero', 'One', 'Two', 'Three'];
/** The "soon" headline: "Two days to go". */
export function soonTitle(now: Date, startsAt: string): string {
  const days = Math.min(3, Math.max(1, daysBetween(easternDate(now), easternDate(startsAt))));
  return `${WORDS[days]} ${days === 1 ? 'day' : 'days'} to go`;
}

export type Slot = { id: string; startsAt: string; endsAt: string };

/** Groups slots by Eastern calendar day: [{ day: "2026-10-06", slots }], in time order. */
export function groupByDay(slots: Slot[]): { day: string; slots: Slot[] }[] {
  const out = new Map<string, Slot[]>();
  [...slots]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .forEach((s) => {
      const d = easternDate(s.startsAt);
      out.set(d, [...(out.get(d) ?? []), s]);
    });
  return [...out].map(([day, list]) => ({ day, slots: list }));
}

/** Monday on or before an "YYYY-MM-DD" date. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7;
  return new Date(dt.getTime() - back * DAY).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

export const WINDOWS = [
  { id: 'morning', label: 'Morning, 9 to 12', from: 9, to: 12 },
  { id: 'afternoon', label: 'Afternoon, 12 to 5', from: 12, to: 17 },
  { id: 'evening', label: 'Evening, 5 to 9', from: 17, to: 21 },
] as const;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** The open slots that fit the days and times she picked (empty picks fit nothing). */
export function slotsThatFit(slots: Slot[], days: string[], windows: string[]): Slot[] {
  if (!days.length || !windows.length) return [];
  return slots.filter((s) => {
    const wd = fmt(new Date(s.startsAt), { weekday: 'short' });
    const hour = Number(fmt(new Date(s.startsAt), { hour: 'numeric', hour12: false }).replace('24', '0'));
    return days.includes(wd) && WINDOWS.some((w) => windows.includes(w.id) && hour >= w.from && hour < w.to);
  });
}

/** "Sundays, mornings." as the sent screen shows it. */
export function describeFreeTimes(f: FreeTimes): string {
  const days = WEEKDAYS.filter((d) => f.days.includes(d));
  const names: Record<string, string> = { Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' };
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const w = WINDOWS.filter((x) => f.windows.includes(x.id)).map((x) => `${x.id.slice(0, 1) === 'm' ? 'mornings' : x.id === 'afternoon' ? 'afternoons' : 'evenings'}`);
  return `${list(days.map((d) => names[d]))}, ${list(w)}.`;
}

/** Minutes since midnight, Eastern, of a timestamp. */
export function easternMinutes(ts: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0) % 24;
  return get('hour') * 60 + get('minute');
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** The open slots that sit wholly inside one of her free ranges (Eastern day and clock time). */
export function slotsFitRanges(slots: Slot[], ranges: FreeRange[]): Slot[] {
  if (!ranges.length) return [];
  return slots.filter((s) => {
    const day = easternDate(s.startsAt);
    const start = easternMinutes(s.startsAt);
    const length = Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000);
    return ranges.some((r) => r.day === day && minutesOf(r.start) <= start && start + length <= minutesOf(r.end));
  });
}

/** The days she can add times on: from today (or the first interview day) to the last interview day. Never empty. */
export function freeWindow(today: string, interviewStart: string | null, interviewEnd: string | null): { start: string; end: string } {
  const start = interviewStart && interviewStart > today ? interviewStart : today;
  const end = interviewEnd && interviewEnd >= start ? interviewEnd : addDays(start, 13);
  return { start, end };
}

/** "6 to 9 PM" or "11 AM to 12:30 PM" for one range, as the chips show it. */
export function spanLabel(r: FreeRange): string {
  const part = (hhmm: string) => {
    const m = minutesOf(hhmm);
    const h24 = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return { text: `${h24 % 12 === 0 ? 12 : h24 % 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`, ampm: h24 < 12 ? 'AM' : 'PM' };
  };
  const a = part(r.start);
  const b = part(r.end);
  return a.ampm === b.ampm ? `${a.text} to ${b.text} ${b.ampm}` : `${a.text} ${a.ampm} to ${b.text} ${b.ampm}`;
}

/** Ranges in a link ("2026-11-10_18:00-21:00,2026-11-12_18:00-21:00"); mock mode carries her answer to the status page this way. */
export const encodeRanges = (rs: FreeRange[]): string => rs.map((r) => `${r.day}_${r.start}-${r.end}`).join(',');
export function parseRanges(s: string | undefined): FreeRange[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => /^(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(x))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ day: m[1], start: m[2], end: m[3] }));
}

/** Sorts her ranges and joins the ones that overlap or touch on the same day. Same rule as the reader's tidy-up. */
export function mergeFreeRanges(ranges: FreeRange[]): FreeRange[] {
  const sorted = [...ranges].sort((a, b) => a.day.localeCompare(b.day) || minutesOf(a.start) - minutesOf(b.start));
  const out: FreeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.day === r.day && minutesOf(r.start) <= minutesOf(last.end)) {
      if (minutesOf(r.end) > minutesOf(last.end)) last.end = r.end;
    } else out.push({ ...r });
  }
  return out;
}

/** The half-hour times she can pick from: 8:00 AM to 10:00 PM, as "08:00" with its label "8:00 AM". */
export const TIME_CHOICES: { value: string; label: string }[] = Array.from({ length: 29 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return { value: `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, label: `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` };
});

/** "Tue Nov 10" for an "YYYY-MM-DD" day. */
export const dayName = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
};

/** Every day from first to last ("YYYY-MM-DD"), at most 62. */
export function daysFrom(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The minutes of a "HH:MM" time. */
export const hhmmMinutes = minutesOf;
