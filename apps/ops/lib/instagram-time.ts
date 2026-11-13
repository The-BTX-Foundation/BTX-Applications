// The Instagram page's own date words and the "Add a post" line reader (demo p-instagram). Pure; everything is counted
// from the view's `today` (an Eastern calendar day), so server and browser draw the same words. Shared day math is in
// lib/refresh-time.ts.
import { addDays, atDay, daysFrom, shortDate, snoozeDays, weekday } from './refresh-time';
import type { IgPerson } from './instagram-view';

/**
 * A post's date in plain words, the demo's rule: "Today", "Tomorrow", "Thu" (up to 5 days out), "Next Wed" (up to 12),
 * else "Mon Nov 2"; a past date reads as its short date, never "late" (a post that went out is not late).
 */
export function postRel(today: string, day: string | null): string {
  if (!day) return 'No date';
  const n = daysFrom(today, day);
  if (n < 0) return shortDate(day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n <= 5) return weekday(day);
  if (n <= 12) return `Next ${weekday(day)}`;
  return shortDate(day);
}

const MONTHS: [RegExp, number][] = [
  [/^jan(uary)?$/, 1],
  [/^feb(ruary)?$/, 2],
  [/^mar(ch)?$/, 3],
  [/^apr(il)?$/, 4],
  [/^may$/, 5],
  [/^june?$/, 6],
  [/^july?$/, 7],
  [/^aug(ust)?$/, 8],
  [/^sept?(ember)?$/, 9],
  [/^oct(ober)?$/, 10],
  [/^nov(ember)?$/, 11],
  [/^dec(ember)?$/, 12],
];
const MONTH_WORDS = 'jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december';
const WEEKDAY_WORDS = 'mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday';
const MONTH_DAY = new RegExp(`\\b(?:(?:on|by|due)\\s+)?((?:${MONTH_WORDS})\\s+\\d{1,2})\\b`, 'i');
const ANY_DAY = new RegExp(`\\b(?:(?:on|by|due)\\s+)?(today|tomorrow|tmrw|next week|(?:${MONTH_WORDS})\\s+\\d{1,2}|${WEEKDAY_WORDS})\\b`, 'i');
const WD3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The calendar day a date word means, counted from `today`: today, tomorrow, "next week" (next Monday), a weekday (its
 * next one, 1 to 7 days out), or a month and day (this year, or next year once the day has passed). Null when the day
 * does not exist ("feb 31").
 */
export function dayFromWord(word: string, today: string): string | null {
  const w = word.toLowerCase().replace(/\s+/g, ' ').trim();
  if (w === 'today') return today;
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
  if (w === 'next week') return snoozeDays(today).nextMonday;
  const md = /^([a-z]+) (\d{1,2})$/.exec(w);
  if (md) {
    const month = MONTHS.find(([rx]) => rx.test(md[1]))?.[1];
    const d = Number(md[2]);
    if (!month) return null;
    let year = Number(today.slice(0, 4));
    const ok = (y: number) => d >= 1 && d <= new Date(Date.UTC(y, month, 0)).getUTCDate();
    if (!ok(year)) return null;
    if (`${year}-${pad(month)}-${pad(d)}` < today) year += 1;
    if (!ok(year)) return null;
    return `${year}-${pad(month)}-${pad(d)}`;
  }
  const idx = WD3.indexOf(w.slice(0, 3));
  if (idx < 0) return null;
  const now = atDay(today).getUTCDay();
  return addDays(today, (idx - now + 7) % 7 || 7);
}

/** Which of the read parts the person tapped away (a dismissed part is no longer read from the words). */
export type Dismissed = { date?: boolean; owner?: boolean };

/** What one typed line says: the title, the day (or null) and the owner (or null). */
export type ReadPost = { title: string; due: string | null; owner: IgPerson | null };

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads "Thank our donors dec 2 camila": a month and day wins over a weekday inside a name ("Giving Tuesday"); a board
 * member's first or last name sets the owner (and is dropped from the title when it is the last of three or more words);
 * the rest, tidied and capitalized, is the title.
 */
export function readPostLine(text: string, today: string, staff: IgPerson[], dismissed: Dismissed = {}): ReadPost {
  let title = text;
  let due: string | null = null;
  let owner: IgPerson | null = null;
  const dm = MONTH_DAY.exec(text) ?? ANY_DAY.exec(text);
  if (dm && !dismissed.date) {
    due = dayFromWord(dm[1], today);
    if (due) title = title.replace(dm[0], ' ');
  }
  if (!dismissed.owner) {
    for (const person of staff) {
      const parts = person.name.split(/\s+/).filter(Boolean);
      if (!parts.length) continue;
      const rx = new RegExp(`\\b(${parts.map(escRx).join('|')})\\b`, 'i');
      const m = rx.exec(title);
      if (!m) continue;
      owner = person;
      const words = title.trim().split(/\s+/);
      if (words.length >= 3 && words[words.length - 1].toLowerCase() === m[0].toLowerCase()) title = words.slice(0, -1).join(' ');
      break;
    }
  }
  title = title.replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, due, owner };
}
