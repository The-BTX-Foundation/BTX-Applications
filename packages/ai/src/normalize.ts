import { daysBetween, fromMinutes, isDay, toMinutes } from './dates';
import type { Range } from './index';

const STEP = 30;

/**
 * Cleans up what the model returned so the screens only ever see tidy ranges. The model can slip (a day outside the
 * window, 6:10 instead of 6:00, two ranges that overlap), and this is where that gets fixed, not in the prompt.
 *
 * Rounding is start DOWN and end UP to the half hour, so a person's "6:10 to 6:20" becomes 6:00 to 6:30 and never
 * shrinks. A range whose end is not after its start (after clipping and rounding) is dropped.
 */
export function normalizeRanges(
  raw: Range[],
  opts: { windowStart: string; windowEnd: string; dayStart?: string; dayEnd?: string },
): Range[] {
  const lo = toMinutes(opts.dayStart ?? '08:00') ?? 8 * 60;
  const hi = toMinutes(opts.dayEnd ?? '22:00') ?? 22 * 60;
  if (!Array.isArray(raw) || !isDay(opts.windowStart) || !isDay(opts.windowEnd) || hi <= lo) return [];
  const inWindow = new Set(daysBetween(opts.windowStart, opts.windowEnd));

  const byDay = new Map<string, Array<[number, number]>>();
  for (const r of raw) {
    if (!r || typeof r !== 'object' || !isDay(r.day) || !inWindow.has(r.day)) continue;
    const s0 = toMinutes(r.start);
    const e0 = toMinutes(r.end);
    if (s0 === null || e0 === null) continue;
    // Clip to the day bounds first, so a range that sits wholly outside them disappears.
    const s1 = Math.max(s0, lo);
    const e1 = Math.min(e0, hi);
    if (e1 <= s1) continue;
    const start = Math.max(Math.floor(s1 / STEP) * STEP, lo);
    const end = Math.min(Math.ceil(e1 / STEP) * STEP, hi);
    const list = byDay.get(r.day) ?? [];
    list.push([start, end]);
    byDay.set(r.day, list);
  }

  const out: Range[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const sorted = byDay.get(day)!.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = sorted[0];
    const merged: Array<[number, number]> = [];
    for (const next of sorted.slice(1)) {
      // Touching ranges (one ends where the next starts) join into one.
      if (next[0] <= cur[1]) cur = [cur[0], Math.max(cur[1], next[1])];
      else {
        merged.push(cur);
        cur = next;
      }
    }
    merged.push(cur);
    for (const [s, e] of merged) out.push({ day, start: fromMinutes(s), end: fromMinutes(e) });
  }
  return out;
}
