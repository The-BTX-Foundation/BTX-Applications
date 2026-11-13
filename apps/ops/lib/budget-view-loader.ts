// The Budget page's loader (refreshed page, shape in lib/budget-view.ts), used by both /finance/budget and
// /finance/budget/approval. Mock mode (no Supabase env) returns the demo's sample from mock/budget-view.ts; live mode builds
// the same shape from the real tables in lib/budget-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { BUDGET_VIEW, BUDGET_VIEW_EMPTY, BUDGET_VIEW_STRESS } from '@/mock/budget-view';
import { sessionReader } from './budget-db';
import { loadLiveBudgetView } from './budget-live';
import type { BudgetResult } from './budget-view';

/**
 * Loads what the Budget pages draw. `me` is the signed-in person's id (requireStaff); `plan` is the approval page's
 * ?plan=<budget_quarter_plans id> (undefined elsewhere). Mock mode only (live mode ignores `demo`): `?demo=stress` the
 * biggest numbers and an over-budget line, `?demo=empty` no plan yet, `?demo=error` the demo's "Load error" state (the header
 * and the "Budget didn't load." card), `?demo=failed` the whole-page "didn't load" card, `?demo=unavailable` (or a ?plan=
 * other than the sample's) "That plan isn't available.". (`?demo=loading` is handled by the page: the skeleton.)
 */
export async function loadBudgetView({ demo, me, plan }: { demo?: string; me: string; plan?: string }): Promise<BudgetResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? BUDGET_VIEW_STRESS : demo === 'empty' ? BUDGET_VIEW_EMPTY : BUDGET_VIEW;
    if (demo === 'unavailable' || (plan !== undefined && plan !== view.plan.id)) return { failed: true, unavailable: true };
    return { ...view, loadFailed: demo === 'error', failed: false };
  }
  return loadLiveBudgetView(sessionReader, me, undefined, plan);
}
