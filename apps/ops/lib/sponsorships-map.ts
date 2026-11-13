// Pure logic for the Sponsorships page (no database, no React), unit-tested in tests/sponsorships-map.test.ts:
// mapping `sponsorships` rows to the page's rows, the year's totals, the news card, the "Log a sponsorship" line reader
// ("NSBE regional conference 3 students $600 Dec 5"), the paged read, and the "did it save?" check after a failed log.
import { MO, shortDate } from './refresh-time';
import type { HowStep, SponsorCaps, SponsorKind, SponsorRow } from './sponsorships-view';

export type Row = Record<string, unknown>;

/** The labels of the four kinds. */
export const KIND_LABEL: Record<SponsorKind, string> = { conference: 'Conference', travel: 'Travel', fee: 'Fee', other: 'Other' };

/** The bare line icon of each kind (as the demo draws them). */
export const KIND_ICON: Record<SponsorKind, 'people' | 'flag' | 'money'> = { conference: 'people', travel: 'flag', fee: 'money', other: 'flag' };

/** "$2,750" from cents; "$2,750.50" when there are cents. */
export function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "1 student", "5 students". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// A cell as text ('' for null or undefined).
const s = (v: unknown) => (v == null ? '' : String(v));

/** A stored kind, or "conference" (the table's default) for anything unknown. */
export function kindOf(v: unknown): SponsorKind {
  const k = s(v);
  return k === 'conference' || k === 'travel' || k === 'fee' || k === 'other' ? k : 'conference';
}

/** The words under a title: the stored label, else the spending date ("Thu Dec 31"), else "Date not set". */
export function whenWords(label: string, on: string | null): string {
  if (label.trim()) return label.trim();
  return on ? shortDate(on) : 'Date not set';
}

/**
 * This year's rows as the page draws them: cancelled ones left out, a dated row only in its own year (an undated one counts
 * for this year, as before), oldest first (undated last), then by title and id so the order never wobbles.
 */
export function mapRows(rows: Row[], year: number): SponsorRow[] {
  return rows
    .filter((x) => x.status !== 'cancelled')
    .filter((x) => !x.occurred_on || s(x.occurred_on).startsWith(String(year)))
    .map((x) => {
      const on = x.occurred_on ? s(x.occurred_on).slice(0, 10) : null;
      return {
        id: s(x.id),
        title: s(x.title),
        kind: kindOf(x.kind),
        students: Math.max(0, Number(x.students) || 0),
        cents: Math.max(0, Math.round(Number(x.amount_cents) || 0)),
        when: whenWords(s(x.when_label), on),
        on,
        state: x.status === 'planned' ? ('planned' as const) : ('done' as const),
      };
    })
    .sort(byDate);
}

/** Row order: by date (undated last), then title, then id. */
export function byDate(a: SponsorRow, b: SponsorRow): number {
  if (a.on !== b.on) {
    if (!a.on) return 1;
    if (!b.on) return -1;
    return a.on < b.on ? -1 : 1;
  }
  // Plain code-point order (never locale rules), so the server and the browser sort the same way.
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The year's totals: money spent (cents) and students helped, from done rows only (a planned one is not spent yet, as on Budget). */
export function totals(rows: SponsorRow[]): { cents: number; students: number } {
  return rows.filter((r) => r.state === 'done').reduce((t, r) => ({ cents: t.cents + r.cents, students: t.students + r.students }), { cents: 0, students: 0 });
}

/** The news card: the first sponsorship not started yet and how many there are, or null when none waits. */
export function newsOf(rows: SponsorRow[]): { row: SponsorRow; open: number } | null {
  const open = rows.filter((r) => r.state !== 'done');
  return open.length ? { row: open[0], open: open.length } : null;
}

// ---------- Reading the line ----------

/**
 * What the line says so far. `cents` null = no amount typed yet. `on` = the spending date sent to the database. `when` = the
 * words stored with it. `dated` = a day was typed (the chip then shows `fullDate(on)`, year included). `future` = the typed
 * day is after today (refused: a sponsorship is logged after it is paid).
 */
export type Draft = { title: string; kind: SponsorKind | null; students: number | null; cents: number | null; when: string; on: string; dated: boolean; future: boolean };

/** "Sat Dec 5, 2026": a spending date with its year, for the chip and the money confirm. */
export const fullDate = (on: string) => `${shortDate(on)}, ${on.slice(0, 4)}`;

const SEASON = /\b(spring|summer|fall|winter)\s+(20\d\d)\b/i;
// Full month names, the 3-letter abbreviations (with an optional period) and "Sept"; never a longer word ("Junior", "Decathlon").
const MONTH_WORD = 'january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';
const MONTH_DAY = new RegExp(String.raw`\b(?:on\s+)?(${MONTH_WORD})\b\.?\s+(\d{1,2})(?:(?:st|nd|rd|th)\b)?(?:(?:,?\s+(20\d\d))|(?:\s+'(\d\d)))?(?![\d$])`, 'i');

/** The kind a title suggests: travel, fee, or conference (the default). */
export function kindFromTitle(text: string): SponsorKind {
  if (/travel/i.test(text)) return 'travel';
  if (/\bfees?\b/i.test(text)) return 'fee';
  return 'conference';
}

/**
 * Reads "NSBE regional conference 3 students $600 Dec 5" into the four real fields. A sponsorship is logged after it is
 * paid, and the date decides which year's Budget line it lands on, so a typed day with no year is the LAST time that day
 * came ("Dec 28" typed on 2027-01-03 is 2026-12-28); a typed year is kept, and a day after today is marked `future`
 * (refused by draftProblem). A season ("Spring 2026") or nothing keeps today as the spending date and the season as the words.
 */
export function readLine(text: string, today: string): Draft {
  let rest = ` ${text} `;
  let students: number | null = null;
  let cents: number | null = null;
  let when = '';
  let on = today;
  let dated = false;
  let future = false;
  const am = rest.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (am) {
    cents = Math.round(Number(am[1].replace(/,/g, '')) * 100);
    rest = rest.replace(am[0], ' ');
  }
  const sm = rest.match(/\b(\d+)\s*students?\b/i);
  if (sm) {
    students = Number(sm[1]);
    rest = rest.replace(sm[0], ' ');
  }
  const se = rest.match(SEASON);
  const md = rest.match(MONTH_DAY);
  if (se) {
    when = `${se[1][0].toUpperCase()}${se[1].slice(1).toLowerCase()} ${se[2]}`;
    rest = rest.replace(se[0], ' ');
  } else if (md) {
    const m = MO.findIndex((x) => x.toLowerCase() === md[1].slice(0, 3).toLowerCase());
    const d = Number(md[2]);
    const thisYear = Number(today.slice(0, 4));
    const typedYear = md[3] ? Number(md[3]) : md[4] ? 2000 + Number(md[4]) : null;
    let y = typedYear ?? thisYear;
    let day = validDay(y, m, d);
    // No year typed: the last time that day came. Still to come this year means last year's; Feb 29 in a year without one
    // means the most recent leap year's.
    if (typedYear === null) {
      for (let back = 0; back < 8 && (!day || day > today); back++) {
        y -= 1;
        day = validDay(y, m, d);
      }
      if (!day || day > today) {
        y = thisYear;
        day = null;
      }
    }
    if (day) {
      on = day;
      dated = true;
      future = day > today;
      when = y === thisYear ? shortDate(day) : `${shortDate(day)}, ${y}`;
      rest = rest.replace(md[0], ' ');
    }
  }
  let title = rest.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);
  return { title, kind: title ? kindFromTitle(title) : null, students, cents, when, on, dated, future };
}

// "2026-12-05" for a real calendar day (month 0-based), or null ("Feb 30").
function validDay(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

/** The largest amount one sponsorship may log ($1,000,000) and the most students. */
export const MAX_CENTS = 100_000_000;
export const MAX_STUDENTS = 10_000;

/** The line under the field when the draft cannot be logged yet, or null when it can (the confirm step opens). */
export function draftProblem(d: Draft): string | null {
  if (!d.title) return 'Say what it was for.';
  if (d.title.length > 200) return 'Keep what it was for under 200 characters.';
  if (d.cents === null) return 'Add the amount, like $600.';
  if (d.cents <= 0) return 'The amount must be more than $0.';
  if (d.cents > MAX_CENTS) return 'Keep the amount at $1,000,000 or less.';
  if (d.students !== null && d.students > MAX_STUDENTS) return 'Keep students at 10,000 or less.';
  if (d.future) return "That date hasn't come yet. Log it once it's paid.";
  if (d.when.length > 60) return 'Keep the date or season short.';
  return null;
}

/** The fields the write sends (the rpc's six arguments, in page terms). */
export type LogInput = { title: string; kind: SponsorKind; students: number; cents: number; when: string; on: string };

/** A checked draft as the write's input (students default to 0, kind to conference). */
export function toInput(d: Draft): LogInput {
  return { title: d.title, kind: d.kind ?? 'conference', students: d.students ?? 0, cents: d.cents ?? 0, when: d.when, on: d.on };
}

/** The row a successful log adds to the list before the refresh brings the stored one. */
export function rowFromInput(id: string, p: LogInput): SponsorRow {
  return { id, title: p.title, kind: p.kind, students: p.students, cents: p.cents, when: whenWords(p.when, p.on), on: p.on, state: 'done' };
}

// ---------- After a failed log: did it save? ----------

/**
 * The log has no browser-made id (the rpc takes none), so a request that timed out may still have saved. Before the log,
 * the page notes the ids of rows with the same title, amount and date; after a failure it reads them again. A new id means
 * it saved (no resend); the same ids mean it did not (Try again is safe); a failed read means nobody knows yet.
 */
export type Verdict = { state: 'saved'; id: string } | { state: 'not_saved' } | { state: 'unknown' };

/** Compares the matching ids before the log with the ids after it (null = that read failed). */
export function verdict(before: string[] | null, after: string[] | null): Verdict {
  if (!before || !after) return { state: 'unknown' };
  const seen = new Set(before);
  const added = after.filter((id) => !seen.has(id));
  return added.length ? { state: 'saved', id: added[0] } : { state: 'not_saved' };
}

/**
 * What the page does after a check: a saved log is treated as logged (no resend); a log that did not save offers Try
 * again; an unknown one offers only "Check again".
 */
export function afterCheck(v: Verdict): { next: 'logged'; id: string } | { next: 'retry'; words: string } | { next: 'recheck'; words: string } {
  if (v.state === 'saved') return { next: 'logged', id: v.id };
  if (v.state === 'not_saved') return { next: 'retry', words: LOG_WORDS.notSaved };
  return { next: 'recheck', words: LOG_WORDS.unknown };
}

/** Plain words for each outcome of a log, shown in the confirm box and announced once. */
export const LOG_WORDS = {
  checking: 'Checking whether it saved…',
  notSaved: "It didn't save. Try again.",
  unknown: "Couldn't check whether it saved. Check again before logging it again.",
  noCategory: 'Budget has no Sponsorships line for that year yet.',
  failed: "Couldn't save. Try again.",
  denied: "You don't have permission to log sponsorships.",
  invalid: 'Those values were refused. Check the amount and the date.',
  savedEarlier: 'That one is already in the list. Press Log again to add another.',
} as const;

// ---------- Paged reads ----------

/** Rows per request (the database API's cap). */
export const PAGE_SIZE = 1000;
/** The most pages one read may take (20,000 sponsorships in a year is far past real use). */
export const MAX_PAGES = 20;

/**
 * Reads every row through `fetchPage(from, to)` (inclusive positions, as `.range()` takes them), ordered by a unique key by
 * the caller. Each page starts after the rows read so far; an empty page ends the read; reaching MAX_PAGES with rows still
 * coming throws (the page shows its load error, never a partial list).
 */
export async function readPaged<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = PAGE_SIZE, max = MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`sponsorships: more than ${max} pages; refusing a partial list.`);
}

// ---------- Live mode's controls and words ----------

/**
 * Live mode's controls. Logging is real: rpc log_sponsorship saves the sponsorship and its spending entry in one step (the
 * function is granted to signed-in staff and runs under their row-level security). Undo is NOT: there is no reverse write
 * (deleting the row is not offered by any function), so Undo is mock only.
 */
export function liveCaps(): SponsorCaps {
  return { log: true, undo: false };
}

/**
 * "How a sponsorship works" in live mode. Step 3 names no person: the demo's "Dana Mercer" is the sample admin, and the
 * real person who pays is not stored anywhere.
 */
export const HOW_LIVE: HowStep[] = [
  { title: 'A request comes in', body: 'A student or an organization asks for help, in the board chat or by email to the board.' },
  { title: 'The board agrees in chat', body: 'Board members talk it over and agree on an amount.' },
  { title: 'Someone on the board pays and keeps the receipt', body: '' },
  { title: 'It is logged once, here', body: 'Logging it also records the spending on Budget, under Sponsorships. Log it once, here.', here: true },
];
