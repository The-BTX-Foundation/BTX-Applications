// The Goals page as the page uses it. Mock mode returns the Figma sample (mock/goals.ts). Live mode reads `goals` (the
// year's cards; each value is counted from gifts, spending, a checklist or the scores per its `metric`), `year_figures`
// (past years, entered by hand) and `scholarship_awards` (the bars). The pure counting is in lib/daily-goals.ts.
import { hasSupabaseEnv } from '@btx/data';
import { readRows } from './daily-db';
import { safe } from './daily-load';
import { cycleBars, goalCard, yoyYears, type GoalFacts } from './daily-goals';
import { easternDay } from './daily-tasks';
import { MOCK_GOALS, MOCK_GOALS_STRESS, type GoalsData, type YearFigure } from '@/mock/goals';

export type GoalsResult = (GoalsData & { failed: false }) | { failed: true };

export async function loadGoals(opts: { demo?: string } = {}): Promise<GoalsResult> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_GOALS_STRESS : MOCK_GOALS), failed: false };
  try {
    const year = Number(easternDay(new Date()).slice(0, 4));
    const goals = await readRows('goals', 'id, year, title, metric, status, target_cents, target_count, manual_value, checklist_id, cycle_id, position', { eq: { year }, order: ['position', true] });
    const [figures, awards, cycles, gifts, totals, tasks, reviews, summary] = await Promise.all([
      readRows('year_figures', 'year, metric, value'),
      readRows('scholarship_awards', 'cycle_id, past_term, kind'),
      readRows('cycles', 'id, term, year, status, decision_date'),
      safe(readRows('gifts', 'amount_cents', { gte: { gift_on: `${year}-01-01` }, lte: { gift_on: `${year}-12-31` } })),
      safe(readRows('budget_category_totals', 'budget_cents, spent_cents', { eq: { year } })),
      safe(readRows('tasks', 'checklist_id, status', { eq: { archived: false } })),
      safe(readRows('application_reviews', 'id, cycle_id')),
      safe(readRows('application_score_summary', 'application_id, published_count')),
    ]);
    const checklistSteps: GoalFacts['checklistSteps'] = {};
    for (const t of tasks) {
      if (!t.checklist_id || t.status === 'declined') continue;
      const s = (checklistSteps[String(t.checklist_id)] ??= { done: 0, total: 0 });
      s.total += 1;
      if (t.status === 'done') s.done += 1;
    }
    const published = new Map(summary.map((s) => [String(s.application_id), Number(s.published_count)]));
    const cycleScores: GoalFacts['cycleScores'] = {};
    for (const c of cycles) {
      const apps = reviews.filter((r) => r.cycle_id === c.id);
      cycleScores[String(c.id)] = {
        applications: apps.length,
        scored: apps.filter((a) => (published.get(String(a.id)) ?? 0) >= 2).length,
        decisionDate: (c.decision_date as string | null) ?? null,
      };
    }
    const current = cycles.filter((c) => c.status === 'published').sort((a, b) => Number(b.year) - Number(a.year))[0] ?? cycles[0];
    const facts: GoalFacts = {
      year,
      raisedCents: gifts.reduce((s, g) => s + Number(g.amount_cents), 0),
      spentCents: totals.reduce((s, t) => s + Number(t.spent_cents ?? 0), 0),
      budgetCents: totals.reduce((s, t) => s + Number(t.budget_cents ?? 0), 0),
      checklistSteps,
      cycleScores,
      currentCycleId: current ? String(current.id) : null,
    };
    return {
      year,
      cards: goals.map((g) => goalCard(g, facts)),
      cycles: cycleBars(awards, cycles),
      yoyYears: yoyYears(year),
      figures: figures
        .filter((f) => f.metric === 'money_raised_cents' || f.metric === 'applicants')
        .map((f): YearFigure => ({ year: Number(f.year), metric: f.metric as YearFigure['metric'], value: Number(f.value) })),
      failed: false,
    };
  } catch {
    return { failed: true };
  }
}
