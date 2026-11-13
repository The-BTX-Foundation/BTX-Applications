// The Scoring page's loader (refreshed page, shape in lib/scoring-view.ts). Mock mode (no Supabase env) returns the
// demo's sample from mock/scoring-view.ts, with the `?demo=` states; live mode reads the real tables as the signed-in
// person in lib/scoring-live.ts and ignores `demo` entirely. Read-only in both modes.
import { hasSupabaseEnv } from '@btx/data';
import { mockScoringEmpty, mockScoringStress, mockScoringView } from '@/mock/scoring-view';
import { sessionReader } from './applicants-db';
import { loadLiveScoring } from './scoring-live';
import { LIVE_CAPS } from './scoring-map';
import type { ScoringResult } from './scoring-view';

/**
 * The mock view for a `?demo=` value (mock mode only): `stress` long names and a long queue, `empty` everything published,
 * `error` the demo's "Your scores didn't load" card, `failed` the whole-page "didn't load" card, `failsave` every draft
 * save refused, `slowpublish` a publish that gets no answer in time, `confirm` the live controls (ask before publishing, no
 * Undo, no Nudge) with a slow publish. (`?demo=loading` is handled by the page.)
 */
export function mockScoring(demo?: string): ScoringResult {
  if (demo === 'failed') return { failed: true, page: true };
  if (demo === 'error') return { failed: true };
  const view = demo === 'stress' ? mockScoringStress() : demo === 'empty' ? mockScoringEmpty() : mockScoringView();
  const sim = demo === 'failsave' || demo === 'slowpublish' || demo === 'confirm' ? { failSave: demo === 'failsave', slowPublish: demo !== 'failsave' } : null;
  return { ...view, sim, caps: demo === 'confirm' ? LIVE_CAPS : view.caps, failed: false };
}

/** Loads what the page draws for the signed-in person `me`. */
export async function loadScoringView({ demo, me }: { demo?: string; me: string }): Promise<ScoringResult> {
  if (!hasSupabaseEnv()) return mockScoring(demo);
  return loadLiveScoring(sessionReader, me);
}
