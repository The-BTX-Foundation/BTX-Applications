// Free time ranges (the new interview flow): a board member's "I'm free on this day from 9:00 to 12:30", in Eastern
// wall-clock time. Pure functions, no database. The database stores minutes from midnight in multiples of 30
// (`board_free_ranges.start_min` / `end_min`, migration 20261013090300_interview_flow.sql); screens and the Portal
// use "HH:MM" strings.
import { TIME_ZONE, type Block } from './pairing';

/** One free range as screens use it: "2026-10-15", "09:00", "12:30" (Eastern). "24:00" is midnight at the end. */
export type Range = { day: string; start: string; end: string };
/** The same range in minutes from midnight, as the database stores it. */
export type MinuteRange = { day: string; startMin: number; endMin: number };

export const DAY_MINUTES = 1440;
export const STEP_MINUTES = 30;

/** "09:30" -> 570, "24:00" -> 1440, or null when it is not a time. */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v <= DAY_MINUTES ? v : null;
}

/** 570 -> "09:30", 1440 -> "24:00". */
export function toHHMM(min: number): string {
  const v = Math.max(0, Math.min(DAY_MINUTES, Math.round(min)));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** A screen range in minutes, or null when the day or a time is not valid. */
export function toMinuteRange(r: Range): MinuteRange | null {
  const s = toMinutes(r.start);
  const e = toMinutes(r.end);
  if (!isDay(r.day) || s === null || e === null) return null;
  return { day: r.day, startMin: s, endMin: e };
}

export function toRange(m: MinuteRange): Range {
  return { day: m.day, start: toHHMM(m.startMin), end: toHHMM(m.endMin) };
}

/** Every day of the interview window, "2026-10-15" ... (at most 31). Empty when a date is missing. */
export function windowDays(start: string | null, end: string | null): string[] {
  if (!start || !end || end < start) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); out.length < 31 && new Date(t).toISOString().slice(0, 10) <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// Cleans a list of ranges: the start rounds down and the end rounds up to the half hour, everything stays inside the
// day (0 to 24:00) and inside the window's days (when a window is given), overlapping or touching ranges on the same
// day become one, and the result is sorted by day and start. Empty ranges are dropped.
export function mergeRanges(ranges: MinuteRange[], window?: { start: string | null; end: string | null }): MinuteRange[] {
  const days = window ? new Set(windowDays(window.start, window.end)) : null;
  const byDay = new Map<string, MinuteRange[]>();
  for (const r of ranges) {
    if (!isDay(r.day) || (days && !days.has(r.day))) continue;
    const s = Math.max(0, Math.floor(r.startMin / STEP_MINUTES) * STEP_MINUTES);
    const e = Math.min(DAY_MINUTES, Math.ceil(r.endMin / STEP_MINUTES) * STEP_MINUTES);
    if (!(e > s)) continue;
    const list = byDay.get(r.day) ?? [];
    list.push({ day: r.day, startMin: s, endMin: e });
    byDay.set(r.day, list);
  }
  const out: MinuteRange[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const list = byDay.get(day)!.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    let cur: MinuteRange | null = null;
    for (const r of list) {
      if (cur && r.startMin <= cur.endMin) cur.endMin = Math.max(cur.endMin, r.endMin);
      else {
        if (cur) out.push(cur);
        cur = { ...r };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** The same cleaning for screen ranges. Ranges with a bad day or time are dropped. */
export function cleanRanges(ranges: Range[], window?: { start: string | null; end: string | null }): Range[] {
  return mergeRanges(
    ranges.map(toMinuteRange).filter((r): r is MinuteRange => r !== null),
    window,
  ).map(toRange);
}

/** Total free minutes (overlaps counted once). */
export function freeMinutes(ranges: MinuteRange[]): number {
  return mergeRanges(ranges).reduce((sum, r) => sum + (r.endMin - r.startMin), 0);
}

/** True when the ranges cover all of [startMin, endMin) on that day (one range has to hold it all, after merging). */
export function covers(ranges: MinuteRange[], day: string, startMin: number, endMin: number): boolean {
  return ranges.some((r) => r.day === day && r.startMin <= startMin && r.endMin >= endMin);
}

// ---- the old Morning / Afternoon / Evening blocks (D4) --------------------------------------------------------------

/** What each old block means as a range: Morning 9 to 12, Afternoon 12 to 5, Evening 5 to 9 (Eastern). */
export const BLOCK_RANGE: Record<Block, { startMin: number; endMin: number }> = {
  morning: { startMin: 540, endMin: 720 },
  afternoon: { startMin: 720, endMin: 1020 },
  evening: { startMin: 1020, endMin: 1260 },
};

/** Old block picks as merged ranges ("morning" + "afternoon" on one day = 9:00 to 17:00). */
export function blocksToRanges(picks: { day: string; block: Block }[]): MinuteRange[] {
  return mergeRanges(picks.map((p) => ({ day: p.day, ...BLOCK_RANGE[p.block] })));
}

/** The blocks a set of ranges fully covers, so the old screens can still show them. */
export function rangesToBlocks(ranges: MinuteRange[]): { day: string; block: Block }[] {
  const merged = mergeRanges(ranges);
  const out: { day: string; block: Block }[] = [];
  for (const day of [...new Set(merged.map((r) => r.day))]) {
    for (const block of ['morning', 'afternoon', 'evening'] as const) {
      if (covers(merged, day, BLOCK_RANGE[block].startMin, BLOCK_RANGE[block].endMin)) out.push({ day, block });
    }
  }
  return out;
}

// ---- instants in Eastern time ----------------------------------------------------------------------------------------

/** An instant as its Eastern day and minutes from midnight: "2026-10-15T14:00:00Z" -> { day: "2026-10-15", min: 600 }. */
export function easternDayMinutes(iso: string): { day: string; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')) };
}
