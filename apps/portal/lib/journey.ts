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

/** Her answer to "None of these times work" (needs a table the live schema does not have yet; mock only). */
export type FreeTimes = { days: string[]; windows: string[]; note: string };

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
};

const DAY = 86400000;

// Picks the screen. Rules, in order:
//  1. A decision shows when the database returns one (my_decision is null until an admin releases the decisions), so
//     there is no date check here.
//  2. Before the interviews open (or when the cycle sets no interview dates): the waiting screen.
//  3. With a booking: interview day, then just booked or switched (first 24 hours), then 1 to 3 days away, then
//     plain booked; once the interview has ended: the after screen.
//  4. Without one: after the interview weeks, the after screen; free times sent, the sent screen; otherwise book.
export function pickState(i: JourneyInput): JourneyState {
  const today = easternDate(i.now);
  if (i.decision) {
    if (i.decision.kind === 'not-picked') return 'not-picked';
    return i.decision.storySent ? 'won-sent' : 'won';
  }
  if (!i.interviewStart || today < i.interviewStart) return 'waiting';
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
