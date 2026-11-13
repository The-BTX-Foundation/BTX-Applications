// The Instagram page's loader (refreshed page, shape in lib/instagram-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/instagram-view.ts; live mode builds the same shape from `posts` in lib/instagram-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { IG_VIEW, IG_VIEW_EMPTY, IG_VIEW_STRESS } from '@/mock/instagram-view';
import { loadLiveIgView } from './instagram-live';
import type { IgMockWrite, IgResult } from './instagram-view';

/**
 * Picks the mock view for a `?demo=` flag: `stress`, `empty`, `error` (the "Instagram didn't load." card), `failed` (the
 * whole-page "didn't load" card), `failadd` and `failsend` (the normal list; the next add or send fails). `?demo=loading`
 * is handled by the page (the skeleton). Pure, so the flags are unit-tested.
 */
export function mockIg(demo?: string): IgResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? IG_VIEW_STRESS : demo === 'empty' ? IG_VIEW_EMPTY : IG_VIEW;
  const mockWrite: IgMockWrite = demo === 'failadd' || demo === 'failsend' ? demo : null;
  return { ...view, loadFailed: demo === 'error', mockWrite, failed: false };
}

/** Loads what the Instagram page draws. Live mode ignores `demo` (every demo flag is mock only). */
export async function loadIgView({ demo, me }: { demo?: string; me?: string | null } = {}, live = hasSupabaseEnv()): Promise<IgResult> {
  if (!live) return mockIg(demo);
  const { sessionIgReader } = await import('./instagram-db');
  return loadLiveIgView(sessionIgReader, me ?? null);
}
