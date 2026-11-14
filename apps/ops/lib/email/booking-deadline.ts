// Shared by the "Send times" invites (send.ts) and the student "Remind" email (remind-students.ts): the booking deadline
// (cycles.booking_closes_at, an instant; null = no deadline) decides whether booking has closed, and which day the
// "book by" line of the email names. SERVER ONLY (no I/O here, plain functions).
import { easternDate } from '../interview-cover';

/** "Nov 13" for an instant, in Eastern time (the deadline 2026-11-14T04:59Z is Nov 13). */
export const easternMonthDay = (ts: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(new Date(ts));

/** The Eastern "Nov 13" day booking closed on, or null when there is no deadline or it has not passed yet. */
export function bookingClosedOn(closesAt: string | null | undefined, now: Date): string | null {
  if (!closesAt || Number.isNaN(Date.parse(closesAt)) || now.getTime() < Date.parse(closesAt)) return null;
  return easternMonthDay(closesAt);
}

/**
 * The calendar date ("2026-11-13") the "book by" line names: the Eastern day of the booking deadline when one is set,
 * otherwise the cycle's interview end date exactly as before.
 */
export function bookByDate(interviewEnd: string | null, closesAt: string | null | undefined): string | null {
  if (closesAt && !Number.isNaN(Date.parse(closesAt))) return easternDate(new Date(closesAt));
  return interviewEnd;
}
