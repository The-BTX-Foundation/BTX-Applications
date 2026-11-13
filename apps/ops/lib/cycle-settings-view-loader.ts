// The Cycle settings page's loader (refreshed page, shape in lib/cycle-settings-view.ts). Mock mode (no Supabase env)
// returns the demo's sample from mock/cycle-settings-view.ts; live mode reads the real tables in lib/cycle-settings-live.ts
// and ignores every ?demo= value (no demo flag can fake a load error or switch a write on live).
import { hasSupabaseEnv } from '@btx/data';
import { CS_VIEW, CS_VIEW_DRAFT, CS_VIEW_EMPTY, CS_VIEW_STRESS, CS_VIEW_VIEWONLY } from '@/mock/cycle-settings-view';
import { loadLiveCycleSettings } from './cycle-settings-live';
import type { CycleSettingsResult } from './cycle-settings-view';

/**
 * The mock view for a `?demo=` value (mock mode only): `stress`, `draft`, `viewonly` and `empty` are the demo's states,
 * `error` its "Cycle settings didn't load." line under the header, `failed` the whole-page "didn't load" card.
 * (`?demo=loading` is handled by the page: the skeleton.)
 */
export function mockCycleSettingsView(demo?: string): CycleSettingsResult {
  if (demo === 'failed') return { failed: true };
  if (demo === 'error') return { ...CS_VIEW, cycle: null, loadFailed: true, canEdit: false, caps: { edit: false, publish: false, unpublish: false } };
  const pick = { stress: CS_VIEW_STRESS, draft: CS_VIEW_DRAFT, viewonly: CS_VIEW_VIEWONLY, empty: CS_VIEW_EMPTY } as Record<string, typeof CS_VIEW>;
  return (demo && pick[demo]) || CS_VIEW;
}

/** Loads what the Cycle settings page draws. `cycle` (?cycle=<id>) picks a cycle live; it must be a UUID. */
export async function loadCycleSettingsView({ demo, cycle }: { demo?: string; cycle?: string } = {}): Promise<CycleSettingsResult> {
  if (!hasSupabaseEnv()) return mockCycleSettingsView(demo);
  return loadLiveCycleSettings(undefined, cycle);
}
