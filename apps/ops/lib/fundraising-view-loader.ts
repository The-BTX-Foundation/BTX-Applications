// The Fundraising page's loader (refreshed page, shape in lib/fundraising-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/fundraising-view.ts; live mode builds the same shape from the real tables (lib/fundraising-live.ts).
import { hasSupabaseEnv } from '@btx/data';
import { FUNDRAISING_VIEW, FUNDRAISING_VIEW_EMPTY, FUNDRAISING_VIEW_STRESS } from '@/mock/fundraising-view';
import type { FundraisingResult } from './fundraising-view';

/**
 * The mock result for a `?demo=` flag (live mode ignores every flag): `stress` and `empty` are the demo's samples, `error`
 * the demo's "Load error" state (the header and the "Fundraising didn't load." card), `nolist` the Year-end giving panel's
 * own load error (the state live mode shows when only the checklist read fails), `failed` the whole-page "didn't load"
 * card. (`?demo=loading` is handled by the page: the skeleton.)
 */
export function mockFundraising(demo?: string): FundraisingResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? FUNDRAISING_VIEW_STRESS : demo === 'empty' ? FUNDRAISING_VIEW_EMPTY : FUNDRAISING_VIEW;
  return { ...view, checklist: demo === 'nolist' ? null : view.checklist, loadFailed: demo === 'error', failed: false };
}

/** Loads what the Fundraising page draws. `me` is the signed-in person's id (live mode). */
export async function loadFundraisingView({ demo, me }: { demo?: string; me: string }): Promise<FundraisingResult> {
  if (!hasSupabaseEnv()) return mockFundraising(demo);
  // Imported here so mock mode (and the tests of mockFundraising) never load the server client.
  const [{ loadLiveFundraisingView }, { fundraisingReader }] = await Promise.all([import('./fundraising-live'), import('./fundraising-db')]);
  return loadLiveFundraisingView(fundraisingReader, me);
}
