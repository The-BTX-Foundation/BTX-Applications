// The Goals page as the page uses it. MOCK (mock/goals.ts) when there is no Supabase env. LIVE: `goals` for the year
// (each card's value counted per `metric`: money raised from gifts, budget spent from spending_entries, checklist steps
// from tasks, applicants scored from application_reviews + application_score_summary), `year_figures` for Year over
// year, and `scholarship_awards` per cycle for the chart. The counting itself is in lib/goals-build.ts (tested).
import { hasSupabaseEnv } from '@btx/data';
import { MOCK_GOALS, MOCK_GOALS_STRESS, type GoalsData, type YearFigure } from '@/mock/goals';
import { awardBars, goalCard, type AwardRow, type CycleRow, type GoalFacts, type GoalRow } from './goals-build';
import { looseClient, rows, type Loose, type Row } from './team-db';
import { easternToday } from './team-dates';

export type GoalsResult = (GoalsData & { failed: false }) | { failed: true };

const num = (v: unknown) => Number(v ?? 0);
const sum = (rs: Row[], col: string) => rs.reduce((n, r) => n + num(r[col]), 0);

// Counts what the year's goals need.
async function facts(client: Loose, year: number, goals: GoalRow[]): Promise<GoalFacts> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const listIds = goals.map((g) => g.checklist_id).filter((x): x is string => Boolean(x));
  const cycleIds = goals.map((g) => g.cycle_id).filter((x): x is string => Boolean(x));
  const [gifts, spend, cats, steps, apps, summary, cycles] = await Promise.all([
    rows(client, 'gifts', 'amount_cents', { gte: { gift_on: from }, lte: { gift_on: to } }),
    rows(client, 'spending_entries', 'amount_cents', { gte: { spent_on: from }, lte: { spent_on: to } }),
    rows(client, 'budget_categories', 'budget_cents', { eq: { year } }),
    listIds.length ? rows(client, 'tasks', 'checklist_id, status', { in: { checklist_id: listIds }, eq: { archived: false } }) : Promise.resolve([]),
    cycleIds.length ? rows(client, 'application_reviews', 'id, cycle_id', { in: { cycle_id: cycleIds } }) : Promise.resolve([]),
    cycleIds.length ? rows(client, 'application_score_summary', 'application_id, published_count') : Promise.resolve([]),
    cycleIds.length ? rows(client, 'cycles', 'id, decision_date', { in: { id: cycleIds } }) : Promise.resolve([]),
  ]);
  const checklists: GoalFacts['checklists'] = {};
  for (const s of steps) {
    const c = (checklists[String(s.checklist_id)] ??= { done: 0, total: 0 });
    c.total += 1;
    if (s.status === 'done') c.done += 1;
  }
  const scored = new Set(summary.filter((s) => num(s.published_count) >= 2).map((s) => String(s.application_id)));
  const cyc: GoalFacts['cycles'] = {};
  for (const id of cycleIds) {
    const list = apps.filter((a) => a.cycle_id === id);
    const decision = cycles.find((c) => c.id === id)?.decision_date;
    cyc[id] = { total: list.length, scored: list.filter((a) => scored.has(String(a.id))).length, decision: decision ? String(decision) : null };
  }
  return { raisedCents: sum(gifts, 'amount_cents'), spentCents: sum(spend, 'amount_cents'), budgetCents: sum(cats, 'budget_cents'), checklists, cycles: cyc };
}

export async function loadGoals(opts: { demo?: string } = {}): Promise<GoalsResult> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_GOALS_STRESS : MOCK_GOALS), failed: false };
  try {
    const client = await looseClient();
    const year = Number(easternToday().slice(0, 4));
    const [goalRows, figures, awards, cycles] = await Promise.all([
      rows(client, 'goals', 'id, title, metric, status, target_cents, target_count, checklist_id, cycle_id, manual_value, position', { eq: { year }, order: ['position', true] }),
      rows(client, 'year_figures', 'year, metric, value', { in: { metric: ['money_raised_cents', 'applicants'] } }),
      rows(client, 'scholarship_awards', 'kind, cycle_id, past_term, past_term_starts'),
      rows(client, 'cycles', 'id, term, year, opens_at, decision_date, status'),
    ]);
    const goals: GoalRow[] = goalRows.map((g) => ({
      id: String(g.id),
      title: String(g.title),
      metric: g.metric as GoalRow['metric'],
      status: g.status as GoalRow['status'],
      target_cents: g.target_cents === null ? null : num(g.target_cents),
      target_count: g.target_count === null ? null : num(g.target_count),
      checklist_id: (g.checklist_id as string | null) ?? null,
      cycle_id: (g.cycle_id as string | null) ?? null,
      manual_value: g.manual_value === null ? null : num(g.manual_value),
    }));
    const f = await facts(client, year, goals);
    return {
      year,
      cards: goals.map((g) => goalCard(g, f)),
      cycles: awardBars(awards as unknown as AwardRow[], cycles.map((c) => ({ ...(c as unknown as CycleRow), year: num(c.year) }))),
      yoyYears: [year - 3, year - 2, year - 1],
      figures: figures.map((r) => ({ year: num(r.year), metric: r.metric as YearFigure['metric'], value: num(r.value) })),
      live: true,
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}
