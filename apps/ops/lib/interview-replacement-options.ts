// Who may take over an interviewer's seat on the page for one interview ("Who covers for X?"). Pure, no database: the
// reads live in lib/interview-reassign.ts (listReplacementOptions), so tests/interview-replacement-options.test.ts checks
// every rule with sample rows.
//
// Any admin or board member may be picked, as long as they are not already on it, not someone who listed the student
// under "Students I know" (left out without a reason, on purpose) and not on another interview at the same time. People
// the database would pick by itself (interview_candidates(): free for the whole time, under their own limit) are marked
// free and come first, least loaded first. Everyone else follows by name with a short note, so the board can agree among
// themselves and still save the change without that person updating their availability first.
import type { MinuteRange } from './free-ranges';
import { initialsFrom, replacements, slotMinutes, type CandidateRow } from './interview-cover';

export type ReplacementOption = { id: string; name: string; initials: string; free: boolean; note: string | null };

export const NOT_FREE_NOTE = 'Not marked free then';
const LIMIT_NOTE = 'At their limit of';

/** "At their limit of 3". */
export function limitNote(n: number): string {
  return `${LIMIT_NOTE} ${n}`;
}

/** "Not marked free then · at their limit of 3": both at once. */
export function bothNote(n: number): string {
  return `${NOT_FREE_NOTE} · at their limit of ${n}`;
}

/**
 * True when ONE of these free-hours rows covers the whole interview, the rule interview_candidates() uses (rows are not
 * joined: 4 to 5 PM and 5 to 6 PM do not cover 4:30 to 5:30 PM).
 */
export function oneRowCovers(ranges: MinuteRange[], startsAt: string, endsAt: string): boolean {
  const m = slotMinutes(startsAt, endsAt);
  return ranges.some((r) => r.day === m.day && r.startMin <= m.startMin && r.endMin >= m.endMin);
}

/** True when picking this person adds the interview time to their free hours (anyone not free, unless the only reason is their limit). */
export function needsRange(o: Pick<ReplacementOption, 'free' | 'note'>): boolean {
  return !o.free && !(o.note ?? '').startsWith(LIMIT_NOTE);
}

export type OptionsInput = {
  /** Everyone on staff (admins and board members are kept; other roles are dropped). */
  staff: { userId: string; name: string; initials?: string | null; role: string }[];
  /** The two on the interview now. */
  pair: string[];
  /** interview_candidates() for this interview: the people the database would pick. */
  candidates: CandidateRow[];
  /** conflicted_board_members(application): people who know the student. */
  conflicted: string[];
  /** Every other pairing in the cycle (this interview's own left out), once per interviewer. */
  held: { userId: string; startsAt: string; endsAt: string }[];
  /** Each person's free hours for the cycle. */
  ranges: Map<string, MinuteRange[]>;
  /** Each person's "Most N interviews" (missing = no limit). */
  limits: Map<string, number>;
  /** The interview's time. */
  startsAt: string;
  endsAt: string;
};

/** The list for the Change sheet: free people first (least loaded first), then everyone else by name with a note. */
export function replacementOptions(input: OptionsInput): ReplacementOption[] {
  const { startsAt, endsAt } = input;
  const conflicted = new Set(input.conflicted);
  const busy = new Set(input.held.filter((h) => h.startsAt < endsAt && startsAt < h.endsAt).map((h) => h.userId));
  const out = (id: string) => input.pair.includes(id) || conflicted.has(id) || busy.has(id);
  const staff = new Map(input.staff.filter((s) => s.role === 'admin' || s.role === 'board').map((s) => [s.userId, s]));
  const ini = (name: string, given?: string | null) => (given ?? '').trim() || initialsFrom(name);

  const free: ReplacementOption[] = replacements(input.candidates, input.pair)
    .filter((c) => !out(c.userId))
    .map((c) => {
      const s = staff.get(c.userId);
      const name = s?.name?.trim() || c.name;
      return { id: c.userId, name, initials: ini(name, s?.initials), free: true, note: null };
    });
  const freeIds = new Set(free.map((f) => f.id));

  const counts = new Map<string, number>();
  for (const h of input.held) counts.set(h.userId, (counts.get(h.userId) ?? 0) + 1);

  const rest: ReplacementOption[] = [...staff.values()]
    .filter((s) => !freeIds.has(s.userId) && !out(s.userId))
    .map((s) => {
      const name = s.name.trim() || 'A board member';
      const limit = input.limits.get(s.userId);
      const covered = oneRowCovers(input.ranges.get(s.userId) ?? [], startsAt, endsAt);
      const atLimit = limit !== undefined && (counts.get(s.userId) ?? 0) >= limit;
      // Not a candidate for an unexplained reason: treated as not free, so a pick adds the time to their free hours.
      const note = atLimit ? (covered ? limitNote(limit as number) : bothNote(limit as number)) : NOT_FREE_NOTE;
      return { id: s.userId, name, initials: ini(name, s.initials), free: false, note };
    })
    .sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id));

  return [...free, ...rest];
}

/**
 * The free-hours row that makes a picked person free for the whole interview: its Eastern day, start rounded down and end
 * rounded up to the half hour (the table stores half hours only), never past midnight.
 */
export function coverRange(startsAt: string, endsAt: string): MinuteRange {
  const m = slotMinutes(startsAt, endsAt);
  const startMin = Math.floor(m.startMin / 30) * 30;
  const endMin = Math.min(1440, Math.max(startMin + 30, Math.ceil(m.endMin / 30) * 30));
  return { day: m.day, startMin, endMin };
}

/** "5:00 to 5:30 PM", or "11:30 AM to 12:00 PM" when the halves of the day differ. `clock` gives "5:30 PM". */
export function timeRangeWords(startClock: string, endClock: string): string {
  const [s, sp] = startClock.split(' ');
  const [, ep] = endClock.split(' ');
  return sp && sp === ep ? `${s} to ${endClock}` : `${startClock} to ${endClock}`;
}

/** The line above Save when the pick is not free, or null when they are. `when` is "5:00 to 5:30 PM" (null when unknown). */
export function pickWarning(option: Pick<ReplacementOption, 'name' | 'free' | 'note'>, when: string | null): string | null {
  if (option.free) return null;
  const first = option.name.trim().split(/\s+/)[0] || option.name;
  const lead = `Only pick ${first} if they agreed.`;
  if (option.note?.startsWith(LIMIT_NOTE)) return `${lead} This puts them over their limit.`;
  const adds = `Saving adds ${when ?? 'the interview time'} to their free hours`;
  if (option.note?.includes('at their limit')) return `${lead} ${adds} and puts them over their limit.`;
  return `${lead} ${adds}.`;
}
