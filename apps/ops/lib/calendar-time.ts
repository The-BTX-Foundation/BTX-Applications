// The Calendar page's pure logic (Ops Hub refresh): plain-word days, the month grid's lanes, the chosen day, the agenda, the
// phone week strip, the news card's "next" pick and the add-an-event parser ("Board call thu 7pm"). Everything is counted
// from the view's `today` (an Eastern calendar day) and `nowMin`, never from the clock, so server and browser draw the same.
// Ported from the demo's script (apps/design/ops-refresh/directions/p-calendar/index.html). Tested in tests/calendar-time.test.ts.
import { addDays, atDay, daysFrom, MO, shortDate, WD } from './refresh-time';
import type { CalArea, CalViewItem } from './calendar-view';

const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The areas in the picker's and the add chip's order, with their shown names ("money" is Finance). */
export const CAL_AREAS: { id: CalArea; name: string }[] = [
  { id: 'scholarships', name: 'Scholarships' },
  { id: 'money', name: 'Finance' },
  { id: 'programs', name: 'Programs' },
  { id: 'outreach', name: 'Outreach' },
];

/** An area's shown name. */
export function areaName(a: CalArea): string {
  return CAL_AREAS.find((x) => x.id === a)?.name ?? 'Scholarships';
}

/** Minutes after midnight -> "5:30 PM". */
export function clockMin(m: number): string {
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
}

/** Minutes after midnight -> "5:30" (the month grid's chips drop AM / PM). */
export function clockShort(m: number): string {
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutes after midnight -> "19:00" (the add form's saved time). */
export function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Day of the week, 0 = Sunday. */
export function dow(day: string): number {
  return atDay(day).getUTCDay();
}

/** The first of the month a day is in ("2026-11-01"). */
export function monthOf(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The first of the month `n` months after the month of `day`. */
export function addMonthsTo(day: string, n: number): string {
  const d = atDay(monthOf(day));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
}

/** The Sunday that starts the week of `day` (the grid and the phone strip run Sunday to Saturday, as the demo). */
export function weekOf(day: string): string {
  return addDays(day, -dow(day));
}

/** Plain-word day: "Today", "Tomorrow", "Yesterday", the full weekday within 6 days, else "Sun Nov 15". */
export function dayWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 6) return WDL[dow(day)];
  return shortDate(day);
}

/** A grid cell's name: "Today, Tue Nov 10" or "Sun Nov 15". */
export function cellLabel(today: string, day: string): string {
  const w = dayWord(today, day);
  return w === shortDate(day) ? w : `${w}, ${shortDate(day)}`;
}

/** The chosen day's heading: "Today, Nov 10", "Thursday, Nov 12" or "Sun Nov 15". */
export function dayHeading(today: string, day: string): string {
  const w = dayWord(today, day);
  return w === shortDate(day) ? w : `${w}, ${shortDate(day).slice(4)}`;
}

/** The agenda's day label: the plain word, or the full weekday when the word is a date ("Sunday"). */
export function agendaLabel(today: string, day: string): string {
  const w = dayWord(today, day);
  return w === shortDate(day) ? WDL[dow(day)] : w;
}

/** "Nov 10" (the agenda's small date line). */
export function monthDay(day: string): string {
  const d = atDay(day);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Nov 8 to 14", or "Nov 29 to Dec 5" across a month end (the phone week strip's title). */
export function weekTitle(start: string): string {
  const a = atDay(start);
  const b = atDay(addDays(start, 6));
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return `${MO[a.getUTCMonth()]} ${a.getUTCDate()} to ${sameMonth ? '' : `${MO[b.getUTCMonth()]} `}${b.getUTCDate()}`;
}

/** Three-letter weekday ("Tue"). */
export function wd(day: string): string {
  return WD[dow(day)];
}

/** Day of the month (12). */
export function dnum(day: string): number {
  return atDay(day).getUTCDate();
}

// Where a thing sorts inside its day: bars first, then cycle dates, then by time, then untimed things last.
function sortKey(i: CalViewItem): number {
  if (i.kind === 'span') return -2;
  if (i.time == null) return i.kind === 'cycle' ? -1 : 2000;
  return i.time;
}

/** Everything on one day (bars that cover it included), in the row order (stable for ties). */
export function onDay(list: CalViewItem[], day: string): CalViewItem[] {
  return list
    .filter((i) => (i.kind === 'span' ? i.date <= day && day <= (i.endDate ?? i.date) : i.date === day))
    .map((it, n) => ({ it, n }))
    .sort((a, b) => sortKey(a.it) - sortKey(b.it) || a.n - b.n)
    .map((x) => x.it);
}

/** True when a dated thing is over: an earlier day, or today at a time before `nowMin`. */
export function isPast(today: string, nowMin: number, i: CalViewItem): boolean {
  const n = daysFrom(today, i.date);
  return n < 0 || (n === 0 && i.time != null && i.time < nowMin);
}

/** True when the viewer is on it. */
export function isMine(i: CalViewItem, me: string): boolean {
  return i.people.includes(me);
}

/** The Person and Area filters: a person sees things they are on plus whole-board things. Empty filter = everything. */
export function visibleItems(items: CalViewItem[], who: string, area: string): CalViewItem[] {
  return items.filter((i) => (!who || i.people.length === 0 || i.people.includes(who)) && (!area || i.area === area));
}

/** The words on a month-grid chip: "5:30 Ada", "Cert call 7:00", or the chip text. */
export function chipText(i: CalViewItem): string {
  if (i.kind === 'interview' && i.time != null) return `${clockShort(i.time)} ${i.title.split(' ')[0]}`;
  if (i.time != null && i.kind !== 'cycle') return `${i.chip} ${clockShort(i.time)}`;
  return i.chip;
}

/** The when-word at the front of a row: the time, "Due", "Post", "All day"; a bar after its first day "Ongoing" or "Last day". */
export function whenText(i: CalViewItem, day: string): string {
  if (i.kind === 'span' && i.date !== day) return i.endDate === day ? 'Last day' : 'Ongoing';
  if (i.time != null) return clockMin(i.time);
  if (i.kind === 'task') return 'Due';
  if (i.kind === 'post') return 'Post';
  return 'All day';
}

const EVENT_WORDS: Record<string, string> = { event: 'Event', meeting: 'Meeting', selection_meeting: 'Selection meeting', planning_call: 'Planning call', deadline: 'Deadline' };

/** The small word after the time in a row's eyebrow ("Interview, 30 min", "Meeting", "Cycle date"), or "". An event with a stored kind says that kind. */
export function kindWord(k: CalViewItem['kind'], eventKind?: string): string {
  if (k === 'event') return (eventKind && EVENT_WORDS[eventKind]) || 'Meeting';
  return k === 'interview' ? 'Interview, 30 min' : k === 'cycle' ? 'Cycle date' : '';
}

/** A placed bar, chip or "N more" in one week row of the month grid (col 0-6, lane = grid row, 2 and up). */
export type Placed = { item: CalViewItem; col: number; span: number; lane: number };
export type GridWeek = { days: string[]; bars: Placed[]; chips: Placed[]; more: { col: number; lane: number; n: number; day: string }[] };

/** The weeks (Sunday first) that cover the month of `month`: four to six rows. */
export function monthWeeks(month: string): string[][] {
  const first = monthOf(month);
  const start = weekOf(first);
  const out: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, w * 7 + k));
    // A fifth or sixth row only while it still starts inside the month (the demo's rule).
    if (w > 3 && days[0].slice(0, 7) !== first.slice(0, 7)) break;
    out.push(days);
  }
  return out;
}

/**
 * Lays out one month: in each week, bars first (each in the first lane free across its days), then each day's things in
 * row order, three to a day, or two and "N more" when there are four or more. Lane 1 is the day number's row.
 */
export function monthGrid(month: string, list: CalViewItem[]): GridWeek[] {
  return monthWeeks(month).map((days) => {
    const taken = days.map(() => new Set<number>());
    const bars: Placed[] = [];
    for (const i of list.filter((x) => x.kind === 'span')) {
      const end = i.endDate ?? i.date;
      const s = days.findIndex((d) => d >= i.date && d <= end);
      if (s < 0) continue;
      let e = s;
      while (e < 6 && days[e + 1] <= end) e++;
      let lane = 2;
      while (Array.from({ length: e - s + 1 }, (_, k) => s + k).some((c) => taken[c].has(lane))) lane++;
      for (let c = s; c <= e; c++) taken[c].add(lane);
      bars.push({ item: i, col: s, span: e - s + 1, lane });
    }
    const chips: Placed[] = [];
    const more: GridWeek['more'] = [];
    days.forEach((d, c) => {
      const things = onDay(list, d).filter((i) => i.kind !== 'span');
      // The first free lane in this day's column.
      const free = () => {
        let l = 2;
        while (taken[c].has(l)) l++;
        taken[c].add(l);
        return l;
      };
      const cap = things.length > 3 ? 2 : 3;
      for (const item of things.slice(0, cap)) chips.push({ item, col: c, span: 1, lane: free() });
      if (things.length > cap) more.push({ col: c, lane: free(), n: things.length - cap, day: d });
    });
    return { days, bars, chips, more };
  });
}

/** The agenda: the chosen day and the 20 after it, days with something only; a bar shows on its first day or the first day listed. */
export function agendaDays(list: CalViewItem[], from: string): { to: string; days: { day: string; items: CalViewItem[] }[] } {
  const to = addDays(from, 20);
  const days: { day: string; items: CalViewItem[] }[] = [];
  for (let n = 0; n <= 20; n++) {
    const d = addDays(from, n);
    const items = onDay(list, d).filter((i) => i.kind !== 'span' || i.date === d || d === from);
    if (items.length) days.push({ day: d, items });
  }
  return { to, days };
}

/** One day of the phone week strip: its things (bars left out), how many are the viewer's, and the marks (gold first, at most 3). */
export function weekDay(list: CalViewItem[], day: string, me: string): { count: number; mine: number; marks: ('g' | 'o')[] } {
  const t = onDay(list, day).filter((i) => i.kind !== 'span');
  const g = t.filter((i) => isMine(i, me)).length;
  const o = t.length - g;
  const gold = Math.min(g, 2);
  return { count: t.length, mine: g, marks: [...Array<'g'>(gold).fill('g'), ...Array<'o'>(Math.min(o, 3 - gold)).fill('o')] };
}

/** The news card's pick: the next timed thing still to come (today after `nowMin`, or a later day), or null. */
export function nextUp(list: CalViewItem[], today: string, nowMin: number): CalViewItem | null {
  const ahead = list.filter((i) => i.time != null && (daysFrom(today, i.date) > 0 || (i.date === today && i.time > nowMin)));
  ahead.sort((a, b) => daysFrom(b.date, a.date) || (a.time ?? 0) - (b.time ?? 0));
  return ahead[0] ?? null;
}

/* ---------- Add an event in place: "Board call thu 7pm" sets the day, time and area ---------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYRX =
  /\b(today|tonight|tomorrow|tmrw|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2})\b/i;
// "7pm", "9:30am", "noon", or a 24-hour "19:30".
const TIMERX = /\b(noon|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)\b|([01]?\d|2[0-3]):([0-5]\d)\b)/i;
const AREARX: [RegExp, CalArea][] = [
  [/\b(budget|finance|money|donor|donors|gift|gifts|grant|grants)\b/i, 'money'],
  [/\b(instagram|post|newsletter|outreach|caption|linkedin)\b/i, 'outreach'],
  [/\b(certification|program|programs|mentorship|sponsor|sponsorship)\b/i, 'programs'],
  [/\b(interview|applicant|score|scores|scholarship|selection|award)\b/i, 'scholarships'],
];

/**
 * The day a typed word means: today, tomorrow, the next such weekday (a week on when it is today's), or "nov 12" this year
 * (next year when this year's would be more than 30 days ago).
 */
export function dayFrom(word: string, today: string): string | null {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  if (w === 'today' || w === 'tonight') return today;
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
  const m = /^([a-z]+) (\d{1,2})$/.exec(w);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi < 0) return null;
    const n = Number(m[2]);
    // This year, unless that is more than 30 days ago: then next year ("jan 15" typed on Dec 20 is next January).
    let y = Number(today.slice(0, 4));
    if ((Date.UTC(y, mi, n) - atDay(today).getTime()) / 86_400_000 < -30) y += 1;
    const d = new Date(Date.UTC(y, mi, n));
    // "nov 31" is not a day.
    return d.getUTCDate() === n ? d.toISOString().slice(0, 10) : null;
  }
  const idx = WD.map((x) => x.toLowerCase()).indexOf(w.slice(0, 3));
  if (idx < 0) return null;
  return addDays(today, (idx - dow(today) + 7) % 7 || 7);
}

/** What the add field has read so far, and which parts were found in the words (drawn as gold-edged chips). */
export type ParsedEvent = { title: string; day: string | null; time: number | null; area: CalArea | null; found: { day: boolean; time: boolean; area: boolean } };

/**
 * Reads the add field. A day word, a time and an area keyword are taken out of the title; `dismissed` turns a found day or
 * time back into plain words, and `areaPick` (the area chip tapped) wins over a keyword.
 */
export function parseEvent(text: string, today: string, dismissed: { day: boolean; time: boolean } = { day: false, time: false }, areaPick: CalArea | null = null): ParsedEvent {
  let title = text;
  let day: string | null = null;
  let time: number | null = null;
  const dm = DAYRX.exec(text);
  if (dm && !dismissed.day) {
    const x = dayFrom(dm[1], today);
    if (x) {
      day = x;
      title = title.replace(dm[0], ' ');
    }
  }
  const tm = TIMERX.exec(text);
  if (tm && !dismissed.time) {
    if (/noon/i.test(tm[1])) time = 12 * 60;
    else if (tm[5] != null) time = Number(tm[5]) * 60 + Number(tm[6]);
    else {
      // With am / pm the hour is 1 to 12 ("13pm" is not a time, and is left in the title).
      const h12 = Number(tm[2]);
      const mm = Number(tm[3] || 0);
      if (h12 >= 1 && h12 <= 12 && mm < 60) time = ((h12 % 12) + (/p/i.test(tm[4]) ? 12 : 0)) * 60 + mm;
    }
    if (time != null) title = title.replace(tm[0], ' ').replace(/\s+at\s*$/i, ' ');
  }
  // The area keyword that comes first in the words wins.
  let best: { i: number; a: CalArea } | null = null;
  for (const [rx, a] of AREARX) {
    const m = rx.exec(text);
    if (m && (!best || m.index < best.i)) best = { i: m.index, a };
  }
  const area = areaPick ?? (best ? best.a : null);
  title = title.replace(/\s+(at|on)\s*$/i, '').replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, day, time, area, found: { day: day != null, time: time != null, area: Boolean(areaPick || best) } };
}

/** The area after `a` in the add chip's cycle (tapping the Area chip). */
export function nextArea(a: CalArea): CalArea {
  const i = CAL_AREAS.findIndex((x) => x.id === a);
  return CAL_AREAS[(i + 1) % CAL_AREAS.length].id;
}

/** "DM" from "Dana Mercer". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
