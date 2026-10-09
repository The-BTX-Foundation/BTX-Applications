// The Goals page as the page uses it. MOCK today (mock/goals.ts). Live mode will read `goals` (the year's cards; the
// value is counted per `metric` from tasks / spending / applications) and `year_figures` (past years, entered by
// hand). Going live is a swap inside loadGoals; the page and components only see GoalsData.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { MOCK_GOALS, MOCK_GOALS_STRESS, type GoalsData } from '@/mock/goals';

export type GoalsResult = (GoalsData & { failed: false }) | { failed: true };

export async function loadGoals(opts: { demo?: string } = {}): Promise<GoalsResult> {
  if (opts.demo === 'error') return { failed: true };
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_GOALS_STRESS : MOCK_GOALS), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    // The generated DB types do not know the draft tables yet, so the query builder is used untyped.
    type Q = { select: (c: string) => Q & PromiseLike<{ error: unknown }>; eq: (c: string, v: unknown) => Q & PromiseLike<{ error: unknown }>; order: (c: string) => PromiseLike<{ error: unknown }>; in: (c: string, v: unknown[]) => PromiseLike<{ error: unknown }> };
    const client = (await sessionClient()) as unknown as { from: (t: string) => Q };
    const year = new Date().getFullYear();
    const { error: e1 } = await client.from('goals').select('id, year, title, metric, status, target_cents, target_count, manual_value, position').eq('year', year).order('position');
    if (e1) throw e1;
    const { error: e2 } = await client.from('year_figures').select('year, metric, value').in('metric', ['money_raised_cents', 'applicants']);
    if (e2) throw e2;
    // TODO: count each card's value per `metric` (money_raised, budget_spent, checklist, applicants_scored) and fill
    // the chart from awards per cycle; until then the derived parts return the mock shape.
    return { ...MOCK_GOALS, year, failed: false };
  } catch {
    return { failed: true };
  }
}
