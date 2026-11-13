// The Mentorship page's loader (shape in lib/mentorship-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/mentorship-view.ts; live mode reads the real tables (lib/mentorship-live.ts) and ignores every `demo` flag.
import { hasSupabaseEnv } from '@btx/data';
import { MS_VIEW, MS_VIEW_EMPTY, MS_VIEW_STRESS } from '@/mock/mentorship-view';
import { msSessionReader } from './mentorship-db';
import { loadLiveMentorship, type MsUser } from './mentorship-live';
import type { MentorshipResult } from './mentorship-view';

/**
 * Loads what the Mentorship page draws. Mock mode only: `?demo=stress` the longest names and an unowned step, `?demo=empty`
 * no steps, `?demo=error` the page's designed load error, `?demo=chaterror` only the chat panel's load error,
 * `?demo=failsave` / `?demo=failsend` the first try of a tick / a chat send fails, `?demo=failed` the whole-page
 * "didn't load" card. (`?demo=loading` is handled by the page: the skeleton.)
 */
export function msMockView(demo?: string): MentorshipResult {
  if (demo === 'failed') return { failed: true };
  const view = demo === 'stress' ? MS_VIEW_STRESS : demo === 'empty' ? MS_VIEW_EMPTY : MS_VIEW;
  return {
    ...view,
    loadFailed: demo === 'error',
    chat: demo === 'chaterror' ? { failed: true, title: view.chat.title } : view.chat,
    failFirst: { save: demo === 'failsave', send: demo === 'failsend' },
  };
}

/** The page's data: the mock sample, or the live tables as `user`. */
export async function loadMentorshipView({ demo, user }: { demo?: string; user: MsUser }): Promise<MentorshipResult> {
  if (!hasSupabaseEnv()) return msMockView(demo);
  return loadLiveMentorship(msSessionReader, user);
}
