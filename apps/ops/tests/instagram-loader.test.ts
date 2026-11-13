// The Instagram loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can switch a write on,
// fake a failed write, or fake a load error live.
import { describe, expect, it, vi } from 'vitest';
import type { IgReader } from '@/lib/instagram-live';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/instagram-db', () => {
  const sessionIgReader: IgReader = {
    channel: async () => ({ id: 'ch1', target: '4 posts a month' }),
    staff: async () => [{ user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' }],
    posts: async (_c, f) => ('from' in f ? [{ id: 'p1', title: 'Interview week', post_on: '2099-01-05', owner_id: 'u-me', status: 'drafting' }] : []),
  };
  return { sessionIgReader };
});

describe('loadIgView in live mode', () => {
  it.each(['failed', 'error', 'failadd', 'failsend', 'stress', 'empty', 'loading', undefined])('ignores ?demo=%s: real rows, no load error, only the backed writes', async (demo) => {
    const { loadIgView } = await import('@/lib/instagram-view-loader');
    const r = await loadIgView({ demo, me: 'u-me' });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r).toMatchObject({ loadFailed: false, mockWrite: null, channelId: 'ch1', me: 'u-me', target: 4 });
    expect(r.posts.map((p) => p.title)).toEqual(['Interview week']);
    expect(r.posts[0].date).toBe('2099-01-05');
    expect(r.caps).toEqual({ add: true, send: true, tick: false, caption: false, owner: false, nudge: false, undo: false, next: false });
  });
});
