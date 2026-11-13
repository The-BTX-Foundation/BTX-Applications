// The Goals page's loader (refreshed page, shape in lib/goals-view.ts). Mock mode (no Supabase env) returns the demo's sample
// from mock/goals-view.ts; live mode builds the same shape from the real tables in lib/goals-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { GOALS_VIEW, GOALS_VIEW_EMPTY, GOALS_VIEW_STRESS } from '@/mock/goals-view';
import { sessionReader } from './goals-db';
import { loadLiveGoalsView } from './goals-live';
import type { GoalsResultV2 } from './goals-view';

/**
 * Loads what the Goals page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` draws the passed goal and the
 * biggest numbers, `?demo=empty` no goals and no awards, `?demo=error` the demo's "Load error" state (the header and the
 * "Check your connection" card), `?demo=uncounted` the steps and scoring goals as live mode draws them when their counting
 * read fails, `?demo=failed` the whole-page "didn't load" card. (`?demo=loading` is handled by the page: the skeleton.)
 */
export async function loadGoalsView({ demo }: { demo?: string } = {}): Promise<GoalsResultV2> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? GOALS_VIEW_STRESS : demo === 'empty' ? GOALS_VIEW_EMPTY : GOALS_VIEW;
    const goals = demo === 'uncounted' ? view.goals.map((g) => (g.kind === 'money' ? g : { ...g, uncounted: true })) : view.goals;
    return { ...view, goals, loadFailed: demo === 'error', failed: false };
  }
  return loadLiveGoalsView(sessionReader);
}
