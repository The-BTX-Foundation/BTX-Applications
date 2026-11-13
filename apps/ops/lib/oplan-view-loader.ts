// The Outreach Plan page's loader (refreshed page, shape in lib/oplan-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/oplan-view.ts; live mode builds the same shape from the real tables (lib/oplan-live.ts).
import { hasSupabaseEnv } from '@btx/data';
import { pnMockEmpty, pnMockNormal, pnMockStress } from '@/mock/oplan-view';
import type { PnResult } from './oplan-view';

/**
 * The mock result for a `?demo=` flag (live mode ignores every flag): `stress` and `empty` are the demo's samples, `error`
 * the demo's "Load error" state (the header and the "Outreach plan didn't load." card), `failed` the whole-page "didn't
 * load" card. (`?demo=loading` is handled by the page: the skeleton; `?demo=failsave` by the board: every write refused.)
 */
export function mockOplan(demo?: string): PnResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? pnMockStress() : demo === 'empty' ? pnMockEmpty() : pnMockNormal();
  return { ...view, loadFailed: demo === 'error', failed: false };
}

/** Loads what the Outreach Plan page draws. `me` is the signed-in person's id (live mode). */
export async function loadOplanView({ demo, me }: { demo?: string; me: string }): Promise<PnResult> {
  if (!hasSupabaseEnv()) return mockOplan(demo);
  // Imported here so mock mode (and the tests of mockOplan) never load the server client.
  const [{ loadLiveOplanView }, { oplanSessionReader }] = await Promise.all([import('./oplan-live'), import('./oplan-db')]);
  return loadLiveOplanView(oplanSessionReader, me);
}
