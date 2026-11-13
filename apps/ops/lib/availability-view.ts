// Interviews > Your availability (Ops Hub refresh, demo p-availability): the one shape the page draws, whether it comes
// from the mock sample (mock/availability-view.ts) or the real tables (lib/availability-live.ts). Calendar days are
// "YYYY-MM-DD" strings (never parsed as UTC instants); instants (`sentAt`) are ISO strings drawn in Eastern time.
import type { MinuteRange } from './free-ranges';

/**
 * One interview already booked in the board member's free time (mock only: the current page shows no bookings). `id` is
 * the sample's interview key; mock Send uses these to play the "find cover" story (?demo=cover).
 */
export type AvBooking = { id: string; day: string; min: number; applicant: string; withName: string; withInitials: string };

/**
 * What the page may do. Mock mode: everything, on the page's own state. Live mode: `send` is the existing
 * saveAvailability action and `reader` the existing readTypedAvailability action (both unchanged); `bookings` is off
 * (the current page shows no bookings or student names, so the booked overlay, its lines and its news card are hidden).
 */
export type AvCaps = { send: boolean; reader: boolean; bookings: boolean; mock: boolean };

/** The page's data. */
export type AvailabilityView = {
  /** Today's Eastern calendar day (mock: the sample's Tue Nov 10, 2026). */
  today: string;
  /** "Fall 2026": beside the title. */
  term: string;
  /** Every day of the interview window, in order (empty when the dates aren't set). */
  days: string[];
  me: { initials: string };
  /** The saved free time, merged, inside the window. */
  ranges: MinuteRange[];
  /** "Most interviews" (null = no limit). */
  maxInterviews: number | null;
  /** The saved typed note (sent back unchanged on Send, or the words the reader read). */
  text: string;
  /** When the availability was last sent (an instant), or null. */
  sentAt: string | null;
  /** The Eastern day the cycle closes ("Due Fri Nov 6"), or null. */
  dueOn: string | null;
  /** The signed-in board member's own "students I know" (private: row-level security returns only their rows). */
  conflicts: string[];
  bookings: AvBooking[];
  /** No published cycle, or its interview dates aren't set: the page says so instead of drawing the line. */
  noDates: boolean;
  /** The page's data didn't load: the designed load error under the title. */
  loadFailed: boolean;
  caps: AvCaps;
  /** Mock only (?demo=failsend): the first Send fails. */
  failFirst: { send: boolean };
};

/** What the loader returns: the page, or `failed` (the whole-page "didn't load" card). */
export type AvailabilityResult = (AvailabilityView & { failed: false }) | { failed: true };
