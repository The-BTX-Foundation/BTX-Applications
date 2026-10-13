// Interview times (admin): turning "date + start time" into 30-minute slots in Eastern time, and checking a batch of
// new slots against the cycle's interview window. Pure functions, no database.
import { TIME_ZONE } from './pairing';

export const SLOT_MINUTES = 30;

export type NewSlotInput = { date: string; startTime: string };
export type SlotRow = { startsAt: string; endsAt: string };

// The offset (ms) of Eastern time from UTC at an instant.
function zoneOffset(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}

/** "2026-10-15" + "14:30" as Eastern time -> UTC ISO string, or null when either part is not valid. */
export function easternToUtc(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const wall = Date.UTC(y, mo - 1, da, Number(t[1]), Number(t[2]));
  if (new Date(wall).getUTCMonth() !== mo - 1 || new Date(wall).getUTCDate() !== da) return null; // 2026-02-31
  let guess = wall - zoneOffset(wall);
  guess = wall - zoneOffset(guess);
  return new Date(guess).toISOString();
}

/** The 30-minute slot starting at an Eastern date and time, or null for an invalid date or time. */
export function slotFor(date: string, startTime: string): SlotRow | null {
  const startsAt = easternToUtc(date, startTime);
  if (!startsAt) return null;
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + SLOT_MINUTES * 60_000).toISOString() };
}

export type SlotCheck = { rows: SlotRow[]; errors: string[] };

// Checks a batch: each entry is a real date and time, inside the interview window (inclusive, "YYYY-MM-DD"), after
// `now`, not repeated, not already a slot, and not overlapping another new slot or an existing one.
export function checkNewSlots(opts: { entries: NewSlotInput[]; windowStart: string | null; windowEnd: string | null; existing: SlotRow[]; now: Date }): SlotCheck {
  const errors: string[] = [];
  const rows: SlotRow[] = [];
  if (!opts.windowStart || !opts.windowEnd) return { rows, errors: ['Set the interview dates on the cycle first.'] };
  if (opts.entries.length === 0) return { rows, errors: ['Add at least one time.'] };
  if (opts.entries.length > 200) return { rows, errors: ['Add up to 200 times at once.'] };
  const taken: SlotRow[] = [...opts.existing];
  for (const e of opts.entries) {
    const s = slotFor(e.date, e.startTime);
    if (!s) {
      errors.push(`${e.date} ${e.startTime} is not a valid date and time.`);
      continue;
    }
    if (e.date < opts.windowStart || e.date > opts.windowEnd) {
      errors.push(`${e.date} is outside the interview dates (${opts.windowStart} to ${opts.windowEnd}).`);
      continue;
    }
    if (Date.parse(s.startsAt) <= opts.now.getTime()) {
      errors.push(`${e.date} ${e.startTime} has already passed.`);
      continue;
    }
    if (taken.some((t) => t.startsAt < s.endsAt && s.startsAt < t.endsAt)) {
      errors.push(`${e.date} ${e.startTime} overlaps another interview time.`);
      continue;
    }
    taken.push(s);
    rows.push(s);
  }
  return { rows, errors };
}

/** True when the text is an https link the database accepts (https://, up to 500 characters, no spaces). */
export function isVideoUrl(v: string): boolean {
  if (v.length > 500 || !/^https:\/\/\S+$/.test(v)) return false;
  try {
    return new URL(v).hostname.includes('.');
  } catch {
    return false;
  }
}
