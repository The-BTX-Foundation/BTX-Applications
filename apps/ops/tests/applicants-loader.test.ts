// The Applicants loaders in live mode (docs/DESIGN-DNA.md, "Mock-only demo flags"): with Supabase env present, every
// ?demo= value is ignored and the pages read the real tables (here a stand-in reader), so no demo flag can fake a load
// error or switch the nudges on live. A caught failure logs one server line with the table and error code only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/applicants-map';
import type { ApReader } from '@/lib/applicants-live';

const db = vi.hoisted(() => ({ fail: null as null | { table: string; code: string } }));

vi.mock('@btx/data', async (orig) => ({ ...(await orig<typeof import('@btx/data')>()), hasSupabaseEnv: () => true }));

vi.mock('@/lib/applicants-db', () => {
  const tables: Record<string, Row[]> = {
    cycles: [{ id: 'c1', term: 'Fall 2026', created_at: '2026-09-01' }],
    applications: [{ id: 'a1', cycle_id: 'c1', applicant_code: 'APP-2026-00001', full_name: 'Jordan Smith', terpmail: 'js@terpmail.umd.edu', submitted_at: '2026-10-20T15:00:00Z' }],
    staff_profiles: [{ user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' }],
  };
  const fail = (t: string) => {
    if (db.fail?.table === t) throw { code: db.fail.code, message: 'Jordan Smith js@terpmail.umd.edu was refused' };
  };
  const sessionReader: ApReader = {
    all: async (table, _s, o) => {
      fail(table);
      return (tables[table] ?? []).filter((r) => Object.entries(o.eq ?? {}).every(([k, v]) => r[k] === undefined || r[k] === v));
    },
    rpc: async (fn) => {
      fail(fn);
      return [];
    },
  };
  return { sessionReader };
});

afterEach(() => {
  db.fail = null;
  vi.restoreAllMocks();
});

const VIEWER = { id: 'u-me', admin: false };

describe('Applicants loaders in live mode', () => {
  it.each(['failed', 'error', 'stress', 'empty', 'loading', undefined])('the list ignores ?demo=%s: real rows, no load error, nudges off', async (demo) => {
    const { loadApplicantsView } = await import('@/lib/applicants-view-loader');
    const r = await loadApplicantsView({ demo, viewer: VIEWER });
    expect(r.failed).toBe(false);
    if (r.failed) return;
    expect(r.loadFailed).toBe(false);
    expect(r.applicants.map((a) => a.code)).toEqual(['APP-2026-00001']);
    expect(r.caps).toEqual({ nudge: false, export: false });
  });

  it.each(['failed', undefined])('the full application ignores ?demo=%s; mock codes are not found live', async (demo) => {
    const { loadApplicantView } = await import('@/lib/applicants-view-loader');
    const r = await loadApplicantView({ code: 'APP-2026-00001', demo, viewer: VIEWER });
    expect(r).toMatchObject({ failed: false, missing: false });
    expect(await loadApplicantView({ code: 'APP-2026-00011', demo, viewer: VIEWER })).toEqual({ failed: false, missing: true });
  });

  it('a failed read is the load error and logs the table and code only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.fail = { table: 'scores', code: '42501' };
    const { loadApplicantsView, loadApplicantView } = await import('@/lib/applicants-view-loader');
    expect(await loadApplicantsView({ viewer: VIEWER })).toEqual({ failed: true });
    expect(spy).toHaveBeenCalledWith('[applicants] read failed', { table: 'scores', code: '42501' });
    db.fail = { table: 'application_files', code: 'PGRST301' };
    expect(await loadApplicantView({ code: 'APP-2026-00001', viewer: VIEWER })).toEqual({ failed: true, missing: false });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/Jordan|terpmail|APP-2026/);
  });
});
