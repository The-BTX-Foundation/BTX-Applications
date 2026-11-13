// Interviews > Your availability: reads a typed line of free time ("sat 10 to 2", "thu 5-9pm", "weekdays after 5 except
// tue", "nov 12 6 to 8") into days and hours, on the page itself (no AI call; the demo's parser over the real window).
// Pure. Days are "YYYY-MM-DD" calendar days of the interview window; hours are minutes from midnight, Eastern.
import { H0, H1 } from './availability-plan';
import { addDays, shortDate, weekday, WD } from './refresh-time';

/** What a typed line says: the days, the hours (null when none), and the one problem to show (null when it's fine). */
export type Parsed = { days: string[]; s: number | null; e: number | null; err: string | null };

const DW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAYRE = /\b(next\s+)?(today|tomorrow|tmrw|mondays?|mon|tuesdays?|tues?|wednesdays?|weds?|thursdays?|thurs?|thu|fridays?|fri|saturdays?|sat|sundays?|sun)\b/g;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATERE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})(?:st|nd|rd|th)?\b/g;
const T = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a|p)?';

/** The window the parser reads against: its days in order and today's Eastern day. */
export type ParseWindow = { days: string[]; today: string };

const isWkend = (d: string) => {
  const w = weekday(d);
  return w === 'Sat' || w === 'Sun';
};

// A weekday word as a calendar day: "today", "tomorrow", or the next such weekday counted from the window's first day
// (or today, when the window has started); "next" adds a week.
function dayFromWord(w: string, next: boolean, win: ParseWindow): string {
  if (w === 'today') return win.today;
  if (/^(tomorrow|tmrw)$/.test(w)) return addDays(win.today, 1);
  const first = win.days[0] ?? win.today;
  const anchor = win.today > first ? win.today : first;
  const from = WD.indexOf(weekday(anchor));
  return addDays(anchor, ((DW.indexOf(w.slice(0, 3)) - from + 7) % 7) + (next ? 7 : 0));
}

// "nov 12" as a calendar day: the window day with that month and date, else that date in the window's year.
function dayFromDate(mon: string, date: number, win: ParseWindow): string {
  const m = MONTHS.indexOf(mon.slice(0, 3)) + 1;
  const hit = win.days.find((d) => Number(d.slice(5, 7)) === m && Number(d.slice(8, 10)) === date);
  if (hit) return hit;
  const year = (win.days[0] ?? win.today).slice(0, 4);
  return `${year}-${String(m).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
}

// Adds the days a phrase names to `set`; returns the group word it used ("every", "weekdays", "weekends") or null.
function takeDays(str: string, set: Set<string>, win: ParseWindow): string | null {
  let kind: string | null = null;
  if (/\b(every ?day|daily|all days|all week)\b/.test(str)) {
    win.days.forEach((d) => set.add(d));
    kind = 'every';
  }
  if (/\bweekdays?\b/.test(str)) {
    win.days.filter((d) => !isWkend(d)).forEach((d) => set.add(d));
    kind = kind ?? 'weekdays';
  }
  if (/\bweekends?\b/.test(str)) {
    win.days.filter(isWkend).forEach((d) => set.add(d));
    kind = kind ?? 'weekends';
  }
  const dates = [...str.matchAll(DATERE)].map((m) => dayFromDate(m[1], Number(m[2]), win));
  dates.forEach((d) => set.add(d));
  if (!dates.length) for (const m of str.matchAll(DAYRE)) set.add(dayFromWord(m[2], !!m[1], win));
  return kind;
}

// An hour and minute as minutes from midnight. `ap` is am/pm when typed; `guess` reads a bare 1 to 8 as PM.
function toMin(h: string, mm: string | undefined, ap: string | undefined, guess: boolean): number {
  let hh = Number(h);
  const m = Number(mm ?? 0);
  if (hh > 23 || m > 59 || (ap && hh > 12)) return NaN;
  if (ap === 'p' || ap === 'pm') {
    if (hh < 12) hh += 12;
  } else if (ap === 'a' || ap === 'am') {
    if (hh === 12) hh = 0;
  } else if (guess && hh >= 1 && hh <= 8) hh += 12;
  return hh * 60 + m;
}

/**
 * Reads a typed line. `fixedDay` (changing one span in place) ignores any day words and uses that day. The problem words
 * are the demo's: "That isn't a time.", "Add a day, e.g. sat 10 to 2.", "Interviews run Tue Nov 10 to Fri Nov 20.",
 * "Add the hours, e.g. 5 to 9 pm.", "Times start on the hour or half hour.", "The end has to be after the start.",
 * "Free time runs 8 AM to 10 PM.".
 */
export function parseAvail(raw: string, win: ParseWindow, fixedDay?: string): Parsed {
  let t = ` ${raw.toLowerCase().replace(/[–—]/g, '-').replace(/\./g, '')} `.replace(/\bnoon\b/g, '12pm').replace(/\bmidnight\b/g, '24');
  const out: Parsed = { days: [], s: null, e: null, err: null };
  let ex = '';
  const exm = t.match(/\b(except|but not|not on)\b(.*)$/);
  if (exm && exm.index !== undefined) {
    ex = exm[2];
    t = t.slice(0, exm.index);
  }
  const set = new Set<string>();
  const kind = takeDays(t, set, win);
  if (ex) {
    const exs = new Set<string>();
    takeDays(ex, exs, win);
    exs.forEach((d) => set.delete(d));
  }
  if (fixedDay != null) {
    set.clear();
    set.add(fixedDay);
  }
  out.days = [...set].sort();
  const tt = t.replace(DATERE, ' ').replace(DAYRE, ' ');
  let m: RegExpMatchArray | null;
  if ((m = tt.match(new RegExp(`${T}\\s*(?:-|to|until|till|through)\\s*${T}`)))) {
    const ap1 = m[3];
    const ap2 = m[6];
    out.e = toMin(m[4], m[5], ap2, true);
    if (!ap1 && ap2) {
      out.s = toMin(m[1], m[2], ap2, false);
      if (out.s >= out.e) out.s = toMin(m[1], m[2], 'am', false);
    } else out.s = toMin(m[1], m[2], ap1, !ap1 && Number(m[1]) !== 12 && Number(m[1]) < 9);
    if (!ap1 && !ap2 && Number(m[1]) >= 9 && Number(m[1]) <= 11) out.s = toMin(m[1], m[2], 'am', false);
    if (ap1 && !ap2 && out.e <= out.s && out.e < 720) out.e += 720;
  } else if ((m = tt.match(new RegExp(`\\b(?:after|from)\\s+${T}`)))) {
    out.s = toMin(m[1], m[2], m[3], true);
    out.e = out.s >= 21 * 60 ? H1 : 21 * 60;
  } else if ((m = tt.match(new RegExp(`\\b(?:before|until|till)\\s+${T}`)))) {
    out.e = toMin(m[1], m[2], m[3], true);
    out.s = 9 * 60;
  } else if (/\ball day\b/.test(tt)) {
    out.s = 9 * 60;
    out.e = 21 * 60;
  } else if (/\bmornings?\b/.test(tt)) {
    out.s = 9 * 60;
    out.e = 12 * 60;
  } else if (/\bafternoons?\b/.test(tt)) {
    out.s = 12 * 60;
    out.e = 17 * 60;
  } else if (/\bevenings?\b|\bnights?\b/.test(tt)) {
    out.s = 17 * 60;
    out.e = 21 * 60;
  } else if ((m = tt.match(new RegExp(`\\b${T}\\b`)))) {
    out.s = toMin(m[1], m[2], m[3], true);
    out.e = out.s + 30;
  } else if (kind === 'weekdays') {
    out.s = 17 * 60;
    out.e = 21 * 60;
  } else if (kind) {
    out.s = 9 * 60;
    out.e = 21 * 60;
  }
  if (Number.isNaN(out.s) || Number.isNaN(out.e)) return { days: out.days, s: null, e: null, err: "That isn't a time." };
  const first = win.days[0];
  const last = win.days[win.days.length - 1];
  const inWindow = new Set(win.days);
  if (!out.days.length) out.err = 'Add a day, e.g. sat 10 to 2.';
  else if (out.days.some((d) => !inWindow.has(d))) out.err = first && last ? `Interviews run ${shortDate(first)} to ${shortDate(last)}.` : "The interview dates aren't set yet.";
  else if (out.s === null || out.e === null) out.err = 'Add the hours, e.g. 5 to 9 pm.';
  else if (out.s % 30 || out.e % 30) out.err = 'Times start on the hour or half hour.';
  else if (out.e <= out.s) out.err = 'The end has to be after the start.';
  else if (out.s < H0 || out.e > H1) out.err = 'Free time runs 8 AM to 10 PM.';
  return out;
}
