// The refreshed Interviews page's loader (shape in lib/interviews-view.ts). Mock mode (no Supabase env) returns the demo's
// sample from mock/interviews-view.ts; live mode calls the existing loader (lib/interviews.ts loadInterviews, unchanged:
// the same reads the old page made) and maps its data with lib/interviews-map.ts. Live mode ignores `demo`.
import { hasSupabaseEnv } from '@btx/data';
import { INTERVIEWS_VIEW, INTERVIEWS_VIEW_EMPTY, INTERVIEWS_VIEW_STRESS } from '@/mock/interviews-view';
import { loadInterviews } from './interviews';
import { failedView, mapLive } from './interviews-map';
import type { InterviewsView } from './interviews-view';
import { currentStaffId } from './me';
import { easternDay } from './refresh-time';

/**
 * The mock view for a `?demo=` value: `stress` long names and many rows, `empty` no times built yet, `error` the demo's
 * load-error state (the title and one error line), `failed` the whole-page "didn't load" card. (`?demo=loading` is
 * handled by the page: the skeleton.)
 */
export function mockInterviewsView(demo?: string): InterviewsView {
  if (demo === 'failed') return failedView('mock', INTERVIEWS_VIEW.today);
  const view = demo === 'stress' ? INTERVIEWS_VIEW_STRESS : demo === 'empty' ? INTERVIEWS_VIEW_EMPTY : INTERVIEWS_VIEW;
  return { ...view, loadError: demo === 'error' };
}

/** Loads what the Interviews page draws. A failed live read is a load error (never zeros), logged with table and code only. */
export async function loadInterviewsView({ demo }: { demo?: string } = {}): Promise<InterviewsView> {
  const today = easternDay(new Date().toISOString());
  if (!hasSupabaseEnv()) return mockInterviewsView(demo);
  // Live: no demo flags reach the existing loader.
  const [data, me] = await Promise.all([loadInterviews(), currentStaffId()]);
  if (data.failed) {
    // The existing loader keeps the error (and which of its reads failed) to itself: log the page's reads as a whole, with no names or values.
    console.error('[interviews] read failed', { table: 'interviews', code: 'load' });
    return failedView('live', today);
  }
  return mapLive(data, today, me);
}
