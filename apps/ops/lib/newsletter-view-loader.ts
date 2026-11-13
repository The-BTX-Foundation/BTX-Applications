// The Newsletter page's loader (shape in lib/newsletter-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/newsletter-view.ts; live mode reads the real tables (lib/newsletter-live.ts) and ignores every `demo` flag.
import { hasSupabaseEnv } from '@btx/data';
import { NL_VIEW, NL_VIEW_EMPTY, NL_VIEW_STRESS } from '@/mock/newsletter-view';
import { loadLiveNewsletter, type NlUser } from './newsletter-live';
import type { NlResult } from './newsletter-view';

/**
 * Picks the mock view for a `?demo=` flag: `stress`, `empty`, `error` (the demo's "Newsletter didn't load." card), `failed`
 * (the whole-page "didn't load" card) and `failsave` (the first save of each section fails). `?demo=loading` is handled by
 * the page (the skeleton). Pure, so the flags are unit-tested.
 */
export function nlMockView(demo?: string): NlResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? NL_VIEW_STRESS : demo === 'empty' ? NL_VIEW_EMPTY : NL_VIEW;
  return { ...view, loadFailed: demo === 'error', failFirst: demo === 'failsave', failed: false };
}

/** The page's data: the mock sample, or the live tables as `user`. `live` is passed in for tests. */
export async function loadNewsletterView({ demo, user }: { demo?: string; user: NlUser }, live = hasSupabaseEnv()): Promise<NlResult> {
  if (!live) return nlMockView(demo);
  const { nlSessionReader } = await import('./newsletter-db');
  return loadLiveNewsletter(nlSessionReader, user);
}
