// Pure helpers for the refreshed Interviews page (no database, safe in the browser and in tests): the live mapping from
// the existing loader's data (lib/interviews.ts, unchanged), the caps, the two-week calendar, the "add a time" parser and
// the small words the page draws. Days are "YYYY-MM-DD" Eastern strings; times of day are minutes after midnight.
import type { InterviewsData } from './interviews';
import { targetLine } from './interview-times';
import { addDays, atDay, daysFrom, easternDay, fullDate, MO, shortDate, WD, weekday } from './refresh-time';
import type { InterviewsView, IzBooking, IzCaps, IzInterviewer, IzPerson, IzTime } from './interviews-view';

/** Every cap off: a board member without admin rights, or a page with no cycle. */
export const NO_CAPS: IzCaps = {
  makeLinks: false,
  pasteLink: false,
  rebuild: false,
  addTime: false,
  removeTime: false,
  undoTime: false,
  sendTimes: false,
  remindBoard: false,
  remindStudents: false,
  seeWho: false,
  nudge: false,
  rebalance: false,
  pairing: false,
};

/**
 * What the page may offer. Live: only the controls an existing server action backs, and only for admins with a cycle.
 * Mock: the whole demo (admins), including the mock-only Undo and nudge.
 */
export function capsFor(live: boolean, admin: boolean, hasCycle: boolean): IzCaps {
  if (!admin || !hasCycle) return NO_CAPS;
  const real = { makeLinks: true, pasteLink: true, rebuild: true, addTime: true, removeTime: true, sendTimes: true, remindBoard: true, rebalance: true, pairing: true };
  // The two controls with no existing action stay in the demo story only.
  return { ...real, remindStudents: true, seeWho: true, undoTime: !live, nudge: !live };
}

/** "6:30 PM" for minutes after midnight. */
export function clockOf(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "18:30" for minutes after midnight (what addProposedTime takes). */
export function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** Minutes after midnight, Eastern, of an instant. */
export function minuteOf(instant: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

/** "DM" from "Dana Mercer" (first letters of the first and last words). */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return '';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase();
}

/** "Nov 10 to 20", or "Nov 30 to Dec 4" across months; '' with no dates. */
export function rangeLabel(first: string | null, last: string | null): string {
  if (!first || !last) return '';
  const a = atDay(first);
  const b = atDay(last);
  const am = MO[a.getUTCMonth()];
  const bm = MO[b.getUTCMonth()];
  return am === bm ? `${am} ${a.getUTCDate()} to ${b.getUTCDate()}` : `${am} ${a.getUTCDate()} to ${bm} ${b.getUTCDate()}`;
}

/**
 * The word over a booked interview, as the demo writes it: "Today", "Tomorrow", "in 2 days", the weekday up to five
 * days out, "Next Mon" after that; a past or far day gets its date.
 */
export function izRel(today: string, day: string): string {
  const k = daysFrom(today, day);
  if (k < 0 || k > 13) return shortDate(day);
  if (k === 0) return 'Today';
  if (k === 1) return 'Tomorrow';
  if (k === 2) return 'in 2 days';
  if (k <= 5) return weekday(day);
  return `Next ${weekday(day)}`;
}

/** The weeks (Monday to Sunday) that hold the interview dates, each as seven days. */
export function weeksOf(first: string | null, last: string | null): string[][] {
  if (!first || !last || last < first) return [];
  // Monday on or before the first day (getUTCDay: 0 is Sunday).
  const start = addDays(first, -((atDay(first).getUTCDay() + 6) % 7));
  const out: string[][] = [];
  // At most ten weeks, so a bad cycle date never draws a huge grid.
  for (let w = start; w <= last && out.length < 10; w = addDays(w, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  return out;
}

/** True when `day` is one of the interview dates. */
export function inWindow(day: string, first: string | null, last: string | null): boolean {
  return first !== null && last !== null && day >= first && day <= last;
}

/** The interview times of a day, earliest first. */
export function timesOn(times: IzTime[], day: string): IzTime[] {
  return times.filter((t) => t.day === day).sort((a, b) => a.minute - b.minute);
}

/** The screen-reader name of a day cell: "Tuesday, November 10, today: 2 times, 1 booked, 1 yours". */
export function cellLabel(day: string, today: string, times: IzTime[], yours: number): string {
  const booked = times.filter((t) => t.booking !== null || t.heldBy !== null).length;
  const n = times.length;
  return `${fullDate(day)}${day === today ? ', today' : ''}: ${n} ${n === 1 ? 'time' : 'times'}, ${booked} booked${yours ? `, ${yours} yours` : ''}`;
}

/** Booked interviews in date and time order (unmatched ones last). */
export function bookingOrder(bookings: IzBooking[]): IzBooking[] {
  return [...bookings].sort((a, b) => (a.day ?? '9999').localeCompare(b.day ?? '9999') || a.minute - b.minute);
}

/** "You + Keith Dawson" when the viewer is one of the two, "Toby Faraday + Charlie Gaines" otherwise, "Not paired yet". */
export function pairText(pair: IzInterviewer[], me: string | null): string {
  if (pair.length === 0) return 'Not paired yet';
  const mine = pair.some((p) => p.id === me);
  if (mine) {
    const other = pair.find((p) => p.id !== me);
    return other ? `You + ${other.name}` : 'You';
  }
  return pair.map((p) => p.name).join(' + ');
}

/** The line beside "Interview times": who the times went to and when. */
export function sentLine(applicants: number, emailed: number, openedLabel: string | null): string {
  if (!openedLabel) return 'Not sent yet';
  if (emailed > 0) return emailed >= applicants ? `Sent to all ${emailed} ${openedLabel}` : `Sent to ${emailed} ${openedLabel}`;
  return `Times opened ${openedLabel}`;
}

/** What the gold card at the top asks for now. */
export type NeedsStage = 'links' | 'waiting' | 'send' | 'book' | 'clear';

/**
 * The one task the gold card shows: Teams links missing on paired interviews first (admins), then no times yet, then
 * times not sent, then students who have not booked; 'clear' when nothing waits.
 */
export function needsStage(v: Pick<InterviewsView, 'times' | 'bookings' | 'applicants' | 'booked' | 'caps'>): NeedsStage {
  if (v.caps.makeLinks && v.bookings.some((b) => !b.link && b.pair.length === 2)) return 'links';
  if (v.times.length === 0) return 'waiting';
  if (!v.times.some((t) => t.opened)) return 'send';
  if (v.applicants - v.booked > 0) return 'book';
  return 'clear';
}

// Day words the add field reads: "sat", "next mon", "today", "tomorrow".
const DAYW = /\b(next\s+)?(today|tomorrow|tmrw|mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i;

/** What the add field reads: the day (a day word moves it), the minute (null until a time is typed), and any problem. */
export type AddParse = { day: string; minute: number | null; err: string | null; dayWord: boolean };

/**
 * Reads "7:30 pm", "730p", "19:30" or "sat 6pm" typed on `base`. A bare 1 to 8 means PM (interviews run 9 AM to 9 PM).
 * Times start on the hour or half hour, inside the interview dates, and not on a time the day already has (`taken`).
 */
export function parseAdd(text: string, base: string, today: string, first: string | null, last: string | null, taken: (day: string, minute: number) => boolean): AddParse {
  let day = base;
  let err: string | null = null;
  let minute: number | null = null;
  const dm = text.match(DAYW);
  if (dm) {
    const w = dm[2].toLowerCase();
    if (w === 'today') day = today;
    else if (/^(tomorrow|tmrw)$/.test(w)) day = addDays(today, 1);
    else {
      const idx = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(w.slice(0, 3));
      // The next such weekday from today (today itself when it matches), a week later with "next".
      day = addDays(today, ((idx - atDay(today).getUTCDay() + 7) % 7) + (dm[1] ? 7 : 0));
    }
  }
  const rest = dm ? text.replace(dm[0], ' ') : text;
  const tm = rest.match(/(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm|a|p)?\b/i);
  if (tm) {
    let h = Number(tm[1]);
    const mm = tm[2] ? Number(tm[2]) : 0;
    const ap = (tm[3] ?? '').toLowerCase();
    if (h > 23 || mm > 59) err = "That isn't a time.";
    else {
      if (ap.startsWith('p') && h < 12) h += 12;
      else if (ap.startsWith('a') && h === 12) h = 0;
      else if (!ap && h >= 1 && h <= 8) h += 12;
      minute = h * 60 + mm;
      if (mm % 30) err = 'Times start on the hour or half hour.';
      else if (minute < 9 * 60 || minute > 21 * 60) err = 'Interview times run 9:00 AM to 9:00 PM.';
    }
  }
  if (!err && !inWindow(day, first, last)) err = first && last ? `Interviews run ${shortDate(first)} to ${shortDate(last)}.` : 'The cycle has no interview dates yet.';
  if (!err && minute !== null && taken(day, minute)) err = `${clockOf(minute)} is already a time on ${weekday(day)}.`;
  return { day, minute, err, dayWord: dm !== null };
}

/** The date chip under the add field: "Tue Nov 10" (or "Nov 23" outside the dates, as the demo draws it). */
export function addDayChip(day: string, first: string | null, last: string | null): string {
  if (inWindow(day, first, last)) return shortDate(day);
  const d = atDay(day);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The stub on a booked interview: weekday, date number and month. */
export function stubOf(day: string): { wd: string; n: number; mon: string } {
  const d = atDay(day);
  return { wd: WD[d.getUTCDay()], n: d.getUTCDate(), mon: MO[d.getUTCMonth()] };
}

/**
 * Maps the existing loader's data (lib/interviews.ts loadInterviews, read-only) to the page's shape. `today` is today's
 * Eastern day, `me` the signed-in person's id (lib/me.ts). Booked interviews take their day and time from the matching interview time (the chip with the same slot
 * id); one with no match keeps the server's "Thu Nov 12, 7:00 PM" line. People merge the free-hours list with the
 * interview counts; a person on only one list still shows.
 */
export function mapLive(data: InterviewsData, today: string, me: string | null): InterviewsView {
  const chips = data.times ? data.times.days.flatMap((d) => d.times) : [];
  const days = data.times?.days ?? [];
  const upcomingIds = new Set(data.upcoming.map((u) => u.slotId));
  const times: IzTime[] = chips.map((c) => ({
    id: c.slotId,
    day: easternDay(c.startsAt),
    minute: minuteOf(c.startsAt),
    free: c.freeCount,
    opened: c.opened,
    booking: c.booked && upcomingIds.has(c.slotId) ? c.slotId : null,
    heldBy: c.booked && !upcomingIds.has(c.slotId) ? (c.bookedBy ?? 'Booked') : null,
  }));
  const chipById = new Map(chips.map((c) => [c.slotId, c]));
  const bookings: IzBooking[] = data.upcoming.map((u) => {
    const c = chipById.get(u.slotId);
    // Another pair's Teams link stays on the server for a board member without admin rights (the old page showed Join
    // only on your own interviews); the page only learns that a link exists.
    const sees = data.isAdmin || u.pair.some((p) => p.userId === me);
    return {
      id: u.slotId,
      day: c ? easternDay(c.startsAt) : null,
      minute: c ? minuteOf(c.startsAt) : 0,
      whenText: u.whenLine,
      name: u.applicant,
      code: u.code,
      pair: u.pair.map((p) => ({ id: p.userId, name: p.name, initials: p.initials })),
      link: sees ? u.videoUrl : null,
      ...(!sees && u.videoUrl ? { linkHidden: true } : {}),
      ...(u.needsCover ? { needsCover: true } : {}),
    };
  });
  // People: the free-hours list first (its order), then anyone only on the interview counts.
  const fair = new Map((data.fair?.people ?? []).map((p) => [p.userId, p]));
  const seen = new Set<string>();
  const people: IzPerson[] = [];
  const count = (id: string) => fair.get(id)?.interviews ?? bookings.filter((b) => b.pair.some((p) => p.id === id)).length;
  for (const p of data.times?.people ?? []) {
    seen.add(p.userId);
    people.push({ id: p.userId, name: p.name, initials: initialsOf(p.name), hours: p.freeHours, most: p.maxInterviews, sent: p.sent, weekOnly: false, interviews: count(p.userId) });
  }
  for (const p of data.fair?.people ?? []) {
    if (seen.has(p.userId)) continue;
    people.push({ id: p.userId, name: p.name, initials: initialsOf(p.name), hours: 0, most: p.maxInterviews, sent: p.sent, weekOnly: false, interviews: p.interviews });
  }
  // The signed-in person first, as the demo draws "Dana Mercer (you)" at the top.
  people.sort((x, y) => (x.id === me ? -1 : y.id === me ? 1 : 0));
  const target = data.fair ? targetLine(data.fair.people, data.fair.interviews).base : 0;
  const first = days[0]?.day ?? null;
  const last = days[days.length - 1]?.day ?? null;
  const hasCycle = data.cycleId !== null;
  return {
    source: 'live',
    failed: false,
    loadError: false,
    today,
    first,
    last,
    me,
    isAdmin: data.isAdmin,
    cycleId: data.cycleId,
    times,
    bookings,
    people,
    applicants: data.applicantCount,
    booked: data.bookedCount,
    sentLine: sentLine(data.applicantCount, data.times?.emailedCount ?? 0, data.times?.openedLabel ?? null),
    target,
    unbooked: data.isAdmin && data.waiting ? data.waiting.map((w) => ({ id: w.applicationId, name: w.name, code: w.code, emailed: w.emailed, remindedToday: w.remindedToday })) : null,
    dueDay: null,
    caps: capsFor(true, data.isAdmin, hasCycle),
  };
}

/** The view for a failed read: nothing drawn but the "didn't load" card. */
export function failedView(source: 'mock' | 'live', today: string): InterviewsView {
  return {
    source,
    failed: true,
    loadError: false,
    today,
    first: null,
    last: null,
    me: null,
    isAdmin: false,
    cycleId: null,
    times: [],
    bookings: [],
    people: [],
    applicants: 0,
    booked: 0,
    sentLine: '',
    target: 0,
    unbooked: null,
    dueDay: null,
    caps: NO_CAPS,
  };
}

// ---------- Server answers, time limits and confirms (Ops Hub refresh review, 2026-11-12) ----------

/** The words for a call with no answer in time (it may still have been done). */
export const NO_ANSWER = 'No answer in time. Reload to check.';
/** The same for a call that sends email or makes Teams meetings: some may already have gone out. */
export const NO_ANSWER_SENT = 'No answer in time. Reload to check. Some emails or meetings may already have gone out.';

/** The no-answer words for an action: the longer warning when it sends email or makes meetings. */
export function lateText(sends: boolean): string {
  return sends ? NO_ANSWER_SENT : NO_ANSWER;
}

// The parts of a server message that say something did not happen (lib/actions/interviews.ts, lib/teams/links.ts and
// lib/interview-times.ts remindMessage word them; both straight and curly apostrophes).
const FAILURE_PART = /didn[’']t go|isn[’']t set up|no emails went out|failed|couldn[’']t|didn[’']t work|didn[’']t save|didn[’']t send/i;

/**
 * Whether an "ok" server message is all good (drawn with a tick) or carries a part-failure (drawn with an alert): e.g.
 * "Saved 1 link. Email isn't set up here, so no emails went out." or "... 2 didn't go; save again to try those once more."
 */
export function noteOk(message: string): boolean {
  return !FAILURE_PART.test(message);
}

/** How long a confirm's go button waits after the confirm opens before it acts (a held Enter or a double click). */
export const ARM_MS = 400;

/** True once the go button may act: `ARM_MS` after the confirm opened. */
export function armed(openedAt: number, now: number): boolean {
  return now - openedAt >= ARM_MS;
}

/**
 * What a key on a confirm's go button does. Enter and Space act on key-up only, and only after a fresh (not repeated)
 * key-down that began on that button once it was armed: 'wait' marks that key-down, 'go' acts, 'block' does nothing.
 */
export function goKey(type: 'down' | 'up', repeat: boolean, downOnButton: boolean, isArmed: boolean): 'go' | 'wait' | 'block' {
  if (type === 'down') return repeat || !isArmed ? 'block' : 'wait';
  return downOnButton && isArmed ? 'go' : 'block';
}

/** What "Make Teams links" would do, as one comparable string (the preview's counts). */
export function linksSig(p: { toMake: number; replacing: number; handCheck: number; toEmail: number }): string {
  return `${p.toMake}|${p.replacing}|${p.handCheck}|${p.toEmail}`;
}

/** What a rebalance would move, as one comparable string (each move's interview, from and to). */
export function movesSig(moves: { slotId: string; from: string; to: string }[]): string {
  return moves.map((m) => `${m.slotId}:${m.from}>${m.to}`).sort().join(',');
}

/** What re-running pairing would do, as one comparable string. */
export function pairSig(p: { unpaired: number; wouldPair: number; uncovered: number }): string {
  return `${p.unpaired}|${p.wouldPair}|${p.uncovered}`;
}

/** The words over a confirm whose preview changed before it was confirmed (nothing was done). */
export const CHANGED = 'Things changed. Check this list again.';
/** The words when a write is pressed while another one is still saving. */
export const STILL_SAVING = 'Another change is still saving.';

/** The go button of the Teams-links confirm: make links, only send the emails (links made, never emailed), or none. */
export function linksGo(p: { toMake: number; toEmail: number }): string | null {
  if (p.toMake > 0) return `Make ${p.toMake} Teams ${p.toMake === 1 ? 'link' : 'links'}`;
  if (p.toEmail > 0) return 'Send the emails';
  return null;
}
