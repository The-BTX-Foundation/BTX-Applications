// Pure logic for the refreshed Goals page (lib/goals-view.ts): goal rows and award-cycle bars from table rows, the year's
// progress mark, the Year over year helpers (keys, the box that opens first, parsing what was typed) and the news card.
// No server imports, so it is unit-tested (tests/goals-map.test.ts). The goal counting itself stays in lib/daily-goals.ts.
import { goalCard, type GoalFacts } from './daily-goals';
import { atDay, shortDate, daysFrom } from './refresh-time';
import type { CycleRow, FigureMetric, GoalRow, GoalsCaps, YearFigure } from './goals-view';

export type Raw = Record<string, unknown>;
const str = (v: unknown) => String(v ?? '');
const num = (v: unknown) => Number(v ?? 0);

/** "$9,800" from cents, whole dollars (the page never shows cents). */
export function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** "$6" from cents, rounded UP to the next dollar ("to go" amounts: 40 cents left reads "$1 to go", never "$0"). */
export function moneyUp(cents: number): string {
  return `$${Math.ceil(cents / 100).toLocaleString('en-US')}`;
}

/** "1,248" with thousands commas. */
export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** How far through its calendar year `today` is (Nov 10, 2026 = day 314 of 365 = 0.86). */
export function yearDone(today: string): number {
  const d = atDay(today);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const days = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
  // Day of the year counted from 1 (Jan 1 = 1), so Dec 31 is the whole year.
  return (Math.round((d.getTime() - start) / 86_400_000) + 1) / days;
}

/** Which counting reads failed (live mode): their goals show "Couldn't count" instead of a zero. */
export type CountMiss = { steps: boolean; scores: boolean };
const NO_MISS: CountMiss = { steps: false, scores: false };

/**
 * One goal row from a `goals` row and the counted facts. The status (incl. turning "met") comes from goalCard. `miss` marks
 * the steps or scores read as failed: those goals get `uncounted` (their counts are zero only because nothing was read).
 */
export function goalRow(g: Raw, f: GoalFacts, today: string, miss: CountMiss = NO_MISS): GoalRow {
  const card = goalCard(g, f);
  const base = { id: str(g.id), title: str(g.title), status: card.status, note: null as string | null };
  switch (str(g.metric)) {
    case 'money_raised': {
      // The money still to raise is the page's news: its icon is gold-ink.
      return { ...base, icon: 'money', lead: true, kind: 'money', have: f.raisedCents, of: g.target_cents ? num(g.target_cents) : 0, unit: 'raised' };
    }
    case 'budget_spent': {
      // Spending counts against the goal's own target, or the year's whole budget.
      const of = g.target_cents ? num(g.target_cents) : f.budgetCents;
      return { ...base, icon: 'money', lead: false, kind: 'money', have: f.spentCents, of, unit: 'spent' };
    }
    case 'checklist': {
      const s = f.checklistSteps[str(g.checklist_id)] ?? { done: 0, total: 0 };
      return { ...base, icon: 'flag', lead: false, kind: 'steps', have: s.done, of: s.total, unit: 'steps done', ...(miss.steps ? { uncounted: true } : {}) };
    }
    case 'applicants_scored': {
      const cid = g.cycle_id ? str(g.cycle_id) : f.currentCycleId;
      const s = (cid && f.cycleScores[cid]) || { scored: 0, applications: 0, decisionDate: null };
      return { ...base, icon: 'cap', lead: false, kind: 'marks', have: s.scored, of: s.applications, unit: 'applicants scored', note: awardNote(today, s.decisionDate), ...(miss.scores ? { uncounted: true } : {}) };
    }
    default: {
      // A goal typed in by hand: its value against its target.
      return { ...base, icon: 'goals', lead: false, kind: 'marks', have: num(g.manual_value), of: num(g.target_count), unit: 'done' };
    }
  }
}

/** The line beside an award goal's status: "Award Mon Nov 30 · in 20 days", "Award Mon Nov 30" once it is today or past, or null. */
export function awardNote(today: string, decisionDate: string | null): string | null {
  if (!decisionDate) return null;
  const day = decisionDate.slice(0, 10);
  const n = daysFrom(today, day);
  if (n <= 0) return `Award ${shortDate(day)}`;
  return `Award ${shortDate(day)} · in ${n} day${n === 1 ? '' : 's'}`;
}

// "Fall 2026" -> { word: "Fall", year: 2026 }; a term with no year takes the fallback year.
function splitTerm(term: string, fallbackYear: number): { word: string; year: number } {
  const m = /^(.*?)\s*(\d{4})$/.exec(term.trim());
  return m ? { word: m[1] || term, year: Number(m[2]) } : { word: term.trim(), year: fallbackYear };
}

// Sort key inside a year: spring, summer, fall, then anything else.
const termKey = (word: string, year: number) => year * 10 + (/spring/i.test(word) ? 1 : /summer/i.test(word) ? 2 : /fall/i.test(word) ? 3 : 4);

/**
 * Scholars funded per award cycle, oldest first ("Spring 2021", 2). Awards count under their cycle, or under the past term
 * typed on old awards. A published cycle with no awards yet is the dashed "?" bar at the end, with its decision day.
 */
export function cycleRows(awards: Raw[], cycles: Raw[], thisYear: number): CycleRow[] {
  const byCycle = new Map(cycles.map((c) => [str(c.id), c]));
  const groups = new Map<string, { label: string; n: number; key: number }>();
  for (const a of awards) {
    const c = a.cycle_id ? byCycle.get(str(a.cycle_id)) : undefined;
    let k: string;
    let t: { word: string; year: number };
    if (c) {
      k = `c:${str(c.id)}`;
      t = splitTerm(str(c.term), num(c.year));
    } else if (a.past_term) {
      k = `p:${str(a.past_term)}`;
      t = splitTerm(str(a.past_term), thisYear);
    } else continue;
    const g = groups.get(k) ?? { label: `${t.word} ${t.year}`, n: 0, key: termKey(t.word, t.year) };
    g.n += 1;
    groups.set(k, g);
  }
  const rows: CycleRow[] = [...groups.values()].sort((a, b) => a.key - b.key).map((g) => ({ label: g.label, count: g.n, note: null }));
  // The cycle being decided: published, with no awards yet (the newest one if there are several).
  const decided = new Set(awards.map((a) => str(a.cycle_id)));
  const open = cycles.filter((c) => c.status === 'published' && !decided.has(str(c.id))).sort((a, b) => num(b.year) - num(a.year))[0];
  if (open) {
    const t = splitTerm(str(open.term), num(open.year));
    const d = open.decision_date ? str(open.decision_date).slice(0, 10) : null;
    rows.push({ label: `${t.word} ${t.year}`, count: null, note: d ? `Decided ${shortDate(d)}` : null });
  }
  return rows;
}

/** The line beside "Scholars funded": "14 since 2021", or '' when nothing was awarded. */
export function cyclesTotal(rows: CycleRow[]): string {
  const counted = rows.filter((r) => r.count != null);
  if (counted.length === 0) return '';
  const total = counted.reduce((s, r) => s + (r.count ?? 0), 0);
  const first = /(\d{4})$/.exec(counted[0].label)?.[1];
  return first ? `${total} since ${first}` : `${total} in all`;
}

/** The key of one Year over year cell: "money_raised_cents:2025". */
export function figureKey(metric: FigureMetric, year: number): string {
  return `${metric}:${year}`;
}

/** Splits a cell key back into its metric and year. */
export function parseKey(key: string): { metric: FigureMetric; year: number } {
  const i = key.lastIndexOf(':');
  return { metric: key.slice(0, i) as FigureMetric, year: Number(key.slice(i + 1)) };
}

/** Past years' figures from `year_figures` rows: only the two metrics the page shows, only the years it lists. */
export function mapFigures(rows: Raw[], years: number[]): YearFigure[] {
  return rows
    .filter((r) => (r.metric === 'money_raised_cents' || r.metric === 'applicants') && years.includes(num(r.year)))
    .map((r) => ({ year: num(r.year), metric: r.metric as FigureMetric, value: num(r.value) }));
}

/** The box open when the page opens: money raised for the latest listed year that has none yet, or null when all are in. */
export function firstOpenFigure(years: number[], figures: YearFigure[]): string | null {
  const missing = [...years].sort((a, b) => b - a).find((y) => !figures.some((f) => f.metric === 'money_raised_cents' && f.year === y));
  return missing == null ? null : figureKey('money_raised_cents', missing);
}

// Money as typed: "$12,400.50" (commas only in threes) or "$12400.5" / "12400.5", at most two decimals. Anything else (hex, exponent,
// binary, "1,2,3", a minus sign, three decimals) is refused, so Number() never reads a form a person would not mean.
const MONEY_RE = /^\$?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\$?\d+(\.\d{1,2})?$/;
// Applicants as typed: digits, commas allowed ("1,248"); the comma grouping is checked in parseFigure.
const COUNT_RE = /^\d[\d,]*$/;
/** The largest figures the boxes take: $100,000,000 and 1,000,000 applicants (a typo guard, far above anything real). */
export const MAX_MONEY_DOLLARS = 100_000_000;
export const MAX_APPLICANTS = 1_000_000;
const MONEY_ERR = 'Enter an amount in dollars, like 12,400.';
const COUNT_ERR = 'Enter a whole number, like 18.';

/**
 * What was typed in a figure box: money as dollars ("12,400", "$12,400.50") stored as cents, applicants as a whole number.
 * Returns the stored value, or the error line the box shows.
 */
export function parseFigure(metric: FigureMetric, text: string): { ok: true; value: number } | { ok: false; error: string } {
  const t = text.trim();
  if (metric === 'money_raised_cents') {
    if (!MONEY_RE.test(t)) return { ok: false, error: MONEY_ERR };
    const [whole, frac = ''] = t.replace(/[$,]/g, '').split('.');
    const dollars = Number(whole);
    if (dollars > MAX_MONEY_DOLLARS || (dollars === MAX_MONEY_DOLLARS && Number(frac) > 0)) return { ok: false, error: MONEY_ERR };
    // Whole cents from the digits themselves, no floating-point rounding: "12.5" is 1250.
    return { ok: true, value: dollars * 100 + Number(frac.padEnd(2, '0')) };
  }
  // Commas, when used, must group by threes ("1,248"); "1,2,3" is refused.
  if (!COUNT_RE.test(t) || (t.includes(',') && !/^\d{1,3}(,\d{3})*$/.test(t))) return { ok: false, error: COUNT_ERR };
  const n = Number(t.replace(/,/g, ''));
  if (n > MAX_APPLICANTS) return { ok: false, error: COUNT_ERR };
  return { ok: true, value: n };
}

/**
 * Reads every row of a paged query. PostgREST caps each request (1,000 rows by default, possibly fewer) and says nothing
 * when it does, so one plain read could silently undercount. Each request asks for `size` rows starting where the rows
 * received so far end (the offset moves by what actually came back, so a page capped below `size` skips nothing), and the
 * read ends only on an EMPTY page. `maxRows` is a safety stop: once that many rows are in, one more page is asked for, and
 * if it is not empty the read throws (the page shows its load error) rather than return a partial count.
 */
export async function pageAll<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = 1000, maxRows = 50_000): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const page = await fetchPage(all.length, all.length + size - 1);
    if (page.length === 0) return all;
    if (all.length >= maxRows) throw new Error(`More than ${maxRows} rows; refusing a partial count.`);
    all.push(...page);
  }
}

/** The news card under the title: the money still to raise this year, or null once it is met (or there is none). */
export function goalsNews(goals: GoalRow[]): { left: number; title: string } | null {
  const g = goals.find((x) => x.lead && x.kind === 'money');
  if (!g || g.of <= 0 || g.have >= g.of) return null;
  return { left: g.of - g.have, title: g.title };
}

/**
 * Live mode's controls. Saving a past year's figure is a real write (year_figures upsert; the team policy lets admins and
 * board members write it), and Undo is its reverse (delete the row the save added, or put the old value back).
 */
export function liveCaps(): GoalsCaps {
  return { figure: true, figureUndo: true };
}
