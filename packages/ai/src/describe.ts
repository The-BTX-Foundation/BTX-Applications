import { MONTHS, toMinutes, weekdayName } from './dates';
import type { Range } from './index';

function clock(min: number): { text: string; ampm: 'AM' | 'PM' } {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { text: `${h12}:${String(m).padStart(2, '0')}`, ampm: h24 < 12 ? 'AM' : 'PM' };
}

function span(r: Range): string | null {
  const s = toMinutes(r.start);
  const e = toMinutes(r.end);
  if (s === null || e === null) return null;
  const a = clock(s);
  const b = clock(e);
  // "5:00 to 9:00 PM" reads better than "5:00 PM to 9:00 PM" when both halves share AM/PM.
  return a.ampm === b.ampm ? `${a.text} to ${b.text} ${b.ampm}` : `${a.text} ${a.ampm} to ${b.text} ${b.ampm}`;
}

/** One plain line per day ("Tue Nov 10: 5:00 to 9:00 PM") so a screen can read the ranges back to the person. */
export function describeRanges(ranges: Range[]): string[] {
  const days = new Map<string, string[]>();
  for (const r of ranges) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.day);
    const text = span(r);
    if (!m || !text) continue;
    days.set(r.day, [...(days.get(r.day) ?? []), text]);
  }
  return [...days.keys()].sort().map((day) => {
    const [, mo, d] = /^\d{4}-(\d{2})-(\d{2})$/.exec(day)!;
    return `${weekdayName(day)} ${MONTHS[+mo - 1]} ${+d}: ${days.get(day)!.join(', ')}`;
  });
}
