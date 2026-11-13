// The Grants loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every ?demo=
// value is ignored and the page reads the real tables (here a stand-in reader), so no demo flag can switch a write on or
// fake a load error live. Also: a caught failure logs one server line with the table and error code only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/grants-map';
import type { GrantsReader } from '@/lib/grants-live';

const db = vi.hoisted(() => ({ fail: null as null | { table: string; code: string } }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));

vi.mock('@/lib/grants-db', () => {
  const tables: Record<string, Row[]> = {
    grants: [{ id: 'g1', name: 'STEM education grant', stage: 'writing', amount_cents: 1_000_000, deadline_on: '2026-12-01', created_at: '2026-10-01' }],
    staff_profiles: [{ user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' }],
    checklists: [],
  };
  const sessionReader: GrantsReader = {
    me: async () => 'u-me',
    all: async (table) => {
      if (db.fail?.table === table) throw { code: db.fail.code, message: 'Dana Mercer row 42 was refused' };
      return tables[table] ?? [];
    },
  };
  return { sessionReader };
});

afterEach(() => {
  db.fail = null;
  vi.restoreAllMocks();
});

describe('loadGrantsView in live mode', () => {
  it.each(['failed', 'error', 'steperror', 'stress', 'empty', undefined])('ignores ?demo=%s: real data, no load error, every cap off', async (demo) => {
    const { loadGrantsView } = await import('@/lib/grants-view-loader');
    const r = await loadGrantsView({ demo });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.grants.map((g) => g.name)).toEqual(['STEM education grant']);
    expect(r.checklist).toEqual({ title: 'Getting started with grants', steps: [] });
    expect(Object.values(r.caps).every((c) => c === false)).toBe(true);
  });

  it('logs a failed core read with the table and code only, and shows the load error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'staff_profiles', code: '42501' };
    const { loadGrantsView } = await import('@/lib/grants-view-loader');
    const r = await loadGrantsView({ demo: 'stress' });
    expect(r.failed === false && r.loadFailed).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[grants] core read failed', { table: 'staff_profiles', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Dana');
  });

  it('logs a failed checklist read and marks only the checklist', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'checklists', code: 'PGRST301' };
    const { loadGrantsView } = await import('@/lib/grants-view-loader');
    const r = await loadGrantsView();
    expect(r.failed === false && !r.loadFailed && r.checklist === null).toBe(true);
    expect(log).toHaveBeenCalledWith('[grants] checklist read failed', { table: 'checklists', code: 'PGRST301' });
  });
});
