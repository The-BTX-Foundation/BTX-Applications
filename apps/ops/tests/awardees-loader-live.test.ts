// The Awardees loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can fake a load error,
// a failed save, a long name or a switched-on email live.
import { describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/awardees-map';
import type { AwReadOpts, AwReader } from '@/lib/awardees-live';

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/awardees-db', () => {
  const tables: Record<string, Row[]> = {
    cycles: [{ id: 'c1', status: 'published', term: 'Fall 2026', award_name: 'BTX Legacy Scholarship', award_amount_cents: 250000, decision_date: '2026-11-30', decisions_released_at: '2026-11-30T17:00:00Z' }],
    calendar_events: [],
    scholarship_awards: [{ id: 'a1', cycle_id: 'c1', kind: 'main', application_id: 'p1', award_name: 'BTX Legacy Scholarship', amount_cents: 250000, award_steps: [] }],
    applications: [{ id: 'p1', cycle_id: 'c1', status: 'submitted', applicant_code: 'APP-1', full_name: 'Live Person', terpmail: 'l@x.org' }],
  };
  const pick = (table: string, o: AwReadOpts = {}) => {
    let rows = tables[table] ?? [];
    for (const [c, v] of Object.entries(o.eq ?? {})) rows = rows.filter((r) => r[c] === v);
    for (const [c, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[c]));
    return o.limit ? rows.slice(0, o.limit) : rows;
  };
  const awSessionReader: AwReader = { rows: async (t, _s, o) => pick(t, o), all: async (t, _s, o) => pick(t, o) };
  return { awSessionReader };
});

describe('loadAwardeesView in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'after', 'failsave', 'pasterror', 'longname', 'loading', undefined])(
    'ignores ?demo=%s: real data, no load error, no failed save, never email or Undo',
    async (demo) => {
      const { loadAwardeesView } = await import('@/lib/awardees-view-loader');
      const r = await loadAwardeesView({ demo, role: 'admin' });
      expect(r.failed).toBe(false);
      if (r.failed) return;
      expect(r.loadFailed).toBe(false);
      expect(r.pastFailed).toBe(false);
      expect(r.failFirst ?? false).toBe(false);
      expect(r.awards.map((a) => a.name)).toEqual(['Live Person']);
      expect(r.caps).toEqual({ tick: true, undo: false, funds: true, remindEmail: false, recordReminder: true });
    },
  );
});
