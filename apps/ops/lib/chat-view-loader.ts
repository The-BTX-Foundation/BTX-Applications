// The Board chat page's loader (shape in lib/chat-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/chat-view.ts; live mode builds the same shape from the real tables in lib/chat-live.ts.
import { hasSupabaseEnv } from '@btx/data';
import { CHAT_VIEW, CHAT_VIEW_EMPTY, CHAT_VIEW_STRESS } from '@/mock/chat-view';
import { loadLiveChatView } from './chat-live';
import type { ChatResult } from './chat-view';

/**
 * The mock-only demo flags that change behaviour rather than data; always off in live mode. `?demo=failsend`: every
 * send fails after about 600 ms (the "Not sent" row; its Retry then saves). `?demo=capped`: the sample thread acts as
 * read only up to its cap (Scholarships), so "Older messages aren't shown here." and the search note show.
 */
export function chatDemo(demo: string | undefined, live: boolean): { failSend: boolean; capped: boolean } {
  return { failSend: !live && demo === 'failsend', capped: !live && demo === 'capped' };
}

/**
 * Loads what the Board chat page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` the longest names and
 * 99+ unread, `?demo=empty` no messages yet, `?demo=error` the window's "Board chat didn't load." (the title still shows),
 * `?demo=failed` the whole-page "didn't load" card, `?demo=capped` Scholarships read only up to its cap.
 * (`?demo=loading` is handled by the page: it draws the skeleton; `?demo=failsend` by the board.)
 */
export async function loadChatView({ demo }: { demo?: string } = {}): Promise<ChatResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? CHAT_VIEW_STRESS : demo === 'empty' ? CHAT_VIEW_EMPTY : CHAT_VIEW;
    return { ...view, threadFailed: demo === 'error', capped: chatDemo(demo, false).capped ? ['ch-sch'] : [] };
  }
  return loadLiveChatView();
}
