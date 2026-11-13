// The "Plan a post or issue" parser of the Outreach Plan page, ported from the demo's readLine() (pure, unit tested in
// tests/oplan-parse.test.ts). A month and day of this month or next ("dec 2") or a day word ("tomorrow", "fri", "next
// week") sets the date; a board member's first or last name sets the owner; "newsletter", "email" or "issue" picks the
// Newsletter channel (Instagram otherwise). Days are counted from the view's `today`.
import { addDays, atDay, MO } from './refresh-time';
import { monthKey, nextMonthKey, daysIn } from './oplan-time';
import type { PnChannel, PnPerson } from './oplan-view';

/** Which chips the person removed (a removed chip stops that part being read until the field is emptied). */
export type PnDismissed = { date: boolean; owner: boolean };

/** What the typed line says. */
export type PnParsed = { title: string; due: string | null; owner: string | null; channel: PnChannel };

const MOL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYWORDS = 'today|tomorrow|tmrw|next week|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday';
// Short weekday words that are also ordinary words or name parts ("Sun safety", "Wed"), read only after on/by/due or as
// the line's last word.
const SHORT = new Set(['mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun']);

/**
 * The day word to read, or null. Day words of the demo (today, tomorrow, next week, full weekday names) count anywhere,
 * except a weekday right after "the" or "giving" ("the Friday social", "Giving Tuesday": names, not dates). A short
 * weekday ("fri") counts only after on/by/due or as the last word.
 */
function dayWord(text: string): RegExpExecArray | null {
  const rx = new RegExp(`(?:\\b(on|by|due)\\s+)?\\b(${DAYWORDS})\\b`, 'gi');
  for (let m = rx.exec(text); m; m = rx.exec(text)) {
    const w = m[2].toLowerCase();
    const before = text.slice(0, m.index).trim().split(/\s+/).pop()?.toLowerCase() ?? '';
    if (!m[1] && (before === 'the' || before === 'giving')) continue;
    const last = text.slice(m.index + m[0].length).trim() === '';
    if (SHORT.has(w) && !m[1] && !last) continue;
    return m;
  }
  return null;
}
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Escapes text for use inside a regular expression.
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The month words the parser reads: the short and long names of this month and next ("nov|november|dec|december").
function monthWords(today: string): { words: string; keys: Record<string, string> } {
  const keys: Record<string, string> = {};
  for (const key of [monthKey(today), nextMonthKey(monthKey(today))]) {
    const i = Number(key.slice(5, 7)) - 1;
    keys[MO[i].toLowerCase()] = key;
    keys[MOL[i]] = key;
  }
  // Longest first, so "november" wins over "nov".
  return { words: Object.keys(keys).sort((a, b) => b.length - a.length).join('|'), keys };
}

/** The day a day word means: today, tomorrow, next Monday for "next week", else the next such weekday (never today). */
export function pnDayFrom(today: string, word: string): string {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  if (w === 'today') return today;
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
  const wd = atDay(today).getUTCDay();
  if (w === 'next week') return addDays(today, ((8 - wd) % 7) || 7);
  const idx = DAYS.indexOf(w.slice(0, 3));
  return addDays(today, ((idx - wd + 7) % 7) || 7);
}

/**
 * Reads the typed line. `withChannel` false (live: posts only) always gives Instagram. A dismissed part is not read.
 * The owner's name leaves the title only when it is the last word of a title of three or more words ("Giving Tuesday
 * thanks camila" -> "Giving Tuesday thanks"); a name inside the title ("Meet Keith") stays.
 */
export function readLine(today: string, text: string, people: PnPerson[], dismissed: PnDismissed, withChannel: boolean): PnParsed {
  let title = text;
  let due: string | null = null;
  let owner: string | null = null;
  const { words, keys } = monthWords(today);
  // A month and day ("dec 2") wins over a weekday word inside a name ("Giving Tuesday").
  const md = text.match(new RegExp(`\\b(?:(?:on|by|due)\\s+)?(${words})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  const dw = md ? null : dayWord(text);
  if (!dismissed.date) {
    if (md) {
      const key = keys[md[1].toLowerCase()];
      const d = Number(md[2]);
      if (d >= 1 && d <= daysIn(key)) {
        due = `${key}-${String(d).padStart(2, '0')}`;
        title = title.replace(md[0], ' ');
      }
    } else if (dw) {
      due = pnDayFrom(today, dw[2]);
      title = title.replace(dw[0], ' ');
    }
  }
  if (!dismissed.owner) {
    for (const p of people) {
      const [first, ...rest] = p.name.split(' ');
      const last = rest[rest.length - 1];
      const names = [first, last].filter(Boolean).map(esc);
      if (!names.length) continue;
      // The name counts as the owner only as the line's last word (the demo's "... dec 2 camila") or after "for"/"@"
      // ("for Keith"), so an ordinary word that is also a name ("10 miles") is not read as one.
      const ws = title.trim().split(/\s+/);
      const lastW = ws[ws.length - 1] ?? '';
      const tail = new RegExp(`^(${names.join('|')})$`, 'i').test(lastW);
      const tagged = title.match(new RegExp(`(?:\\bfor\\s+|@)(${names.join('|')})\\b`, 'i'));
      if (!tail && !tagged) continue;
      owner = p.id;
      if (tagged) title = title.replace(tagged[0], ' ');
      else if (ws.length >= 3) title = ws.slice(0, -1).join(' ');
      break;
    }
  }
  const channel: PnChannel = withChannel && /\b(newsletter|email|issue)\b/i.test(text) ? 'Newsletter' : 'Instagram';
  title = title.replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, due, owner, channel };
}
