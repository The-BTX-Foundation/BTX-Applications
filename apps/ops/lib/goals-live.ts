// Live mode: builds the Goals view (lib/goals-view.ts) from the real tables as the signed-in person. The reads go through a
// reader (lib/goals-db.ts: the session client, so row-level security applies), passed in so tests can stand in for the
// database (tests/goals-live.test.ts). The mapping is pure (lib/goals-map.ts, with the goal counting in lib/daily-goals.ts).
//
// What a failed read does, so a failure never reads as a true number:
// - core reads (goals, figures, awards, cycles, gifts, budget): the whole page shows its "Check your connection" card,
//   because "$0 raised" or "$15,000 to go" from a failed read would be false;
// - counting reads (checklist steps, applications and scores): only the goals that need them show "Couldn't count".
import type { ReadOpts, Row } from './daily-db';
import { yoyYears, type GoalFacts } from './daily-goals';
import { cycleRows, firstOpenFigure, goalRow, liveCaps, mapFigures, type CountMiss } from './goals-map';
import { easternDay } from './refresh-time';
import type { GoalsResultV2, GoalsView } from './goals-view';

/** How live mode reads: `rows` is one request (for small reads), `all` pages until every row is in. */
export type GoalsReader = {
  rows: (table: string, select: string, o?: ReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o?: ReadOpts) => Promise<Row[]>;
};

/**
 * Awards and cycles are a few dozen rows (two cycles a year); they are read in one ordered request capped here. Reaching
 * the cap means the table outgrew that assumption: the read fails (load error) rather than draw a partial history.
 */
export const SMALL_CAP = 1000;

/** The view live mode shows when a core read fails: the header and the "Check your connection" card, nothing else. */
export function failedView(today: string): GoalsView {
  const year = Number(today.slice(0, 4));
  return { today, year, years: [year], goals: [], cycles: [], yoyYears: yoyYears(year), figures: [], openFigure: null, loadFailed: true, caps: liveCaps() };
}

// One ordered read capped at SMALL_CAP rows; throws when the cap is reached (the result could be cut short).
async function small(read: GoalsReader, table: string, select: string): Promise<Row[]> {
  const rows = await read.rows(table, select, { order: ['id', true], limit: SMALL_CAP });
  if (rows.length >= SMALL_CAP) throw new Error(`${table}: ${SMALL_CAP} rows or more; refusing a partial read.`);
  return rows;
}

/** How many application ids one score read asks for. */
export const ID_CHUNK = 100;

// The published-score counts for these applications, read in chunks of ID_CHUNK ids (any chunk failing fails the read).
async function scoreRows(read: GoalsReader, ids: unknown[]): Promise<Row[]> {
  const chunks: unknown[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const parts = await Promise.all(chunks.map((c) => read.all('application_score_summary', 'application_id, published_count', { in: { application_id: c }, order: ['application_id', true] })));
  return parts.flat();
}

// Resolves to the rows, or to null when the read fails (a counting read: its goals show "Couldn't count").
const orNull = (p: Promise<Row[]>): Promise<Row[] | null> => p.catch(() => null);

/** Reads the real tables and returns the Goals view (loadFailed when a core read throws). `now` is for tests. */
export async function loadLiveGoalsView(read: GoalsReader, now = new Date()): Promise<GoalsResultV2> {
  const today = easternDay(now.toISOString());
  const year = Number(today.slice(0, 4));
  try {
    const years = yoyYears(year);
    // Core reads. Goals and figures are narrowed to this year and the listed years (a few rows); gifts are paged (one
    // year can pass 1,000 gifts); awards and cycles are small (see SMALL_CAP). Budget totals are one row per category.
    const [goals, figures, awards, cycles, gifts, totals] = await Promise.all([
      read.rows('goals', 'id, year, title, metric, status, target_cents, target_count, manual_value, checklist_id, cycle_id, position', { eq: { year }, order: ['position', true] }),
      read.rows('year_figures', 'year, metric, value', { in: { year: years, metric: ['money_raised_cents', 'applicants'] } }),
      small(read, 'scholarship_awards', 'id, cycle_id, past_term'),
      small(read, 'cycles', 'id, term, year, status, decision_date'),
      read.all('gifts', 'id, amount_cents', { gte: { gift_on: `${year}-01-01` }, lte: { gift_on: `${year}-12-31` } }),
      read.rows('budget_category_totals', 'budget_cents, spent_cents', { eq: { year } }),
    ]);
    const current = cycles.filter((c) => c.status === 'published').sort((a, b) => Number(b.year) - Number(a.year))[0] ?? cycles[0];
    const currentCycleId = current ? String(current.id) : null;
    // Only the checklists and cycles the goals point at are read for steps and scores.
    const checklistIds = [...new Set(goals.filter((g) => g.metric === 'checklist' && g.checklist_id).map((g) => String(g.checklist_id)))];
    const cycleIds = [...new Set(goals.filter((g) => g.metric === 'applicants_scored').map((g) => (g.cycle_id ? String(g.cycle_id) : currentCycleId)).filter((c): c is string => !!c))];
    // Counting reads: a failure marks only the goals that need them.
    const [tasks, apps] = await Promise.all([
      checklistIds.length ? orNull(read.all('tasks', 'id, checklist_id, status', { eq: { archived: false }, in: { checklist_id: checklistIds } })) : Promise.resolve([]),
      cycleIds.length ? orNull(read.all('applications', 'id, cycle_id', { eq: { status: 'submitted' }, in: { cycle_id: cycleIds } })) : Promise.resolve([]),
    ]);
    // Scores for those applications, asked for 100 ids at a time (one `in (...)` with every id could pass the URL limit).
    const summary = apps ? await orNull(scoreRows(read, apps.map((a) => a.id))) : null;
    const miss: CountMiss = { steps: tasks == null, scores: apps == null || summary == null };

    // Steps per checklist: done of total, declined steps left out.
    const checklistSteps: GoalFacts['checklistSteps'] = {};
    for (const t of tasks ?? []) {
      if (!t.checklist_id || t.status === 'declined') continue;
      const s = (checklistSteps[String(t.checklist_id)] ??= { done: 0, total: 0 });
      s.total += 1;
      if (t.status === 'done') s.done += 1;
    }
    // Applicants per cycle and how many have both scores published.
    const published = new Map((summary ?? []).map((s) => [String(s.application_id), Number(s.published_count)]));
    const cycleScores: GoalFacts['cycleScores'] = {};
    for (const c of cycles) {
      const list = (apps ?? []).filter((a) => a.cycle_id === c.id);
      cycleScores[String(c.id)] = {
        applications: list.length,
        scored: list.filter((a) => (published.get(String(a.id)) ?? 0) >= 2).length,
        decisionDate: (c.decision_date as string | null) ?? null,
      };
    }
    const facts: GoalFacts = {
      year,
      raisedCents: gifts.reduce((s, g) => s + Number(g.amount_cents), 0),
      spentCents: totals.reduce((s, t) => s + Number(t.spent_cents ?? 0), 0),
      budgetCents: totals.reduce((s, t) => s + Number(t.budget_cents ?? 0), 0),
      checklistSteps,
      cycleScores,
      currentCycleId,
    };
    const figs = mapFigures(figures, years);
    return {
      today,
      year,
      // Goals are counted from this year's records only (gifts, spending, steps, scores), so past years have nothing to
      // show: the picker lists the current year alone, and with one year it is not drawn.
      years: [year],
      goals: goals.map((g) => goalRow(g, facts, today, miss)),
      cycles: cycleRows(awards, cycles, year),
      yoyYears: years,
      figures: figs,
      openFigure: firstOpenFigure(years, figs),
      loadFailed: false,
      caps: liveCaps(),
      failed: false,
    };
  } catch {
    return { ...failedView(today), failed: false };
  }
}
