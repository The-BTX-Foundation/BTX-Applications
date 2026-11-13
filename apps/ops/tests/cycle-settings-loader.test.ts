// The Cycle settings loader in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present every
// ?demo= value is ignored and the page reads the real tables through the session client (here a stand-in), so no demo
// flag can fake a load error or switch a write on live. A failed read logs its table and code only; a failed bookings
// count only blanks that number.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CS_VIEW } from '@/mock/cycle-settings-view';

const db = vi.hoisted(() => ({ role: 'admin' as string | null, fail: null as null | { table: string; code: string }, apps: 21, booked: 5 }));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.role ? { app_metadata: { role: db.role } } : null } }) },
    from: (table: string) => {
      const res = () => {
        if (db.fail?.table === table) return { data: null, error: { code: db.fail.code, message: 'Dana Mercer row 42 was refused' } };
        if (table === 'applications') return { data: null, error: null, count: db.apps };
        if (table === 'bookings') return { data: null, error: null, count: db.booked };
        return { data: [{ ...CS_VIEW.cycle, id: '33333333-3333-4333-8333-333333333333' }], error: null };
      };
      const q = { eq: () => q, neq: () => q, order: () => q, limit: () => q, then: (ok: (r: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, no) };
      return { select: () => q };
    },
  }),
}));

afterEach(() => {
  db.role = 'admin';
  db.fail = null;
  vi.restoreAllMocks();
});

describe('loadCycleSettingsView in live mode', () => {
  it.each(['failed', 'error', 'loading', 'stress', 'draft', 'viewonly', 'empty', undefined])('ignores ?demo=%s: the real cycle, no load error', async (demo) => {
    const { loadCycleSettingsView } = await import('@/lib/cycle-settings-view-loader');
    const r = await loadCycleSettingsView({ demo });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.cycle?.term).toBe('Fall 2026');
    expect(r.applications).toBe(21);
    expect(r.booked).toBe(5);
    expect(r.caps).toEqual({ edit: true, publish: false, unpublish: false });
  });

  it('gives a board member no caps, whatever ?demo= says', async () => {
    db.role = 'board';
    const { loadCycleSettingsView } = await import('@/lib/cycle-settings-view-loader');
    const r = await loadCycleSettingsView({ demo: 'normal' });
    expect(r.failed === false && r.caps).toEqual({ edit: false, publish: false, unpublish: false });
  });

  it('logs a failed core read with the table and code only, and shows the load error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'applications', code: '42501' };
    const { loadCycleSettingsView } = await import('@/lib/cycle-settings-view-loader');
    const r = await loadCycleSettingsView({ demo: 'stress' });
    expect(r.failed === false && r.loadFailed).toBe(true);
    expect(r.failed === false && r.caps.edit).toBe(false);
    expect(log).toHaveBeenCalledWith('[cycle-settings] read failed', { table: 'applications', code: '42501' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Dana');
  });

  it('a failed bookings count only blanks that number', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'bookings', code: 'PGRST301' };
    const { loadCycleSettingsView } = await import('@/lib/cycle-settings-view-loader');
    const r = await loadCycleSettingsView();
    expect(r.failed === false && r.loadFailed).toBe(false);
    expect(r.failed === false && r.booked).toBeNull();
    expect(log).toHaveBeenCalledWith('[cycle-settings] read failed', { table: 'bookings', code: 'PGRST301' });
  });

  it('ignores a ?cycle= that is not a UUID', async () => {
    const { loadCycleSettingsView } = await import('@/lib/cycle-settings-view-loader');
    const r = await loadCycleSettingsView({ cycle: "1' or 1=1" });
    expect(r.failed === false && r.cycle?.term).toBe('Fall 2026');
  });
});
