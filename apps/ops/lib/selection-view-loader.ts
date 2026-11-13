// The Selection page's loader (shape in lib/selection-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/selection-view.ts; live mode reads the real tables (lib/selection-live.ts) and ignores every `demo` flag, so no
// flag can switch a control on, fake a state or fake a load error live.
import { hasSupabaseEnv } from '@btx/data';
import { SL_VIEW_EMPTY, SL_VIEW_MEETING, SL_VIEW_STRESS, SL_VIEW_TODAY } from '@/mock/selection-view';
import { slSessionReader } from './selection-db';
import { loadLiveSelection } from './selection-live';
import type { SelectionResult } from './selection-view';

/**
 * The mock page. Default (or `?demo=today`): before the meeting. `?demo=meeting` the meeting, `?demo=stress` the meeting
 * with the longest name on top and an extra award, `?demo=empty` nobody applied, `?demo=error` the designed load error,
 * `?demo=board` the meeting as a board member without admin rights (no Release), `?demo=failsave` the meeting where the
 * first try of each write fails, `?demo=failed` the whole-page "didn't load" card. (`?demo=loading` is handled by the
 * page: the skeleton.)
 */
export function slMockView(demo?: string): SelectionResult {
  if (demo === 'failed') return { failed: true };
  if (demo === 'stress') return SL_VIEW_STRESS;
  if (demo === 'empty') return SL_VIEW_EMPTY;
  if (demo === 'error') return { ...SL_VIEW_TODAY, loadFailed: true };
  if (demo === 'board') return { ...SL_VIEW_MEETING, caps: { ...SL_VIEW_MEETING.caps, release: false } };
  if (demo === 'failsave') return { ...SL_VIEW_MEETING, failFirst: true };
  if (demo === 'meeting') return SL_VIEW_MEETING;
  return SL_VIEW_TODAY;
}

/** The page's data: the mock sample, or the live tables as a person with `role`. */
export async function loadSelectionView({ demo, role }: { demo?: string; role: string }): Promise<SelectionResult> {
  if (!hasSupabaseEnv()) return slMockView(demo);
  return loadLiveSelection(slSessionReader, role);
}
