// The Awardees page's pure logic (unit tested in tests/awardees-map.test.ts; no database, no React): the live rows mapped
// to the page's shape, the step that is "now", the words on each step and row, the news card, totals, the past terms,
// the mock clock, the overlay of local ticks, the paged read and the small per-record write queue.
import { fundsErrorMessage } from './sch-logic';
import { clock, daysFrom, easternDay, shortDate } from './refresh-time';
import type { AwAward, AwCycle, AwPast, AwStepIndex } from './awardees-view';

export type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));

/** The five steps' titles, in order. */
export const AW_TITLES = ['Award letter sent', 'Acceptance form back', 'Payment details confirmed', 'Funds sent', 'Thank-you note and a photo for the awards post'];
/** The five steps' short names (the row's follow-up line). */
export const AW_SHORT = ['Letter', 'Acceptance', 'Payment details', 'Funds', 'Thank-you'];
/** The gold action's words for a step that is a plain tick (indexes 0, 2 and 4). */
export const AW_DO = ['Mark letter sent', 'Mark form back', 'Mark payment details confirmed', '', 'Mark note and photo in'];

/** "$2,500" from cents; "$2,500.50" when there are cents (always two decimals then). */
export function awMoney(cents: number): string {
  const d = cents % 100 === 0 ? 0 : 2;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** The amount as a row shows it: "$2,500", or "Not set" when the board has not set it yet. */
export function amountLabel(cents: number | null): string {
  return cents == null ? 'Not set' : awMoney(cents);
}

/** The amount inside a sentence: "$2,500", or "the payment" when it is not set. */
export function amountWord(cents: number | null): string {
  return cents == null ? 'the payment' : awMoney(cents);
}

/** "BTX Legacy Scholarship" -> "Legacy"; "Empowerment Award" -> "Empowerment". */
export function shortAward(name: string): string {
  return name.trim().replace(/^BTX /, '').replace(/ (Scholarship|Award)$/, '') || name.trim();
}

/** The Eastern day of an instant, or the day itself when it is already a calendar day ("2026-12-14"). */
function dayOf(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : easternDay(v);
}

/** The demo's plain day word: "today", "yesterday", "tomorrow", else "Mon Nov 30" (`v` is an instant or a day). */
export function awRel(today: string, v: string): string {
  const day = dayOf(v);
  const n = daysFrom(today, day);
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n === 1) return 'tomorrow';
  return shortDate(day);
}

/** The step that is now: the first one not done, or -1 when all five are done. */
export function curStep(a: AwAward): number {
  return a.done.findIndex((d) => !d);
}

/** How many of the five steps are done. */
export function doneCount(a: AwAward): number {
  return a.done.filter(Boolean).length;
}

/** The awardee's first name ("Renee"), for the mock email reminder. */
export function firstName(a: AwAward): string {
  return a.name.split(/\s+/)[0] ?? a.name;
}

/**
 * The line under a step's title. `live` changes one word: live mode only records that a reminder went out (nothing is
 * emailed from here), so it says "recorded" where the demo says "sent".
 */
export function stepSub(a: AwAward, i: number, today: string, live: boolean): string {
  const at = a.done[i];
  if (at) return i === 3 ? `Sent ${awRel(today, at)} · ${amountWord(a.amountCents)} logged on Budget` : `Done ${awRel(today, at)}`;
  const now = curStep(a) === i;
  if (i === 1 && now) return `Waiting since the letter${a.reminder ? `, reminder ${live ? 'recorded' : 'sent'} ${awRel(today, a.reminder)}` : ''}`;
  if (i === 3) {
    const logs = `ticking it also logs ${amountWord(a.amountCents)} on Budget`;
    return a.fundsDue ? `Due ${shortDate(a.fundsDue)} · ${logs}` : `${logs[0].toUpperCase()}${logs.slice(1)}`;
  }
  return 'Not started';
}

/** The follow-up line of a row: what is next, drawn by the page ("Funds · due Mon Dec 14"). */
export type RowLine = { kind: 'done' } | { kind: 'wait' } | { kind: 'funds'; due: string | null } | { kind: 'next'; step: string };

/** The row's follow-up line for an awardee. */
export function rowLine(a: AwAward): RowLine {
  const c = curStep(a);
  if (c < 0) return { kind: 'done' };
  if (c === 1) return { kind: 'wait' };
  if (c === 3) return { kind: 'funds', due: a.fundsDue ? shortDate(a.fundsDue) : null };
  return { kind: 'next', step: AW_SHORT[c] };
}

/** The news card under the title: one awardee and what to do. `go` 'nudge' opens the reminder (mock), 'open' the detail. */
export type AwNews = { id: string; kicker: string; title: string; icon: 'clock' | 'money' | 'award'; gold: boolean; cta: 'Nudge' | 'Open'; go: 'nudge' | 'open' };

/**
 * The news card, or null (no awards). First an acceptance form still waiting (unless a reminder went out today), then the
 * earliest funds due among awardees not yet paid, then the last step. `canEmail`: the reminder email exists (mock only);
 * otherwise a waiting form opens the awardee instead of offering "Nudge".
 */
export function newsFor(awards: AwAward[], today: string, canEmail: boolean): AwNews | null {
  const waiting = awards.find((a) => curStep(a) === 1 && !(a.reminder && dayOf(a.reminder) === today));
  if (waiting) return { id: waiting.id, kicker: 'Acceptance form · waiting', title: waiting.name, icon: 'clock', gold: true, cta: canEmail ? 'Nudge' : 'Open', go: canEmail ? 'nudge' : 'open' };
  // Awardees not yet paid, earliest due first (no due day last; ties keep the list's order).
  const unpaid = awards.filter((a) => curStep(a) >= 0 && curStep(a) <= 3);
  const fund = [...unpaid].sort((x, y) => (x.fundsDue ?? '9999').localeCompare(y.fundsDue ?? '9999'))[0];
  if (fund) return { id: fund.id, kicker: fund.fundsDue ? `Funds due ${shortDate(fund.fundsDue)}` : 'Funds not scheduled yet', title: fund.name, icon: 'money', gold: true, cta: 'Open', go: 'open' };
  const last = awards.find((a) => curStep(a) >= 0);
  if (last) return { id: last.id, kicker: 'Last step · thank-you note', title: last.name, icon: 'award', gold: false, cta: 'Open', go: 'open' };
  return null;
}

/** The awardee picked when the page opens: the one with the fewest steps done (the most follow-up). */
export function defaultPick(awards: AwAward[]): string | null {
  const sorted = [...awards].sort((a, b) => doneCount(a) - doneCount(b));
  return sorted[0]?.id ?? null;
}

/** The term's total: the known amounts, and whether any amount is not set yet. */
export function totalOf(awards: AwAward[]): { cents: number; unknown: boolean } {
  return { cents: awards.reduce((n, a) => n + (a.amountCents ?? 0), 0), unknown: awards.some((a) => a.amountCents == null) };
}

/** "Total $3,000" (", plus amounts not set" when one is missing). */
export function totalLabel(awards: AwAward[]): string {
  const t = totalOf(awards);
  return `Total ${awMoney(t.cents)}${t.unknown ? ', plus amounts not set' : ''}`;
}

/** One past term: its name, its awards, the total of the known amounts, and whether any amount is not set. */
export type PastTerm = { term: string; rows: AwPast[]; total: number; unknown: boolean };

/** The past awards grouped by term, in the order they arrive (newest term first). */
export function pastTerms(past: AwPast[]): PastTerm[] {
  const out: PastTerm[] = [];
  for (const p of past) {
    let t = out.find((x) => x.term === p.term);
    if (!t) {
      t = { term: p.term, rows: [], total: 0, unknown: false };
      out.push(t);
    }
    t.rows.push(p);
    t.total += p.amountCents ?? 0;
    if (p.amountCents == null) t.unknown = true;
  }
  return out;
}

/** A past term's count and total: "7 awards · $8,000" (", plus amounts not set" when one is missing). */
export function pastTotalLabel(t: PastTerm): string {
  return `${t.rows.length} ${t.rows.length === 1 ? 'award' : 'awards'} · ${awMoney(t.total)}${t.unknown ? ', plus amounts not set' : ''}`;
}

/** The before-the-award sentence's parts: the meeting words and the day students hear (each null when not set). */
export function pendingWords(c: AwCycle): { meeting: string | null; hear: string | null } {
  return { meeting: c.meeting, hear: c.decisionDay ? shortDate(c.decisionDay) : null };
}

/** The selection meeting as words: "Tue Nov 24, 7:00 PM" (Eastern). */
export function meetingWords(startsAt: string): string {
  return `${shortDate(easternDay(startsAt))}, ${clock(startsAt)}`;
}

/** The note beside the current term's heading: "Announced Mon Nov 30", or "Not announced yet". */
export function announcedWords(c: AwCycle | null): string {
  if (c?.releasedAt) return `Announced ${shortDate(easternDay(c.releasedAt))}`;
  return 'Not announced yet';
}

// ---- live rows -> the page's shape ---------------------------------------------------------------------------------

/**
 * The current term's awards from `scholarship_awards` rows (id, application_id, award_name, amount_cents, kind,
 * decision_note, payment_due_on, award_steps[]) and the matching `applications` rows (id, applicant_code, full_name,
 * terpmail). A step's done time is award_steps.done_at; the funds due day is step 4's due_on, else payment_due_on.
 */
export function mapAwards(awards: Row[], apps: Row[]): AwAward[] {
  const byId = new Map(apps.map((a) => [s(a.id), a]));
  const mapped = awards.map((a): AwAward => {
    const app = a.application_id ? byId.get(s(a.application_id)) : undefined;
    const steps = (Array.isArray(a.award_steps) ? (a.award_steps as Row[]) : []).filter((x) => Number(x.step) >= 1 && Number(x.step) <= 5);
    const at = (n: number) => steps.find((x) => Number(x.step) === n);
    const code = s(app?.applicant_code).trim() || '—';
    const kind: AwAward['kind'] = a.kind === 'extra' ? 'extra' : 'main';
    const amount = a.amount_cents == null ? null : Number(a.amount_cents);
    return {
      id: s(a.id),
      code,
      name: s(app?.full_name).trim() || code,
      email: s(app?.terpmail).trim(),
      award: kind === 'main' ? shortAward(s(a.award_name)) : s(a.award_name).trim(),
      amountCents: amount != null && Number.isFinite(amount) ? amount : null,
      kind,
      note: kind === 'extra' && a.decision_note ? s(a.decision_note) : null,
      done: [1, 2, 3, 4, 5].map((n) => (at(n)?.done_at ? s(at(n)?.done_at) : null)),
      reminder: at(2)?.reminder_sent_at ? s(at(2)?.reminder_sent_at) : null,
      fundsDue: at(4)?.due_on ? s(at(4)?.due_on).slice(0, 10) : a.payment_due_on ? s(a.payment_due_on).slice(0, 10) : null,
      comment: null,
    };
  });
  // Main first, then extras; within each the read's order (decided, then id) stays, as the sort is stable.
  return mapped.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'main' ? -1 : 1));
}

/** Past awards from `scholarship_awards` rows of kind 'past' (past_term, award_name, amount_cents, awardee_label). */
export function mapPast(rows: Row[]): AwPast[] {
  return rows.map((p) => {
    const award = shortAward(s(p.award_name));
    return {
      id: s(p.id),
      term: s(p.past_term).trim() || 'Earlier',
      award,
      amountCents: p.amount_cents == null ? null : Number(p.amount_cents),
      label: s(p.awardee_label).trim() || '—',
      main: /legacy/i.test(award),
    };
  });
}

/** The published cycle (cycles row) and its selection meeting (calendar_events row, or undefined). */
export function mapCycle(c: Row, meeting: Row | undefined): AwCycle {
  return {
    term: s(c.term).trim() || 'This term',
    mainAward: c.award_name ? shortAward(s(c.award_name)) : null,
    mainCents: c.award_amount_cents == null ? null : Number(c.award_amount_cents),
    meeting: meeting?.starts_at ? meetingWords(s(meeting.starts_at)) : null,
    decisionDay: c.decision_date ? s(c.decision_date).slice(0, 10) : null,
    releasedAt: c.decisions_released_at ? s(c.decisions_released_at) : null,
  };
}

// ---- local state over the server's -----------------------------------------------------------------------------------

/** Local step changes laid over the server's: award id -> step index -> done time (or null when unticked). */
export type Over = Readonly<Record<string, Readonly<Partial<Record<number, string | null>>>>>;

/**
 * A settled step write: when it failed and is the newest write on that step, its local value is dropped, so the server's
 * value shows again (never a stale "done" put back by hand). Saved or superseded writes leave the overlay as it is.
 */
export function settleStep(over: Over, id: string, i: number, ok: boolean, newest: boolean): Over {
  const o = over[id];
  if (ok || !newest || !o || !(i in o)) return over;
  const rest = { ...o };
  delete rest[i];
  const next = { ...over };
  if (Object.keys(rest).length) next[id] = rest;
  else delete next[id];
  return next;
}

/** A save error on an award, and the write it was about (step `i` meant to be done or not; null for the reminder). */
export type AwErr = { text: string; i: number | null; want: boolean; sticky?: boolean };

/**
 * The save errors still worth showing after fresh server data comes in: one goes once the server shows its write did
 * commit (a timed-out write that landed later) or once that award's server data changed at all.
 */
export function reseedErrs(errs: Readonly<Record<string, AwErr>>, before: AwAward[], now: AwAward[]): Record<string, AwErr> {
  const out: Record<string, AwErr> = {};
  for (const [id, e] of Object.entries(errs)) {
    const a = now.find((x) => x.id === id);
    const b = before.find((x) => x.id === id);
    if (!a) continue;
    // A sticky message (about money) stays until the person acts on that award again.
    if (e.sticky) {
      out[id] = e;
      continue;
    }
    if (b && awardsSig([a]) !== awardsSig([b])) continue;
    if (e.i != null && (a.done[e.i] != null) === e.want) continue;
    out[id] = e;
  }
  return out;
}

/** The awards with the page's local changes laid over them. */
export function withOver(awards: AwAward[], over: Over, reminders: Readonly<Record<string, string>> = {}): AwAward[] {
  return awards.map((a) => {
    const o = over[a.id];
    const r = reminders[a.id];
    if (!o && !r) return a;
    const done = a.done.map((d, i) => (o && i in o ? (o[i] ?? null) : d));
    return { ...a, done, reminder: r ?? a.reminder };
  });
}

/** The signature of the server's awards: a change means fresh data to take in. */
export function awardsSig(awards: AwAward[]): string {
  return awards.map((a) => `${a.id}:${a.done.map((d) => (d ? 1 : 0)).join('')}:${a.reminder ?? ''}:${a.amountCents ?? ''}`).join('|');
}

/** The mock clock: the demo's 9:00 AM plus two minutes per action (`n` = actions so far, counting this one). */
export function mockClock(n: number): string {
  const m = 9 * 60 + 2 * n;
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
}

/** The step index a step number names (1 to 5 -> 0 to 4). */
export function stepIndex(step: number): AwStepIndex {
  return Math.min(4, Math.max(0, step - 1)) as AwStepIndex;
}

/** The words lib/actions/awardees.ts returns when the funds were already marked sent (a repeat after a timeout). */
export const ALREADY_PAID = fundsErrorMessage({ message: 'already_paid' });

/** What the page says when the funds were already marked sent and this page has no earlier unanswered try. */
export const ALREADY_SENT_TEXT = 'Funds were already marked sent for this award.';

/**
 * How a funds-sent answer reads: saved; "already" (the funds were marked sent before this call: by this page's own
 * earlier try that timed out, or by someone else; the board decides which with alreadyMeans); or refused with a plain
 * message (never containing a name or an email).
 */
export function fundsOutcome(res: { ok: boolean; message: string }): { kind: 'saved' | 'already' | 'refused'; message: string } {
  if (res.ok) return { kind: 'saved', message: res.message };
  if (res.message === ALREADY_PAID) return { kind: 'already', message: ALREADY_PAID };
  return { kind: 'refused', message: res.message };
}

/**
 * The page's reading of an "already sent" answer: saved only when this page made an earlier funds try for the award whose
 * answer never came (that try is what logged it); otherwise someone else marked it, and the page says so without
 * claiming it was sent now.
 */
export function alreadyMeans(earlierUnknown: boolean): 'saved' | 'already' {
  return earlierUnknown ? 'saved' : 'already';
}

// ---- reads and writes ------------------------------------------------------------------------------------------------

/** Rows per request (the database API's silent cap) and the most pages one read may take. */
export const AW_PAGE = 1000;
export const AW_MAX_PAGES = 20;
/** Ids per `in (...)` read. */
export const AW_ID_CHUNK = 100;

/**
 * Reads every row through `fetchPage(from, to)` (inclusive positions, as `.range()` takes them). Each page starts after
 * the rows read so far (the server may return fewer than asked); only an empty page ends the read; a read still going at
 * the ceiling throws (the page shows its load error, never partial data).
 */
export async function pageRows<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = AW_PAGE, max = AW_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`Read reached ${max} pages; refusing partial data.`);
}

/** Splits ids into chunks of AW_ID_CHUNK (a long id list would overflow the request URL). */
export function chunked<T>(ids: T[], size = AW_ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Runs `write` after every earlier write queued on the same key (whether it worked or not), so two writes to one step
 * reach the database in the order the person made them. Returns the write's own promise.
 */
export function chain<T>(queue: Map<string, Promise<unknown>>, k: string, write: () => Promise<T>): Promise<T> {
  const prev = queue.get(k) ?? Promise.resolve();
  const next = prev.then(write, write);
  queue.set(k, next);
  return next;
}

/** How a raced call ended: its answer, a thrown error (network, server), or still running at the time limit. */
export type Settled<T> = { kind: 'answer'; value: T } | { kind: 'error' } | { kind: 'timeout' };

/** Races a call against `ms`; a call still running then counts as timed out (its late answer is ignored). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ kind: 'timeout' }), ms);
    p.then(
      (value) => {
        clearTimeout(t);
        resolve({ kind: 'answer', value });
      },
      () => {
        clearTimeout(t);
        resolve({ kind: 'error' });
      },
    );
  });
}
