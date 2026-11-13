// The "Add a task" parser of the Certifications page (mock mode only: no live write takes a due date or an owner yet).
// A day word ("fri", "tomorrow", "next week", "dec 4") sets the due date and a board member's first name ("Toby") sets
// the owner; both come out of the title. Ported from the demo's parse(); pure, so it is unit tested
// (tests/cert-parse.test.ts). Days are counted from the view's `today`.
import { addDays, atDay, MO } from './refresh-time';
import type { CertPerson } from './cert-view';

/** Which chips the person removed (a removed chip stops that part being read until the field is emptied). */
export type Dismissed = { date: boolean; owner: boolean };

/** What the typed text says: the title left over, the due day, the owner's id. */
export type ParsedTask = { title: string; due: string | null; owner: string | null };

const DAYRX = /\b(?:(?:on|by|due)\s+)?(today|tomorrow|next week|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i;
const MDRX = /\b(?:(?:on|by|due)\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Escapes a name for use inside a regular expression.
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The day a day word means: today, tomorrow, next Monday for "next week", else the next such weekday (never today). */
export function dayFrom(today: string, word: string): string {
  const w = word.toLowerCase();
  if (w === 'today') return today;
  if (w === 'tomorrow') return addDays(today, 1);
  const wd = atDay(today).getUTCDay();
  if (w === 'next week') return addDays(today, ((8 - wd) % 7) || 7);
  const idx = DAYS.indexOf(w.slice(0, 3));
  return addDays(today, ((idx - wd + 7) % 7) || 7);
}

// "2026-12-04" for month index `m` and day `d`: this year, or next year when the month has passed.
function monthDay(today: string, m: number, d: number): string | null {
  const y = Number(today.slice(0, 4)) + (m < Number(today.slice(5, 7)) - 1 ? 1 : 0);
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCMonth() !== m || d < 1) return null;
  return date.toISOString().slice(0, 10);
}

/** Reads the typed text: a month and day (or a day word) for the due date, a first name for the owner; the rest is the title. */
export function parseTask(today: string, text: string, people: CertPerson[], dismissed: Dismissed): ParsedTask {
  let title = text;
  let due: string | null = null;
  let owner: string | null = null;
  const md = text.match(MDRX);
  const dm = text.match(DAYRX);
  if (md && !dismissed.date) {
    const m = MO.findIndex((x) => x.toLowerCase() === md[1].slice(0, 3).toLowerCase());
    due = monthDay(today, m, Number(md[2]));
    if (due) title = title.replace(md[0], ' ');
  } else if (dm && !dismissed.date) {
    due = dayFrom(today, dm[1]);
    title = title.replace(dm[0], ' ');
  }
  if (!dismissed.owner) {
    for (const p of people) {
      const first = p.name.split(' ')[0];
      if (!first) continue;
      const m = title.match(new RegExp(`\\b(?:(?:for|with|to)\\s+)?${esc(first)}\\b`, 'i'));
      if (m) {
        owner = p.id;
        title = title.replace(m[0], ' ');
        break;
      }
    }
  }
  title = title.replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, due, owner };
}
