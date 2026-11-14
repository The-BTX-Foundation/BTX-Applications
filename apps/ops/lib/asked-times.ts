// "Asked for other times": students who sent the times they are free in the Portal ("None of these times work", table
// interview_free_times) and still hold no active booking. Drawn on the Interviews page (the panel under the gold card)
// and counted on Today. Pure: no database, no clock of its own. Imported by the Interviews board (a client component),
// so it uses '@btx/emails/free-times' only, never the package root (which pulls in the mail sender).
import { cleanFreeRanges, freeRangeLines, oldAnswerLine, sentLabel, slotFitsRanges } from '@btx/emails/free-times';

/** One proposed or opened time that fits inside her ranges. */
export type IzFit = { id: string; label: string; opened: boolean };

/** One student waiting on other times. */
export type IzAsked = {
  /** The application's id. */
  id: string;
  name: string;
  code: string;
  /** What she typed ("Weekdays after 5"), or empty. */
  said: string;
  /** Her free times as Eastern lines ("Sun Nov 15, 3:00 to 10:00 PM"); an older answer gives one "Mon, Wed · evening" line. */
  lines: string[];
  /** When she last sent or changed it (an instant). */
  sent: string;
  /** Future, unheld times that lie fully inside one of her ranges, soonest first. */
  fits: IzFit[];
};

/** An interview_free_times row as read. */
export type FreeTimesRead = {
  application_id: string;
  ranges: unknown;
  said: string | null;
  days: string[] | null;
  windows: string[] | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
};

/** A cycle's interview time as the fit check needs it. */
export type AskedSlot = { id: string; startsAt: string; endsAt: string; opened: boolean; booked: boolean };

// "Sun Nov 15, 6:30 PM" for a slot's start (Eastern).
const fitLabel = (startsAt: string) => sentLabel(startsAt);

/**
 * The "Asked for other times" list. `apps` are the cycle's submitted applications; `booked` the ids holding an active
 * booking (they are left out: once she books, she is no longer waiting); `rows` the free-times rows (a submitted student
 * with no row is left out). A student past the booking deadline is still listed: the deadline stops new answers, not the
 * board from finding her a time. Oldest request first, so the longest wait is on top.
 */
export function groupAsked(apps: { id: string; name: string; code: string }[], booked: Set<string>, rows: FreeTimesRead[], slots: AskedSlot[], now: Date): IzAsked[] {
  const byApp = new Map(rows.map((r) => [r.application_id, r]));
  const future = slots.filter((s) => !s.booked && Date.parse(s.startsAt) > now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const out: IzAsked[] = [];
  for (const a of apps) {
    const r = byApp.get(a.id);
    if (!r || booked.has(a.id)) continue;
    const ranges = cleanFreeRanges(r.ranges);
    const lines = ranges.length > 0 ? freeRangeLines(ranges) : [oldAnswerLine(r.days, r.windows)].filter(Boolean);
    // Older rows (days and parts of the day) have no exact times, so no time can be said to fit them.
    const fits = ranges.length > 0 ? future.filter((s) => slotFitsRanges(s.startsAt, s.endsAt, ranges)).map((s) => ({ id: s.id, label: fitLabel(s.startsAt), opened: s.opened })) : [];
    out.push({ id: a.id, name: a.name.trim() || a.code || 'No name', code: a.code, said: (r.said ?? r.note ?? '').trim(), lines, sent: r.updated_at ?? r.created_at, fits });
  }
  return out.sort((x, y) => x.sent.localeCompare(y.sent));
}

/** How many students are waiting on other times: submitted, with a free-times row, and no active booking. */
export function countAsked(submittedIds: string[], activeAppIds: Set<string>, freeTimeAppIds: Set<string>): number {
  return submittedIds.filter((id) => freeTimeAppIds.has(id) && !activeAppIds.has(id)).length;
}

/** "Sent Tue Nov 10, 9:14 PM". */
export function askedSentLine(iso: string): string {
  return `Sent ${sentLabel(iso)}`;
}

/** "2 students asked for other times" / "1 student asked for other times". */
export function askedTitle(n: number): string {
  return `${n} ${n === 1 ? 'student' : 'students'} asked for other times`;
}
