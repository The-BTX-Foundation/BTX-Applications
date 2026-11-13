// The Awardees page's loader (shape in lib/awardees-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/awardees-view.ts; live mode reads the real tables (lib/awardees-live.ts) and ignores every `demo` flag.
import { hasSupabaseEnv } from '@btx/data';
import { AW_VIEW_AFTER, AW_VIEW_BEFORE, AW_VIEW_EMPTY, AW_VIEW_STRESS } from '@/mock/awardees-view';
import { awSessionReader } from './awardees-db';
import { loadLiveAwardees } from './awardees-live';
import type { AwardeesResult } from './awardees-view';

/** A 120-character name (the longest the page is tested with; full_name allows 200). */
export const LONG_NAME = 'Adaeze-Grace Oluwaseun Chukwuemeka Nwachukwu-Bello Okonkwo-Ibekwe Adebayo-Ogunleye Fitzgerald-Montgomery Hernandez-River';

/**
 * The mock page. `?demo=after` the "after the award" moment, `?demo=stress` that moment with the longest name,
 * `?demo=empty` nothing recorded, `?demo=error` the page's designed load error, `?demo=pasterror` only the past section's
 * load error, `?demo=failsave` the first try of each write fails, `?demo=failed` the whole-page "didn't load" card.
 * (`?demo=loading` is handled by the page: the skeleton.)
 */
export function awMockView(demo?: string): AwardeesResult {
  if (demo === 'failed') return { failed: true };
  // `?demo=longname`: the stress moment with a 120-character name (wrapping check).
  if (demo === 'longname') return { ...AW_VIEW_STRESS, awards: AW_VIEW_STRESS.awards.map((a, i) => (i === 0 ? { ...a, name: LONG_NAME } : a)) };
  const view = demo === 'stress' ? AW_VIEW_STRESS : demo === 'empty' ? AW_VIEW_EMPTY : demo === 'after' || demo === 'failsave' || demo === 'pasterror' ? AW_VIEW_AFTER : AW_VIEW_BEFORE;
  // `pasterror` keeps the past rows so the mock "Try again" can draw them (live sends none when that read fails).
  return { ...view, loadFailed: demo === 'error', pastFailed: demo === 'pasterror', failFirst: demo === 'failsave' };
}

/** The page's data: the mock sample, or the live tables as a person with `role`. */
export async function loadAwardeesView({ demo, role }: { demo?: string; role: string }): Promise<AwardeesResult> {
  if (!hasSupabaseEnv()) return awMockView(demo);
  return loadLiveAwardees(awSessionReader, role);
}
