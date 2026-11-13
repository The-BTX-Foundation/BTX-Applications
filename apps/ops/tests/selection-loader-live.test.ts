// The Selection loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (a stand-in reader here), so no flag can fake a state, a load
// error, a failed save or switch the release on for a board member.
import { describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/selection-map';
import type { SlReadOpts, SlReader } from '@/lib/selection-live';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/selection-db', () => {
  const tables: Record<string, Row[]> = {
    cycles: [{ id: 'c1', status: 'published', term: 'Fall 2026', award_name: 'BTX Legacy Scholarship', award_amount_cents: 250000, decision_date: '2026-11-30', decisions_released_at: null }],
    applications: [{ id: 'p1', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-1', full_name: 'Live Person', terpmail: 'l@x.org' }],
  };
  const pick = (table: string, o: SlReadOpts = {}) => {
    let rows = tables[table] ?? [];
    for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const slSessionReader: SlReader = { rows: async (t, _s, o) => pick(t, o), all: async (t, _s, o) => pick(t, o) };
  return { slSessionReader };
});

describe('loadSelectionView in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'meeting', 'board', 'failsave', 'loading', undefined])('ignores ?demo=%s', async (demo) => {
    const { loadSelectionView } = await import('@/lib/selection-view-loader');
    const r = await loadSelectionView({ demo, role: 'board' });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.failFirst).toBe(false);
    expect(r.unscored.map((u) => u.name)).toEqual(['Live Person']);
    expect(r.rows).toEqual([]);
    expect(r.cycle?.total).toBe(1);
    expect(r.cycle?.scoresDue).toBeNull();
    expect(r.caps).toEqual({ record: true, undo: true, release: false });
  });

  it('gives the release control to an admin only', async () => {
    const { loadSelectionView } = await import('@/lib/selection-view-loader');
    const admin = await loadSelectionView({ demo: 'board', role: 'admin' });
    if (admin.failed) throw new Error('unexpected');
    expect(admin.caps.release).toBe(true);
  });
});
