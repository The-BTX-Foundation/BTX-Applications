// Pure helpers for the Interviews page's times and fairness panels (no database, safe in the browser): grouping times by
// day, the lines under each day, the fairness bars and the wording of a rebalance. The page's data comes from
// lib/interviews.ts; the calls behind it are in lib/interview-flow-db.ts.
import { dateOnlyLabel, dayLabel, timeLabel } from './format';
import { windowDays } from './free-ranges';

export type TimeChip = {
  slotId: string;
  startsAt: string;
  /** "6:00 PM". */
  time: string;
  /** Board members free for the whole time. */
  freeCount: number;
  /** Offered to students (opened). */
  opened: boolean;
  /** A student holds it now. */
  booked: boolean;
  /** The applicant's full name when booked. */
  bookedBy: string | null;
};

export type TimeDay = { day: string; label: string; times: TimeChip[] };

/** "2026-11-10" for an instant, in Eastern time. */
export function easternYmd(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
}

/** Every day of the interview dates (even empty ones), with the times of that day in order. Times outside the dates get their own day. */
export function groupByDay(windowStart: string | null, windowEnd: string | null, chips: TimeChip[]): TimeDay[] {
  const days = new Set(windowDays(windowStart, windowEnd));
  for (const c of chips) days.add(easternYmd(c.startsAt));
  return [...days]
    .sort()
    .map((day) => ({
      day,
      label: dateOnlyLabel(day),
      times: chips.filter((c) => easternYmd(c.startsAt) === day).sort((x, y) => x.startsAt.localeCompare(y.startsAt)),
    }));
}

/** The small line under a day: "2 times" or "No times" before sending, "0 booked · 2 open" after. */
export function dayLine(d: TimeDay, sent: boolean): string {
  if (d.times.length === 0) return 'No times';
  if (!sent) return d.times.length === 1 ? '1 time' : `${d.times.length} times`;
  const booked = d.times.filter((t) => t.booked).length;
  return `${booked} booked · ${d.times.length - booked} open`;
}

/** "Sade Price" -> "Sade P." for the small booked chip. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** "Still waiting on Marcus Davis and Darien Strachan." */
export function waitingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `Still waiting on ${names[0]}.`;
  return `Still waiting on ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

/** The bold line over the proposed times. */
export function proposedHeadline(times: number, applicants: number, lowCount: number): string {
  const head = `${times} ${times === 1 ? 'time' : 'times'} proposed for ${applicants} ${applicants === 1 ? 'applicant' : 'applicants'}.`;
  if (times === 0) return 'No times fit the availability yet.';
  return lowCount === 0 ? `${head} Every time has at least 2 free board members.` : `${head} ${lowCount === 1 ? '1 time has' : `${lowCount} times have`} fewer than 2 free board members.`;
}

/** "Thu Nov 12, 7:00 PM". */
export function whenLine(iso: string): string {
  return `${dayLabel(iso)}, ${timeLabel(iso)}`;
}

/** The longest a fairness bar can be: 8 interviews, or one more than the busiest person. */
export function barScale(counts: number[]): number {
  return Math.max(8, ...counts.map((n) => n + 1));
}

export type FairPerson = { userId: string; name: string; interviews: number; target: number | null; maxInterviews: number | null; overBy: number };

/** "Limit 4, at limit" / "Limit 4" / "" for the note beside a bar. */
export function limitNote(p: FairPerson): string {
  if (p.maxInterviews === null) return '';
  return p.interviews >= p.maxInterviews ? `Limit ${p.maxInterviews}, at limit` : `Limit ${p.maxInterviews}`;
}

/** The note under the bar: two or more over their share are flagged; one over is the most even a split can be. */
export function overNote(p: FairPerson): { text: string; flag: boolean } | null {
  if (p.target === null || p.overBy <= 0) return null;
  return p.overBy >= 2 ? { text: `${p.overBy} over target`, flag: true } : { text: `${p.overBy} over`, flag: false };
}

/** The even share everyone is aiming for (the lowest target among people with no limit in the way), and the line that explains it. */
export function targetLine(people: FairPerson[], interviews: number): { base: number; line: string } {
  const senders = people.filter((p) => p.target !== null);
  const seats = senders.reduce((n, p) => n + p.interviews, 0);
  const base = senders.length > 0 ? Math.floor(seats / senders.length) : 0;
  return { base, line: `Target ${base} each: ${interviews} ${interviews === 1 ? 'interview' : 'interviews'} × 2 ÷ ${senders.length}` };
}

/** "As even as it can be. Marcus Davis is at their limit of 4, so two people have 6." (after a rebalance). */
export function evenNote(people: FairPerson[], base: number): string {
  const capped = people.filter((p) => p.maxInterviews !== null && p.maxInterviews < base && p.interviews >= p.maxInterviews);
  const high = people.filter((p) => p.target !== null && p.interviews > base).length;
  const words = ['no one', 'one person', 'two people', 'three people', 'four people', 'five people', 'six people'];
  const who = (n: number) => words[n] ?? `${n} people`;
  if (capped.length === 0) return high === 0 ? 'Everyone has an even share.' : `As even as it can be, so ${who(high)} ${high === 1 ? 'has' : 'have'} ${base + 1}.`;
  const names = capped.map((p) => p.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `As even as it can be. ${list} ${names.length === 1 ? 'is' : 'are'} at their limit, so ${who(high)} ${high === 1 ? 'has' : 'have'} ${base + 1}.`;
}

export type MoveView = { slotId: string; startsAt: string; applicant: string; fromName: string; toName: string; from: string; to: string };

/** "Thu Nov 12, 7:00 PM · Jordan Wells · Tomi Falodun → Chariah Ghee". */
export function moveLine(m: MoveView): string {
  return `${whenLine(m.startsAt)} · ${m.applicant} · ${m.fromName} → ${m.toName}`;
}

/** Everyone a move touches, once each, in order of first appearance. */
export function affected(moves: MoveView[]): string[] {
  const out: string[] = [];
  for (const m of moves) for (const n of [m.fromName, m.toName]) if (!out.includes(n)) out.push(n);
  return out;
}

/** "Kelsey Davis, Tomi Falodun and Darien Strachan". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The confirm text for a rebalance. */
export function rebalanceConfirm(moves: MoveView[]): string {
  if (moves.length === 0) return 'Nothing needs to move. Everyone is as even as the limits and free times allow.';
  const n = affected(moves).length;
  return `Moves ${moves.length} ${moves.length === 1 ? 'interview' : 'interviews'}. Nothing within 48 hours moves. The ${n} ${n === 1 ? 'person' : 'people'} affected get an email.`;
}
