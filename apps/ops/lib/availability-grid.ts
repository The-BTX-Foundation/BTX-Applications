// Pure logic for the "Your availability" screen (Interviews > Your availability): the free-time grid, the quick picks and
// the labels. Free time is a list of MinuteRange (see free-ranges.ts); every edit returns a new, merged list.
import { DAY_MINUTES, STEP_MINUTES, covers, freeMinutes, mergeRanges, type MinuteRange } from './free-ranges';

/** The grid draws 8:00 AM to 10:00 PM in half hours (Eastern). */
export const GRID_START = 8 * 60;
export const GRID_END = 22 * 60;

/** The start minute of each grid row: 480, 510 ... 1290. */
export const GRID_ROWS: number[] = Array.from({ length: (GRID_END - GRID_START) / STEP_MINUTES }, (_, i) => GRID_START + i * STEP_MINUTES);

const parts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
};
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => {
  const { y, m, d } = parts(day);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** "Tue" */
export const weekdayShort = (day: string) => fmt(day, { weekday: 'short' });
/** "10" */
export const dayOfMonth = (day: string) => String(parts(day).d);
/** "Tue Nov 10" */
export const dayText = (day: string) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
/** True for a Saturday or Sunday. */
export const isWeekend = (day: string) => {
  const w = new Date(Date.UTC(parts(day).y, parts(day).m - 1, parts(day).d)).getUTCDay();
  return w === 0 || w === 6;
};

/** 1020 -> "5 PM", 1050 -> "5:30 PM", 1440 -> "12 AM", 0 -> "12 AM". */
export function clockShort(min: number): string {
  const m = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "5 to 9 PM" when both ends share AM or PM, else "10 AM to 2 PM". */
export function rangeText(startMin: number, endMin: number): string {
  const a = clockShort(startMin);
  const b = clockShort(endMin);
  const ap = a.slice(-2);
  return ap === b.slice(-2) ? `${a.slice(0, -3)} to ${b}` : `${a} to ${b}`;
}

/** "Free 32 hours across 8 days", or "Nothing picked yet". */
export function totalsText(ranges: MinuteRange[]): string {
  const min = freeMinutes(ranges);
  if (min === 0) return 'Nothing picked yet';
  const hours = min / 60;
  const days = new Set(mergeRanges(ranges).map((r) => r.day)).size;
  const h = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `Free ${h} ${hours === 1 ? 'hour' : 'hours'} across ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The same totals without the "Free" ("32 hours across 8 days"), for the sent line. */
export function totalsPlain(ranges: MinuteRange[]): string {
  const t = totalsText(ranges);
  return t === 'Nothing picked yet' ? 'No free time picked' : t.replace(/^Free /, '');
}

export const isFree = (ranges: MinuteRange[], day: string, min: number) => covers(ranges, day, min, min + STEP_MINUTES);

/** Adds the time [startMin, endMin) on a day. */
export function addTime(ranges: MinuteRange[], day: string, startMin: number, endMin: number): MinuteRange[] {
  return mergeRanges([...ranges, { day, startMin, endMin }]);
}

/** Takes the time [startMin, endMin) off a day, splitting a range when the cut is in the middle. */
export function removeTime(ranges: MinuteRange[], day: string, startMin: number, endMin: number): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const r of mergeRanges(ranges)) {
    if (r.day !== day || r.endMin <= startMin || r.startMin >= endMin) {
      out.push(r);
      continue;
    }
    if (r.startMin < startMin) out.push({ day, startMin: r.startMin, endMin: startMin });
    if (r.endMin > endMin) out.push({ day, startMin: endMin, endMin: r.endMin });
  }
  return out;
}

/** Sets one half hour free (on) or not free (off). */
export function setCell(ranges: MinuteRange[], day: string, min: number, on: boolean): MinuteRange[] {
  return on ? addTime(ranges, day, min, min + STEP_MINUTES) : removeTime(ranges, day, min, min + STEP_MINUTES);
}

export type QuickPick = 'weekday-evenings' | 'weekends' | 'every-day';

/** What a quick pick adds: weekday evenings 5 to 9 PM, weekends 9 AM to 9 PM, every day 9 AM to 9 PM. */
export function quickPickRanges(pick: QuickPick, days: string[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const day of days) {
    const weekend = isWeekend(day);
    if (pick === 'weekday-evenings' && !weekend) out.push({ day, startMin: 17 * 60, endMin: 21 * 60 });
    if (pick === 'weekends' && weekend) out.push({ day, startMin: 9 * 60, endMin: 21 * 60 });
    if (pick === 'every-day') out.push({ day, startMin: 9 * 60, endMin: 21 * 60 });
  }
  return out;
}

/** The ranges that fall on one day, in order. */
export const rangesOn = (ranges: MinuteRange[], day: string) => mergeRanges(ranges).filter((r) => r.day === day);

/** "", or a whole number 1 to 50 -> the limit; anything else -> undefined (not valid). null = no limit. */
export function parseLimit(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= 50 ? n : undefined;
}
