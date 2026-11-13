// The Outreach Plan loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every
// ?demo= value is ignored and the page reads the real tables (here a stand-in reader), so no flag can switch a control on
// or fake a load error live.
import { describe, expect, it, vi } from 'vitest';
import type { PnReader } from '@/lib/oplan-live';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/oplan-db', () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    staff_profiles: [{ user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' }],
    outreach_channels: [{ id: 'c1', kind: 'instagram', name: 'Instagram', target: '4 posts a month', position: 1 }],
    posts: [{ id: 'p1', title: 'Teaser', post_on: null, status: 'drafting' }],
  };
  const oplanSessionReader: PnReader = { all: async (t, _s, o) => (tables[t] ?? []).filter((r) => (o.isNull ?? []).every((c) => r[c] == null) || !o.isNull) };
  return { oplanSessionReader };
});

describe('loadOplanView in live mode', () => {
  it.each(['stress', 'empty', 'error', 'failed', 'loading', 'failsave', undefined])('ignores ?demo=%s: real data, no load error, live caps', async (demo) => {
    const { loadOplanView } = await import('@/lib/oplan-view-loader');
    const r = await loadOplanView({ demo, me: 'u-me' });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.people.map((p) => p.name)).toEqual(['Dana Mercer']);
    expect(r.items.map((x) => x.id)).toContain('p1');
    expect(r.caps).toMatchObject({ addPost: true, nudge: false, pickOwner: false, undo: false, nKey: false, addIssue: false });
  });
});
