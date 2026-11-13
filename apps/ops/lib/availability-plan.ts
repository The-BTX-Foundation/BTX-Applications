// Interviews > Your availability: the page's pure logic (no React, no database). Free time is held per day as spans of
// minutes from midnight ([1020, 1260] = 5 to 9 PM, Eastern wall clock); every edit returns new spans, merged and sorted.
// The words follow the demo (p-availability): "5 to 9 PM", "Thu Nov 12", "Sent Mon Nov 2, 6:14 PM", "Free on 8 of 11 days".
import { rangeText } from './availability-grid';
import type { MinuteRange } from './free-ranges';
import { clock, easternDay, shortDate, weekday } from './refresh-time';
import type { AvBooking } from './availability-view';

/** Free time per day: "2026-11-12" -> [[1020, 1260]]. Every window day has a list (empty = not free). */
export type Spans = Record<string, [number, number][]>;

/** The line draws 8 AM to 10 PM. */
export const H0 = 8 * 60;
export const H1 = 22 * 60;
export const SPAN = H1 - H0;
/** An interview takes half an hour. */
export const SLOT = 30;
/** "Most interviews" runs 1 to 50 (the save action's own bounds). */
export const MAX_LIMIT = 50;

/** The axis labels: minute, words, and which ones hide on narrow screens ("odd" on mid laptops and phones, "last" on phones). */
export const TICKS: [number, string, string][] = [
  [480, '8 AM', ''],
  [600, '10 AM', 'odd'],
  [720, '12 PM', ''],
  [840, '2 PM', 'odd'],
  [960, '4 PM', ''],
  [1080, '6 PM', 'odd'],
  [1200, '8 PM', ''],
  [1320, '10 PM', 'last'],
];

/** A minute's place on the track, as a CSS percentage ("64.286%"). */
export function pct(m: number): string {
  return `${(((m - H0) / SPAN) * 100).toFixed(3)}%`;
}

/** The half hour under a pointer at `x` on a track that starts at `left` and is `width` wide (clamped to the track). */
export function minuteAt(x: number, left: number, width: number): number {
  const cells = SPAN / SLOT;
  const k = Math.floor(((x - left) / width) * cells);
  return H0 + Math.max(0, Math.min(cells - 1, k)) * SLOT;
}

/** "5 to 9 PM", "10 AM to 2 PM", "5:30 to 6 PM". */
export const fmtR = (s: number, e: number): string => rangeText(s, e);

/** 1050 -> "5:30 PM", 1020 -> "5:00 PM" (a booked interview's time, as the demo writes it). */
export function clockLong(m: number): string {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

/** True for a Saturday or Sunday. */
export function isWeekendDay(day: string): boolean {
  const w = weekday(day);
  return w === 'Sat' || w === 'Sun';
}

/** "12" from "2026-11-12". */
export function dom(day: string): string {
  return String(Number(day.slice(8, 10)));
}

/** The days in words: one day "Sat Nov 14"; two or three "Wed 11, Thu 12"; more "6 days". */
export function daysText(days: string[]): string {
  if (days.length === 1) return shortDate(days[0]);
  if (days.length <= 3) return days.map((d) => `${weekday(d)} ${dom(d)}`).join(', ');
  return `${days.length} days`;
}

/** Hours as words: 34 -> "34", 33.5 -> "33.5". */
export function hrs(min: number): string {
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/** Two initials from a name ("Adaeze-Grace Nwachukwu" -> "AG"). */
export function initialsOf(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// Sorts and merges one day's spans (touching or overlapping spans become one).
function mergeList(list: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const l = out[out.length - 1];
    if (l && s <= l[1]) l[1] = Math.max(l[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The saved ranges as spans: one list per window day (ranges outside the window are left out). */
export function toSpans(days: string[], ranges: MinuteRange[]): Spans {
  const out: Spans = {};
  for (const d of days) out[d] = [];
  for (const r of ranges) if (out[r.day] && r.endMin > r.startMin) out[r.day].push([r.startMin, r.endMin]);
  for (const d of days) out[d] = mergeList(out[d]);
  return out;
}

/** The spans back as ranges (by day, then start). */
export function fromSpans(spans: Spans): MinuteRange[] {
  return Object.keys(spans)
    .sort()
    .flatMap((day) => spans[day].map(([s, e]) => ({ day, startMin: s, endMin: e })));
}

/** A copy with [s, e) added on `day` (merged). */
export function addSpan(spans: Spans, day: string, s: number, e: number): Spans {
  return { ...spans, [day]: mergeList([...(spans[day] ?? []), [s, e]]) };
}

/** True when one span on `day` already holds all of [s, e). */
export function covered(spans: Spans, day: string, s: number, e: number): boolean {
  return (spans[day] ?? []).some(([a, b]) => a <= s && b >= e);
}

/**
 * A copy with [s, e) cut out of `day`. A booked half hour always stays free: each booking on that day that the cut
 * uncovers is added back, and returned in `kept` (so the change can say "Kept 5:30 to 6 PM for Ada Okafor").
 */
export function cutSpan(spans: Spans, day: string, s: number, e: number, bookings: AvBooking[]): { spans: Spans; kept: AvBooking[] } {
  const left: [number, number][] = [];
  for (const [a, b] of spans[day] ?? []) {
    if (b <= s || a >= e) left.push([a, b]);
    else {
      if (a < s) left.push([a, s]);
      if (b > e) left.push([e, b]);
    }
  }
  let out: Spans = { ...spans, [day]: left };
  const kept: AvBooking[] = [];
  for (const b of bookings.filter((x) => x.day === day)) {
    if (!covered(out, day, b.min, b.min + SLOT)) {
      out = addSpan(out, day, b.min, b.min + SLOT);
      kept.push(b);
    }
  }
  return { spans: out, kept };
}

/** ". Kept 5:30 to 6 PM for Ada Okafor" for each kept booking ('' when none). */
export function keptText(kept: AvBooking[]): string {
  return kept.map((b) => `. Kept ${fmtR(b.min, b.min + SLOT)} for ${b.applicant}`).join('');
}

/** Total free minutes. */
export function totalMin(spans: Spans): number {
  return Object.values(spans).reduce((n, list) => n + list.reduce((k, [s, e]) => k + e - s, 0), 0);
}

/** How many days have any free time. */
export function freeDays(spans: Spans): number {
  return Object.values(spans).filter((list) => list.length > 0).length;
}

/** The comparable signature of a draft (spans, names, limit): equal signatures mean nothing changed. */
export function draftSig(spans: Spans, conflicts: string[], limit: number | null): string {
  return JSON.stringify({ r: fromSpans(spans), c: conflicts, l: limit });
}

/** The quick picks under the add line: which days, which hours, and the words of the change. */
export function quickPick(pick: 'weekdays' | 'weekends' | 'every', days: string[]): { days: string[]; s: number; e: number; text: string } {
  if (pick === 'weekdays') return { days: days.filter((d) => !isWeekendDay(d)), s: 1020, e: 1260, text: 'Added weekday evenings, 5 to 9 PM' };
  if (pick === 'weekends') return { days: days.filter(isWeekendDay), s: 540, e: 1260, text: 'Added weekends, 9 AM to 9 PM' };
  return { days: [...days], s: 540, e: 1260, text: 'Added every day, 9 AM to 9 PM' };
}

/** The news card under the title. */
export type AvNews = { kicker: string; title: string; go: string; icon: 'plus' | 'video'; gold: boolean; target: 'add' | string };

/**
 * The one news card: nothing while changes wait (the gold Send box is the action); "Nothing added yet" when there is no
 * free time; else the next booked interview (only when bookings are shown); else none.
 */
export function newsFor(spans: Spans, pending: number, bookings: AvBooking[], showBookings: boolean): AvNews | null {
  if (pending) return null;
  if (!totalMin(spans)) return { kicker: 'Nothing added yet', title: 'Your free hours', go: 'Add', icon: 'plus', gold: true, target: 'add' };
  if (!showBookings) return null;
  const bk = [...bookings].sort((a, b) => a.day.localeCompare(b.day) || a.min - b.min)[0];
  if (!bk) return null;
  return { kicker: `Next · ${shortDate(bk.day)}, ${clockLong(bk.min)}`, title: bk.applicant, go: 'See it', icon: 'video', gold: false, target: bk.day };
}

/** "today, 9:14 AM" when sent today (Eastern), else "Mon Nov 2, 6:14 PM". */
export function sentWords(today: string, sentAt: string): string {
  const day = easternDay(sentAt);
  return `${day === today ? 'today' : shortDate(day)}, ${clock(sentAt)}`;
}

/** The Send button: "Send availability" before the first send, then "Send change" / "Send changes". */
export function sendLabel(everSent: boolean, pending: number): string {
  if (!everSent) return 'Send availability';
  return pending === 1 ? 'Send change' : 'Send changes';
}

/** The changes list in the Send box: the last four, then "and N earlier". */
export function changeLog(texts: string[]): { shown: string[]; earlier: number } {
  return { shown: texts.slice(-4), earlier: Math.max(0, texts.length - 4) };
}

/** The lowest "Most interviews" may go: 1, or the number already booked. */
export function limitFloor(booked: number): number {
  return Math.max(1, booked);
}

/** The limit after "+": from no limit, the booked count (at least 1); else one more (at most MAX_LIMIT). */
export function limitPlus(limit: number | null, booked: number): number {
  if (limit === null) return Math.max(booked, 1);
  return Math.min(MAX_LIMIT, limit + 1);
}
