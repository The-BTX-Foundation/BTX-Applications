// The page for one interview: the loader (shape in lib/interview-page-view.ts). Mock mode (no Supabase env) returns the
// sample from mock/interview-page.ts with its `?demo=` states; live mode reads the real tables as the signed-in person
// (lib/interview-page-live.ts) and ignores `demo` entirely.
import { hasSupabaseEnv } from '@btx/data';
import { mockInterviewPage } from '@/mock/interview-page';
import type { InterviewPageResult } from './interview-page-view';

/** Loads the interview at `slotId` for the viewer (`me`, and admin rights from the auth server). */
export async function loadInterviewPage({ slotId, demo, me, isAdmin }: { slotId: string; demo?: string; me: string | null; isAdmin: boolean }, live = hasSupabaseEnv()): Promise<InterviewPageResult> {
  if (!live) return mockInterviewPage(slotId, demo);
  const [{ sessionReader }, { loadLiveInterviewPage }] = await Promise.all([import('./applicants-db'), import('./interview-page-live')]);
  return loadLiveInterviewPage(sessionReader, slotId, me, isAdmin);
}
