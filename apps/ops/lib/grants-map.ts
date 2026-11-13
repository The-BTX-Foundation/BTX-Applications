// Pure logic of the refreshed Grants page (no server imports, so the client board and the tests use it too): turning
// database rows into the view (lib/grants-view.ts), the words the page draws (amounts, date lines, the news card, the
// nudge draft), the "Add a grant" parser of mock mode, and the paging helpers the live reads use.
import { daysFrom, daysToSunday, dueTitle, fullDate, MO, WD, atDay } from './refresh-time';
import type { GrantItem, GrantsCaps, GrantStageKey, GrantStep, GrantWho } from './grants-view';

export type Row = Record<string, unknown>;

/** The four stages in the track's order, with their names. */
export const STAGES: { key: GrantStageKey; label: string }[] = [
  { key: 'researching', label: 'Researching' },
  { key: 'writing', label: 'Writing' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'decided', label: 'Decided' },
];
const STAGE_KEYS = new Set<string>(STAGES.map((s) => s.key));

/** Names of the task assignee groups (tasks.assignee_group), as the other Finance pages draw them. */
export const GROUPS: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

/** The checklist this page shows (checklists.title). */
export const CHECKLIST_TITLE = 'Getting started with grants';

const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "$10,000" from cents; "$10,000.50" when there are cents (never rounded to a different dollar amount). */
export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Counts shown in the track: "99+" past 99. */
export function cnt(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** The amount on a grant row: "Up to $10,000", "$5,000" or "Amount not set". */
export function amountText(g: Pick<GrantItem, 'amountCents' | 'upTo'>): string {
  if (g.amountCents == null) return 'Amount not set';
  return `${g.upTo ? 'Up to ' : ''}${money(g.amountCents)}`;
}

// ", 2025" when a day falls in another year than today, else nothing.
function yearOf(today: string, day: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? '' : `, ${day.slice(0, 4)}`;
}

// "Sep 30" (same year as today) or "Jan 15, 2026" (another year).
function monthDay(today: string, day: string): string {
  const d = atDay(day);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}${yearOf(today, day)}`;
}

// "Wednesday, September 30" or "Thursday, January 15, 2026" (hover titles).
function longDate(today: string, day: string): string {
  return `${fullDate(day)}${yearOf(today, day)}`;
}

/**
 * The small line under a grant's amount, with the exact date for the hover title (or null) and whether it is late: the
 * decision ("Won Oct 3", "Not funded · Oct 3", or the bare word with no date), "Submitted Sep 30", a passed deadline on
 * a grant still being researched or written ("Deadline passed Oct 1", late style, "Was due ..."), the free note ("Opens in
 * January"), "Deadline Nov 20", or "No deadline yet". The year shows whenever it is not today's year.
 */
export function dateLine(today: string, g: GrantItem): { text: string; title: string | null; late: boolean } {
  if (g.stage === 'decided' && g.outcome) {
    const word = g.outcome === 'won' ? 'Won' : 'Not funded';
    if (!g.decidedOn) return { text: word, title: null, late: false };
    // "Won Oct 3" as the demo draws it; "Not funded · Oct 3" so the date never reads as part of the words.
    return { text: `${word}${g.outcome === 'won' ? ' ' : ' · '}${monthDay(today, g.decidedOn)}`, title: longDate(today, g.decidedOn), late: false };
  }
  if (g.submittedOn && (g.stage === 'submitted' || g.stage === 'decided')) {
    return { text: `Submitted ${monthDay(today, g.submittedOn)}`, title: longDate(today, g.submittedOn), late: false };
  }
  const open = g.stage === 'researching' || g.stage === 'writing';
  if (open && g.deadlineOn && daysFrom(today, g.deadlineOn) < 0) {
    return { text: `Deadline passed ${monthDay(today, g.deadlineOn)}`, title: stepTitle(today, g.deadlineOn) ?? null, late: true };
  }
  if (g.dateNote) return { text: g.dateNote, title: null, late: false };
  if (g.deadlineOn) return { text: `Deadline ${monthDay(today, g.deadlineOn)}`, title: longDate(today, g.deadlineOn), late: false };
  return { text: 'No deadline yet', title: null, late: false };
}

/** A due day's hover title: "Due Thursday, November 12", "Was due ..." (the house dueTitle, year added when not today's). */
export function stepTitle(today: string, day: string | null): string | undefined {
  return day ? `${dueTitle(today, day)}${yearOf(today, day)}` : undefined;
}

/** A done step's hover title: the plain date (year added when not today's). */
export function doneTitle(today: string, day: string | null): string | undefined {
  return day ? longDate(today, day) : undefined;
}

/** The date beside the title: "Tue, Nov 10". */
export function titleDate(today: string): string {
  const d = atDay(today);
  return `${WD[d.getUTCDay()]}, ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * A due day in running words: "today", "tomorrow", "Friday" (this calendar week), "next Monday" (next week), else
 * "Thursday, December 31". Same calendar weeks (Mon to Sun) as rel() in lib/refresh-time.ts.
 */
export function dueWords(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const toSun = daysToSunday(today);
  const wd = WDL[atDay(day).getUTCDay()];
  if (n > 0 && n <= toSun) return wd;
  if (n > 0 && n <= toSun + 7) return `next ${wd}`;
  return longDate(today, day);
}

/** "3 days late" for a day before today. */
export function lateWords(today: string, day: string): string {
  const n = -daysFrom(today, day);
  return `${n} day${n === 1 ? '' : 's'} late`;
}

/** First word of a name ("Keith Dawson" -> "Keith"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** How a group is named inside a sentence: "the board", or the group's name in lower case. */
export function groupWords(name: string): string {
  return name === 'Board' ? 'the board' : name.toLowerCase();
}

/** The person (or nobody) behind a user id, from staff_profiles rows mapped by user id. */
export function personWho(id: string | null | undefined, people: Map<string, { name: string; initials: string }>, me: string | null): GrantWho | null {
  if (!id) return null;
  const p = people.get(id);
  if (!p) return null;
  return { kind: 'person', id, name: p.name, first: firstName(p.name), initials: p.initials, me: id === me };
}

/** staff_profiles rows -> user id -> name and initials. */
export function mapPeople(rows: Row[]): Map<string, { name: string; initials: string }> {
  return new Map(rows.map((r) => [String(r.user_id), { name: String(r.display_name ?? ''), initials: String(r.initials ?? '') }]));
}

// A date column as "YYYY-MM-DD", or null.
const day = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

/** One grants row -> a grant item. Rows with an unknown stage are dropped by mapGrants (they cannot be drawn on the track). */
export function mapGrant(r: Row, people: Map<string, { name: string; initials: string }>, me: string | null): GrantItem {
  const outcome = r.outcome === 'won' || r.outcome === 'declined' ? r.outcome : null;
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    funder: typeof r.funder === 'string' && r.funder.trim() ? r.funder : null,
    amountCents: r.amount_cents == null ? null : Number(r.amount_cents),
    upTo: Boolean(r.amount_is_up_to),
    stage: String(r.stage) as GrantStageKey,
    outcome,
    deadlineOn: day(r.deadline_on),
    dateNote: typeof r.date_note === 'string' && r.date_note.trim() ? r.date_note : null,
    submittedOn: day(r.submitted_on),
    decidedOn: day(r.decided_on),
    owner: personWho(r.owner_id == null ? null : String(r.owner_id), people, me),
  };
}

/**
 * Grants rows -> the listed grants: only the four known stages, ordered by deadline (soonest first, undated last), then by
 * when they were added, then by id, so the order never shifts between loads.
 */
export function mapGrants(rows: Row[], people: Map<string, { name: string; initials: string }>, me: string | null): GrantItem[] {
  const created = new Map(rows.map((r) => [String(r.id), String(r.created_at ?? '')]));
  return rows
    .filter((r) => STAGE_KEYS.has(String(r.stage)))
    .map((r) => mapGrant(r, people, me))
    .sort((a, b) => {
      if (a.deadlineOn !== b.deadlineOn) {
        if (!a.deadlineOn) return 1;
        if (!b.deadlineOn) return -1;
        return a.deadlineOn < b.deadlineOn ? -1 : 1;
      }
      const ca = created.get(a.id) ?? '';
      const cb = created.get(b.id) ?? '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** Grants per stage. */
export function stageCounts(grants: Pick<GrantItem, 'stage'>[]): Record<GrantStageKey, number> {
  const c: Record<GrantStageKey, number> = { researching: 0, writing: 0, submitted: 0, decided: 0 };
  for (const g of grants) if (g.stage in c) c[g.stage] += 1;
  return c;
}

/** Real grants: anything past Researching (Researching rows are ideas still being looked at). */
export function realCount(counts: Record<GrantStageKey, number>): number {
  return counts.writing + counts.submitted + counts.decided;
}

/**
 * The checklist's tasks and their assignees -> the steps, in checklist order (position, then id). A step's person is its
 * first assignee (by user id, so the pick is stable); without one, its group ("Board"); else nobody.
 */
export function mapSteps(tasks: Row[], assignees: Row[], people: Map<string, { name: string; initials: string }>, me: string | null): GrantStep[] {
  const byTask = new Map<string, string[]>();
  for (const a of assignees) {
    const k = String(a.task_id);
    byTask.set(k, [...(byTask.get(k) ?? []), String(a.user_id)]);
  }
  return [...tasks]
    .sort((a, b) => {
      const pa = Number(a.position ?? 0);
      const pb = Number(b.position ?? 0);
      if (pa !== pb) return pa - pb;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    })
    .map((t) => {
      const ids = (byTask.get(String(t.id)) ?? []).sort();
      const person = ids.map((id) => personWho(id, people, me)).find(Boolean) ?? null;
      const group = t.assignee_group ? ({ kind: 'group', name: GROUPS[String(t.assignee_group)] ?? 'Board' } as const) : null;
      return {
        id: String(t.id),
        title: String(t.title ?? ''),
        kind: typeof t.note === 'string' ? t.note : '',
        who: person ?? group,
        due: day(t.due_on),
        done: t.status === 'done',
      };
    });
}

/** The step up next: the first one not done. */
export function nextStep(steps: GrantStep[]): GrantStep | undefined {
  return steps.find((s) => !s.done);
}

/** The news card under the title, or null when there is nothing to act on. */
export type GrantsNews = { icon: 'wait' | 'alert'; kicker: string; title: string; go: 'Open' | 'See it'; gold: boolean };

/**
 * The news card, as the demo picks it: a grant waiting on a decision first; else the next checklist step (gold and "Open"
 * when it is the viewer's; "3 days late" or "Due next Monday", plus whose it is when it is someone else's).
 */
export function grantsNews(today: string, grants: GrantItem[], submitted: number, steps: GrantStep[] | null): GrantsNews | null {
  if (submitted > 0) {
    const g = grants.find((x) => x.stage === 'submitted');
    return { icon: 'wait', kicker: 'Waiting on a decision', title: g ? g.name : `${submitted} grants submitted`, go: 'See it', gold: false };
  }
  const s = steps ? nextStep(steps) : undefined;
  if (!s) return null;
  const mine = s.who?.kind === 'person' && s.who.me;
  const late = s.due != null && daysFrom(today, s.due) < 0;
  let kicker = !s.due ? 'No due date' : late ? lateWords(today, s.due) : `Due ${dueWords(today, s.due)}`;
  if (!mine && s.who) kicker += ` · ${s.who.kind === 'group' ? groupWords(s.who.name) : s.who.first}`;
  return { icon: late ? 'alert' : 'wait', kicker, title: s.title, go: mine ? 'Open' : 'See it', gold: mine };
}

/** The drafted nudge for a step waiting on someone else. */
export function nudgeText(today: string, s: GrantStep): string {
  const who = s.who?.kind === 'person' ? s.who.first : s.who ? groupWords(s.who.name) : '';
  const due = s.due ? (daysFrom(today, s.due) < 0 ? `was due ${longDate(today, s.due)}` : `due ${dueWords(today, s.due)}`) : null;
  return `Hi ${who}, how is "${s.title.toLowerCase()}" coming along?${due ? ` It's ${due}.` : ''}`;
}

/** Money in a typed line: "$45", "45.50", "1,200" -> dollars and the matched text (the demo's parser). */
export function parseAmount(text: string): { value: number; raw: string } | null {
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\b/);
  if (!m) return null;
  const whole = (m[1] || m[3]).replace(/,/g, '');
  const cents = m[2] || m[4] || '';
  return { value: Number(whole) + (cents ? Number(`0.${cents}`) : 0), raw: m[0] };
}

/**
 * "Community foundation grant up to $5,000" -> name "Community foundation grant", 500000 cents, up to. "up to", "max" or
 * "maximum" mark the most it can be. The name starts with a capital. (Mock mode's "Add a grant"; live adding is off.)
 */
export function parseGrant(text: string): { name: string; amountCents: number | null; upTo: boolean } {
  const a = parseAmount(text);
  let name = a ? text.replace(a.raw, ' ') : text;
  let upTo = false;
  const u = name.match(/\b(up to|max|maximum)\b/i);
  if (u) {
    upTo = true;
    name = name.replace(u[0], ' ');
  }
  name = name.replace(/\s+/g, ' ').replace(/^[,\s-]+|[,\s-]+$/g, '').trim();
  if (name) name = name[0].toUpperCase() + name.slice(1);
  return { name, amountCents: a ? Math.round(a.value * 100) : null, upTo };
}

/**
 * Reads every row through `fetchPage(from, to)` in pages of `size` (PostgREST's 1,000-row cap applies silently), moving
 * on by the rows actually returned and stopping only on an EMPTY page. Past `maxRows` it throws (a load error) rather
 * than return a partial list.
 */
export async function pageAll<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = 1000, maxRows = 20_000): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const page = await fetchPage(all.length, all.length + size - 1);
    if (page.length === 0) return all;
    if (all.length >= maxRows) throw new Error(`More than ${maxRows} rows; refusing a partial list.`);
    all.push(...page);
  }
}

/** Splits a list into chunks of `n` (for `in(...)` filters: 100 ids per request). */
export function chunk<T>(list: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Mock mode: every control works on the page's own state, like the demo. */
export const MOCK_CAPS: GrantsCaps = { add: true, addUndo: true, tick: true, nudge: true };

/**
 * Live mode: nothing on this page writes yet. "Add a grant" stays a disabled "Coming soon" control (owner, 2026-10-12: money
 * writes off, lib/money-writes.ts not wired); the checklist has no live write here (spec: checklist writes mock-only); the
 * nudge has no live path on this page (no chat writer wired), so it is hidden.
 */
export const LIVE_CAPS: GrantsCaps = { add: false, addUndo: false, tick: false, nudge: false };
