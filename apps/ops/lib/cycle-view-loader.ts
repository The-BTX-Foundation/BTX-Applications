// The Cycle page's loader (shape in lib/cycle-view.ts). Mock mode (no Supabase env) returns the demo's sample from
// mock/cycle-view.ts; live mode reads the real tables (lib/cycle-live.ts) and ignores every `demo` flag.
import { hasSupabaseEnv } from '@btx/data';
import { CY_VIEW, CY_VIEW_EMPTY, CY_VIEW_STRESS } from '@/mock/cycle-view';
import { cySessionReader } from './cycle-db';
import { loadLiveCycle, type CyUser } from './cycle-live';
import type { CycleView } from './cycle-view';

/**
 * The mock page. `?demo=stress` the longest titles and late steps of other people, `?demo=empty` no published cycle,
 * `?demo=error` (or `failed`) the designed "The cycle didn't load." line, `?demo=listerror` only the checklist's load error,
 * `?demo=chaterror` only the chat's load error, `?demo=uncounted` the counts that could not be read, `?demo=failsend` the
 * first try of each chat send fails, `?demo=longnames` the stress sample with very long owner and author names (with "+2").
 * (`?demo=loading` is handled by the page: the skeleton.)
 */
export function cyMockView(demo?: string): CycleView {
  const view = demo === 'longnames' ? longNames() : demo === 'stress' ? CY_VIEW_STRESS : demo === 'empty' ? CY_VIEW_EMPTY : CY_VIEW;
  const cycle = view.cycle && demo === 'uncounted' ? { ...view.cycle, applied: null, booked: null, scored: null } : view.cycle;
  const listFailed = demo === 'listerror';
  return {
    ...view,
    cycle,
    loadFailed: demo === 'error' || demo === 'failed',
    rows: listFailed ? [] : view.rows,
    listFailed,
    chat: demo === 'chaterror' ? { failed: true, title: view.chat.title } : view.chat,
    failFirst: { send: demo === 'failsend' },
  };
}

// The stress sample with a 120-character owner name ("… +2") on every other person's step and in one chat message.
function longNames(): CycleView {
  const long = 'Maximiliana Alexandrina Wolfeschlegelsteinhausen-Bergerdorff Featherstonehaugh-Cholmondeley Montgomery-Throckmorton';
  const rows = CY_VIEW_STRESS.rows.map((r) => (r.owner?.kind === 'person' ? { ...r, owner: { ...r.owner, label: `${long} +2` } } : r));
  const chat = CY_VIEW_STRESS.chat.failed ? CY_VIEW_STRESS.chat : { ...CY_VIEW_STRESS.chat, messages: CY_VIEW_STRESS.chat.messages.map((m, i) => (i === 0 && !m.bot ? { ...m, who: long } : m)) };
  return { ...CY_VIEW_STRESS, rows, chat };
}

/** The page's data: the mock sample, or the live tables as `user` (live never reads `demo`). */
export async function loadCycleView({ demo, user }: { demo?: string; user: CyUser }): Promise<CycleView> {
  if (!hasSupabaseEnv()) return cyMockView(demo);
  return loadLiveCycle(cySessionReader, user);
}
