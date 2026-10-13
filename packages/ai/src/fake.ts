// A stand-in reader for local test runs only, so the "typed availability fills the grid" path can be tried end to end
// before BTX has an API key. Used when BTX_AI_FAKE=1 and the app is not a production build. It understands a few
// phrases and nothing else: "evening(s)" / "after 5" / "after 6", "weekend(s)", "morning(s)" and "all day". Anything
// it can't place is reported back, the same way the real reader does.
import { daysBetween, weekdayIndex } from './dates';
import { normalizeRanges } from './normalize';
import type { Range, ReadResult } from './index';

export function fakeAllowed(): boolean {
  return process.env.BTX_AI_FAKE === '1' && process.env.NODE_ENV !== 'production';
}

export function fakeRead(input: { text: string; windowStart: string; windowEnd: string; dayStart?: string; dayEnd?: string }): ReadResult {
  const t = input.text.toLowerCase();
  const days = daysBetween(input.windowStart, input.windowEnd);
  const weekdays = days.filter((d) => weekdayIndex(d) >= 1 && weekdayIndex(d) <= 5);
  const weekend = days.filter((d) => weekdayIndex(d) === 0 || weekdayIndex(d) === 6);
  const raw: Range[] = [];
  const after = /after (\d{1,2})/.exec(t);
  if (/evening/.test(t) || after) {
    const start = after ? `${String(Math.min(Number(after[1]) + 12, 21)).padStart(2, '0')}:00` : '17:00';
    for (const d of weekdays) raw.push({ day: d, start, end: '21:00' });
  }
  if (/weekend/.test(t)) for (const d of weekend) raw.push({ day: d, start: '09:00', end: '17:00' });
  if (/morning/.test(t)) for (const d of weekdays) raw.push({ day: d, start: '08:00', end: '12:00' });
  if (/all day/.test(t)) for (const d of days) raw.push({ day: d, start: input.dayStart ?? '08:00', end: input.dayEnd ?? '22:00' });
  const ranges = normalizeRanges(raw, { windowStart: input.windowStart, windowEnd: input.windowEnd, dayStart: input.dayStart, dayEnd: input.dayEnd });
  if (ranges.length === 0) return { ok: false, reason: 'unreadable' };
  return { ok: true, ranges, unread: [] };
}
