// Today's own time words: the needs card's due line, interview ticket stubs (Eastern time), what a row may offer, and the
// add-a-task parser that reads a date and an area out of what is typed. The shared words (rel, calendar-week groups,
// short/full dates, snooze days, Eastern clock) live in lib/refresh-time.ts and are re-exported here, so Today's imports
// stay as they were. Reference: the demo's script (apps/design/ops-refresh/directions/p-today-states/index.html).
import { addDays, atDay, clock, daysFrom, daysToSunday, easternDay, fullDate, MO, shortDate, snoozeDays, WD, weekday, type WeekGroup } from '@/lib/refresh-time';

export { addDays, clock, daysFrom, daysToSunday, dueTitle, easternDay, fullDate, groupOf, rel, shortDate, snoozeDays, weekday } from '@/lib/refresh-time';

/** Where a task sits on Today (the shared calendar-week groups). */
export type TodayGroup = WeekGroup;

/** The groups in the order the list draws them, with their headings. */
export const TODAY_GROUPS: [TodayGroup, string][] = [
  ['late', 'Late'],
  ['week', 'This week'],
  ['next', 'Next week'],
  ['later', 'Later'],
  ['wait', 'Waiting on others'],
];

/**
 * What a task row may offer. A prompt that is not a stored task (`stored === false`) has nothing to tick or snooze, and an
 * approval is done only on its own page unless `approveInPlace` (no check, no snooze, no swipe tray: only its link).
 */
export function rowActions(t: { kind: string; stored?: boolean }, caps: { done: boolean; snooze: boolean; approveInPlace: boolean }): { done: boolean; snooze: boolean } {
  if (t.stored === false || (t.kind === 'approval' && !caps.approveInPlace)) return { done: false, snooze: false };
  return { done: caps.done, snooze: caps.snooze };
}

/** The needs card's due line: "Due today", "Due tomorrow", "Due Thu", "Due Thu Nov 19", or "2 days late". */
export function dueWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} late`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  // This calendar week (through Sunday) reads as the weekday; later dates as the short date.
  if (n <= daysToSunday(today)) return `Due ${weekday(day)}`;
  return `Due ${shortDate(day)}`;
}

/** An interview ticket's words: the stub (Thu / 12 / Nov), the time, how far away it is, and the full day for screen readers. */
export function ticketTime(today: string, startsAt: string): { wd: string; day: number; mon: string; time: string; away: string; full: string } {
  const day = easternDay(startsAt);
  const d = atDay(day);
  const n = daysFrom(today, day);
  // Calendar weeks (Mon to Sun), like the task groups: "in N days" this week, "next Wed" next week, then the date.
  const toSun = daysToSunday(today);
  const away = n <= 0 ? 'today' : n === 1 ? 'tomorrow' : n <= toSun ? `in ${n} days` : n <= toSun + 7 ? `next ${weekday(day)}` : shortDate(day);
  return { wd: WD[d.getUTCDay()], day: d.getUTCDate(), mon: MO[d.getUTCMonth()], time: clock(startsAt), away, full: fullDate(day).replace(',', '') };
}

/* ---------- Add a task in place: reads a day and an area out of the typed words ---------- */

const DAYRX = /\b(?:(?:on|by|due)\s+)?(today|tonight|tomorrow|tmrw|tmr|next week|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i;
const AREA_WORDS: [RegExp, string][] = [
  [/\b(budget|budgets|finance|finances|money|donation|donations|grant|grants)\b/i, 'Finance'],
  [/\b(instagram|post|posts|newsletter|outreach|caption)\b/i, 'Outreach'],
  [/\b(interview|interviews|applicant|applicants|score|scores|scoring|scholarship|scholarships)\b/i, 'Scholarships'],
  [/\b(certification|certifications|program|programs|mentorship|sponsorship|sponsorships)\b/i, 'Programs'],
];

/** The day a typed word means, counted from `today`: today, tomorrow, next week (= next Monday, like Snooze), or the next such weekday. */
export function dayFromWord(today: string, word: string): string {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  if (w === 'today' || w === 'tonight') return today;
  if (/^(tomorrow|tmrw|tmr)$/.test(w)) return addDays(today, 1);
  if (w === 'next week') return snoozeDays(today).nextMonday;
  const idx = WD.map((x) => x.toLowerCase()).indexOf(w.slice(0, 3));
  const wd = atDay(today).getUTCDay();
  return addDays(today, ((idx - wd + 7) % 7) || 7);
}

/** What the add field read: the cleaned title, the due day (or null) and the area name (or null). */
export type ParsedTask = { title: string; dueOn: string | null; area: string | null };

/**
 * Reads "Call the venue fri" as title "Call the venue", due Friday. A word like "budget" sets the area; a trailing area
 * word reads as a tag and is dropped from the title when at least four words remain. `dismissed` turns either guess off
 * (the person tapped its chip away).
 */
export function parseTask(today: string, text: string, dismissed: { date: boolean; area: boolean } = { date: false, area: false }): ParsedTask {
  let title = text;
  let dueOn: string | null = null;
  let area: string | null = null;
  const dm = text.match(DAYRX);
  if (dm && !dismissed.date) {
    dueOn = dayFromWord(today, dm[1]);
    title = title.replace(dm[0], ' ');
  }
  // The area whose word comes first in the text wins.
  let best: { m: RegExpMatchArray; name: string } | null = null;
  for (const [rx, name] of AREA_WORDS) {
    const m = text.match(rx);
    if (m && (!best || (m.index ?? 0) < (best.m.index ?? 0))) best = { m, name };
  }
  if (best && !dismissed.area) {
    area = best.name;
    const words = title.trim().split(/\s+/);
    if (words.length >= 4 && words[words.length - 1].toLowerCase() === best.m[0].toLowerCase()) title = words.slice(0, -1).join(' ');
  }
  title = title.replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, dueOn, area };
}
