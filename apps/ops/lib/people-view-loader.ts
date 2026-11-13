// The Board members page's loader (refreshed page, shape in lib/people-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/people-view.ts; live mode builds the same shape from the real tables in lib/people-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { PEOPLE_VIEW, PEOPLE_VIEW_EMPTY, PEOPLE_VIEW_STRESS } from '@/mock/people-view';
import { loadLivePeopleView } from './people-live';
import type { PeopleResult } from './people-view';

/**
 * Loads what the Board members page draws. Mock mode only (live mode ignores `demo`, unlike the old page, which honoured
 * `?demo=error` live too): `?demo=stress` adds an invited address and 120 open tasks, `?demo=empty` only the viewer,
 * `?demo=error` the demo's "Load error" state (the title and the "didn't load" card), `?demo=uncounted` the work cells as
 * live mode draws them when the work reads fail, `?demo=failed` the whole-page "didn't load" card. (`?demo=loading` is
 * handled by the page: the skeleton.)
 */
export async function loadPeopleView({ demo }: { demo?: string } = {}): Promise<PeopleResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? PEOPLE_VIEW_STRESS : demo === 'empty' ? PEOPLE_VIEW_EMPTY : PEOPLE_VIEW;
    return { ...view, workFailed: demo === 'uncounted', loadFailed: demo === 'error', failed: false };
  }
  return loadLivePeopleView();
}
