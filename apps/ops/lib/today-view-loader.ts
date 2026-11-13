// The Today page's loader (refreshed page, shape in lib/today-view.ts). Mock mode (no Supabase env) returns the demo's sample
// from mock/today-view.ts; live mode builds the same shape from the real tables in lib/today-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { TODAY_VIEW, TODAY_VIEW_EMPTY, TODAY_VIEW_STRESS } from '@/mock/today-view';
import { loadLiveTodayView } from './today-live';
import type { TodayResultV2 } from './today-view';

/**
 * Loads what the Today page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` draws the longest names and
 * biggest counts, `?demo=empty` the quiet day, `?demo=error` the demo's "Load error" state (the tasks panel says
 * "Your tasks didn't load" and the rest draws), `?demo=failed` the whole-page "didn't load" card.
 * (`?demo=loading` is handled by the page itself: it draws the skeleton.)
 */
export async function loadTodayView({ demo }: { demo?: string } = {}): Promise<TodayResultV2> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? TODAY_VIEW_STRESS : demo === 'empty' ? TODAY_VIEW_EMPTY : TODAY_VIEW;
    return { ...view, tasks: demo === 'error' ? [] : view.tasks, tasksFailed: demo === 'error', failed: false };
  }
  return loadLiveTodayView();
}
