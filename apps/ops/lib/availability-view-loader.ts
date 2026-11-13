// Interviews > Your availability: the page's loader (shape in lib/availability-view.ts). Mock mode (no Supabase env)
// returns the demo's sample from mock/availability-view.ts; live mode reads the real tables (lib/availability-live.ts)
// and ignores every `demo` flag, so no flag can switch a write on or fake a state live.
import { hasSupabaseEnv } from '@btx/data';
import { AV_VIEW, AV_VIEW_EMPTY, AV_VIEW_STRESS } from '@/mock/availability-view';
import { avSessionReader } from './availability-db';
import { loadLiveAvailability, type AvUser } from './availability-live';
import type { AvailabilityResult } from './availability-view';

/**
 * Mock mode only: `?demo=stress` split days and the longest names, `?demo=empty` nothing added, `?demo=error` the page's
 * designed load error, `?demo=failed` the whole-page "didn't load" card, `?demo=nodates` the interview dates aren't set,
 * `?demo=sent` the normal sample, `?demo=failsend` the first Send fails, `?demo=cover` booked times can be removed (as
 * live), so Send asks before taking you off an interview and then says who covers it. (`?demo=loading` is the page's: the skeleton.)
 */
export function avMockView(demo?: string): AvailabilityResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? AV_VIEW_STRESS : demo === 'empty' ? AV_VIEW_EMPTY : AV_VIEW;
  return {
    ...view,
    failed: false,
    noDates: demo === 'nodates',
    days: demo === 'nodates' ? [] : view.days,
    loadFailed: demo === 'error',
    failFirst: { send: demo === 'failsend' },
    // Live keeps no booked half hours on the line, so taking one away is the cover story; the cover demo plays it.
    ...(demo === 'cover' ? { caps: { ...view.caps, bookings: false } } : {}),
  };
}

/** The page's data: the mock sample, or the live tables as `user`. */
export async function loadAvailabilityView({ demo, user }: { demo?: string; user: AvUser }): Promise<AvailabilityResult> {
  if (!hasSupabaseEnv()) return avMockView(demo);
  const view = await loadLiveAvailability(avSessionReader, user);
  return { ...view, failed: false };
}
