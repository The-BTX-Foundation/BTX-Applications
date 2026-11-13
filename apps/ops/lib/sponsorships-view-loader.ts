// The Sponsorships page's loader (refreshed page, shape in lib/sponsorships-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/sponsorships-view.ts; live mode builds the same shape from `sponsorships` in lib/sponsorships-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { SPONSORS_VIEW, SPONSORS_VIEW_EMPTY, SPONSORS_VIEW_STRESS } from '@/mock/sponsorships-view';
import { loadLiveSponsorsView, type SponsorsReader } from './sponsorships-live';
import type { MockWrite, SponsorsResult } from './sponsorships-view';

/**
 * Picks the mock view for a `?demo=` flag: `stress`, `empty`, `error` (the demo's "Load error" card), `failed` (the whole-page
 * "didn't load" card), `failsave` and `unsure` (the normal list; the next log fails, see MockWrite). `?demo=loading` is
 * handled by the page (the skeleton). Pure, so the flags are unit-tested.
 */
export function mockSponsors(demo?: string): SponsorsResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? SPONSORS_VIEW_STRESS : demo === 'empty' ? SPONSORS_VIEW_EMPTY : SPONSORS_VIEW;
  const mockWrite: MockWrite = demo === 'failsave' || demo === 'unsure' ? demo : null;
  return { ...view, loadFailed: demo === 'error', mockWrite, failed: false };
}

/**
 * Loads what the Sponsorships page draws. Live mode ignores `demo` (every demo flag is mock only). `read` stands in for the
 * database in tests; the page passes nothing and gets the session reader.
 */
export async function loadSponsorsView({ demo }: { demo?: string } = {}, live = hasSupabaseEnv(), read?: SponsorsReader): Promise<SponsorsResult> {
  if (!live) return mockSponsors(demo);
  const reader = read ?? (await import('./sponsorships-db')).sessionSponsorsReader;
  return loadLiveSponsorsView(reader);
}
