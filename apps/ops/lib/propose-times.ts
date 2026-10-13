// Proposed interview times (admins): 30-minute times where at least two board members are free, spread across the
// interview days. Pure functions, no database. The Ops Hub saves them as un-opened interview_slots (opened_at null)
// for admins to review before students see them.
import { covers, windowDays, STEP_MINUTES, type MinuteRange } from './free-ranges';
import { easternToUtc } from './pairing-slots';

/** One person's free range (Eastern minutes, as board_free_ranges stores it). */
export type FreeRangeRow = { userId: string; day: string; startMin: number; endMin: number };

export type ProposedTime = {
  /** Eastern date and start, "2026-10-15", "10:30". */
  day: string;
  time: string;
  /** UTC ISO instants for interview_slots. */
  startsAt: string;
  endsAt: string;
  /** How many board members are free for the whole 30 minutes. */
  freeCount: number;
};

export type ProposeInput = {
  windowStart: string | null;
  windowEnd: string | null;
  ranges: FreeRangeRow[];
  /** Submitted applicants who need a time. */
  applicants: number;
  /** Times that already exist (opened or proposed); a new time never overlaps one. 30 minutes each. */
  existing: { startsAt: string }[];
  now: Date;
};

/** How many board members are free for all of [startMin, endMin) on that Eastern day. */
export function freeCountAt(ranges: FreeRangeRow[], day: string, startMin: number, endMin: number): number {
  const byUser = new Map<string, MinuteRange[]>();
  for (const r of ranges) {
    if (r.day !== day) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push({ day: r.day, startMin: r.startMin, endMin: r.endMin });
    byUser.set(r.userId, list);
  }
  let n = 0;
  for (const list of byUser.values()) if (covers(joinRanges(list), day, startMin, endMin)) n += 1;
  return n;
}

// Joins one person's overlapping or touching ranges on a day, exactly as stored (no rounding).
function joinRanges(list: MinuteRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const r of [...list].sort((a, b) => a.startMin - b.startMin)) {
    const last = out[out.length - 1];
    if (last && r.startMin <= last.endMin) last.endMin = Math.max(last.endMin, r.endMin);
    else out.push({ ...r });
  }
  return out;
}

/** How many times to propose for a number of applicants: about 1.3 per applicant, never fewer than 1. */
export function proposalCount(applicants: number): number {
  return Math.max(1, Math.ceil(1.3 * Math.max(0, applicants)));
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Works out the times to propose. Every half hour of every interview day where 2 or more people are free is a
// possible time, unless it has passed or overlaps a time that already exists. About ceil(1.3 x applicants) are
// picked (at least 1 when any time qualifies), taking one per day in turn so the days share the load; within a day
// the times with more people free come first, then the earlier ones. The result is in time order.
export function proposeTimes(input: ProposeInput): ProposedTime[] {
  const days = windowDays(input.windowStart, input.windowEnd);
  const taken = input.existing.map((e) => Date.parse(e.startsAt)).filter((t) => !Number.isNaN(t));
  const slotMs = STEP_MINUTES * 60_000;
  const perDay: ProposedTime[][] = [];
  for (const day of days) {
    const list: ProposedTime[] = [];
    for (let m = 0; m + STEP_MINUTES <= 1440; m += STEP_MINUTES) {
      const freeCount = freeCountAt(input.ranges, day, m, m + STEP_MINUTES);
      if (freeCount < 2) continue;
      const startsAt = easternToUtc(day, hhmm(m));
      if (!startsAt) continue;
      const t = Date.parse(startsAt);
      if (t <= input.now.getTime()) continue;
      if (taken.some((x) => x < t + slotMs && t < x + slotMs)) continue;
      list.push({ day, time: hhmm(m), startsAt, endsAt: new Date(t + slotMs).toISOString(), freeCount });
    }
    list.sort((a, b) => b.freeCount - a.freeCount || a.startsAt.localeCompare(b.startsAt));
    if (list.length > 0) perDay.push(list);
  }
  const want = proposalCount(input.applicants);
  const picked: ProposedTime[] = [];
  for (let round = 0; picked.length < want; round += 1) {
    let any = false;
    for (const list of perDay) {
      if (picked.length >= want) break;
      if (round < list.length) {
        picked.push(list[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return picked.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
