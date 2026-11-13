// Pure helpers for interview cover (no database): which interviews someone's free hours no longer cover, which booked
// interviews "Need cover", the reassign choice, and the once-a-day key for student reminders. Used by the Availability
// save (lib/actions/availability.ts), the Interviews loader (lib/interviews.ts), lib/interview-reassign.ts and the
// student reminder (lib/email/remind-students.ts). Times are read in Eastern time, as the free hours are stored.
import { covers, easternDayMinutes, mergeRanges, type MinuteRange } from './free-ranges';
import { PROTECT_HOURS } from './rebalance';

/** One paired, booked interview: its time and its two interviewers. */
export type PairedInterview = { slotId: string; startsAt: string; endsAt: string; a: string; b: string };

/** The interview's Eastern day and its start and end in minutes after midnight. */
export function slotMinutes(startsAt: string, endsAt: string): { day: string; startMin: number; endMin: number } {
  const s = easternDayMinutes(startsAt);
  const len = Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000));
  return { day: s.day, startMin: s.min, endMin: s.min + len };
}

/** True when `ranges` (one person's free hours) cover the whole interview. */
export function freeFor(ranges: MinuteRange[], startsAt: string, endsAt: string): boolean {
  const m = slotMinutes(startsAt, endsAt);
  // Merged first: two rows that meet (5 to 6, 6 to 7) cover 5:30 to 6:30.
  return covers(mergeRanges(ranges), m.day, m.startMin, m.endMin);
}

/**
 * The interviews ahead (starting after `now`) where `userId` is one of the two and `ranges`, their free hours, no longer
 * cover the whole time. Earliest first. This is what an Availability save would take them off.
 */
export function uncoveredFor<T extends PairedInterview>(userId: string, interviews: T[], ranges: MinuteRange[], now: Date): T[] {
  return interviews
    .filter((i) => (i.a === userId || i.b === userId) && Date.parse(i.startsAt) > now.getTime() && !freeFor(ranges, i.startsAt, i.endsAt))
    .sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt));
}

/**
 * "Needs cover": the interviews ahead with an interviewer whose free hours no longer cover the time (they took the time
 * away and nobody else was free to take it over). Derived, nothing stored. Someone with no free hours left at all
 * counts as not free.
 */
export function needsCoverIds(interviews: PairedInterview[], rangesByUser: Map<string, MinuteRange[]>, now: Date): Set<string> {
  const out = new Set<string>();
  for (const i of interviews) {
    if (Date.parse(i.startsAt) <= now.getTime()) continue;
    if ([i.a, i.b].some((id) => !freeFor(rangesByUser.get(id) ?? [], i.startsAt, i.endsAt))) out.add(i.slotId);
  }
  return out;
}

/**
 * True when the interview starts within `PROTECT_HOURS` (48) of `now`: Rebalance's rule (lib/rebalance.ts). Such an
 * interview is never moved automatically. When someone's Availability save takes them off it, they stay on it and it
 * shows "Needs cover" for the admins.
 */
export function startsSoon(startsAt: string, now: Date): boolean {
  return Date.parse(startsAt) <= now.getTime() + PROTECT_HOURS * 3_600_000;
}

/** The Availability page's line for an interview that starts soon: "Ada Okafor, Thu Nov 12, 5:30 PM: starts soon, ...". */
export function soonLine(line: string): string {
  return `${line}: starts soon, so you stay on it. An admin has been told.`;
}

/** The same set of slot ids, in any order (the confirmed list against the server's own count). */
export function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x)) && s.size === new Set(b).size;
}

/** A replacement as interview_candidates() returns it, before the people already on the interview are taken out. */
export type CandidateRow = { userId: string; name: string; interviewsSoFar: number; freeMinutesLeft: number };

/**
 * Who may take over: the database's candidates (free for the whole time, under their own limit, not someone who knows
 * the student, not busy then) without the two already on it, least-loaded first: fewest interviews, then fewer free
 * minutes left, then by name, the order pairing uses (interview_candidates()).
 */
export function replacements(cands: CandidateRow[], pair: string[]): CandidateRow[] {
  return cands
    .filter((c) => !pair.includes(c.userId))
    .sort((x, y) => x.interviewsSoFar - y.interviewsSoFar || x.freeMinutesLeft - y.freeMinutesLeft || x.name.localeCompare(y.name));
}

/** "AL" from "Ada Lee". */
export function initialsFrom(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return '?';
  return ((w[0][0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

/** The Eastern calendar day of an instant, "2026-11-13". */
export function easternDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

/** The student reminder's "never twice" key: one per address per Eastern day. */
export function remindKey(email: string, now: Date): string {
  return `${email.trim().toLowerCase()}|${easternDate(now)}`;
}

/** True when a reminder already went to this student on `now`'s Eastern day (`sentAt` = the times one went). */
export function remindedToday(sentAt: string[], now: Date): boolean {
  const day = easternDate(now);
  return sentAt.some((s) => easternDate(new Date(s)) === day);
}
