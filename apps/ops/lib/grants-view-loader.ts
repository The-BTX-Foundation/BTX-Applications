// The Grants page's loader (refreshed page, shape in lib/grants-view.ts). Mock mode (no Supabase env) returns the demo's
// sample from mock/grants-view.ts; live mode builds the same shape from the real tables in lib/grants-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { GRANTS_VIEW, GRANTS_VIEW_EMPTY, GRANTS_VIEW_STRESS } from '@/mock/grants-view';
import { sessionReader } from './grants-db';
import { loadLiveGrantsView } from './grants-live';
import type { GrantsResult } from './grants-view';

/**
 * The mock view for a `?demo=` value (mock mode only; live mode ignores `demo`): `stress` the longest names and 99+ counts,
 * `empty` no grants, `error` the demo's "Grants didn't load." state (the title and the error card), `steperror` the
 * checklist's own error line (its read failed, the grants still show), `failed` the whole-page "didn't load" card.
 * (`?demo=loading` is handled by the page: the skeleton.)
 */
export function mockGrantsView(demo?: string): GrantsResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? GRANTS_VIEW_STRESS : demo === 'empty' ? GRANTS_VIEW_EMPTY : GRANTS_VIEW;
  return { ...view, checklist: demo === 'steperror' ? null : view.checklist, loadFailed: demo === 'error', failed: false };
}

/** Loads what the Grants page draws. */
export async function loadGrantsView({ demo }: { demo?: string } = {}): Promise<GrantsResult> {
  if (!hasSupabaseEnv()) return mockGrantsView(demo);
  return loadLiveGrantsView(sessionReader);
}
