// The admin-only server actions (lib/cycle-settings-actions.ts) against a stand-in Supabase client: the role comes from
// the auth server, every value is checked, only the changed columns are written in one UPDATE that must bring back one row,
// and the status-only Publish / Unpublish keep the cycle rules. The stand-in honours the updated_at filter like the
// database would (the cycles_touch trigger moves it on every write). Nothing here can email anyone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleRow } from '@/lib/cycle-settings';
import { CS_VIEW, CS_VIEW_DRAFT } from '@/mock/cycle-settings-view';

type Res = { data?: unknown; error?: { code?: string } | null; count?: number | null };
const h = vi.hoisted(() => ({
  user: null as null | { app_metadata?: { role?: string } },
  cycle: null as null | Record<string, unknown>,
  other: null as null | string,
  apps: 0 as number | null,
  appsErr: null as null | { code: string },
  readStamp: null as null | string,
  write: null as null | Res,
  readErr: null as null | { code: string },
  updates: [] as { payload: unknown; filters: [string, string, unknown][] }[],
}));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => true }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    from: (table: string) => {
      const q = { table, payload: undefined as unknown, filters: [] as [string, string, unknown][] };
      const result = (): Res => {
        if (q.payload !== undefined) {
          h.updates.push({ payload: q.payload, filters: q.filters });
          if (h.write) return h.write;
          const stamp = q.filters.find((f) => f[1] === 'updated_at');
          if (stamp && stamp[2] !== h.cycle?.updated_at) return { data: [], error: null };
          return { data: [{ ...h.cycle, ...(q.payload as object) }], error: null };
        }
        if (table === 'applications') return { count: h.appsErr ? null : h.apps, error: h.appsErr };
        return { data: h.other ? [{ term: h.other }] : [], error: null };
      };
      const b = {
        select: () => b,
        update: (p: unknown) => ((q.payload = p), b),
        eq: (c: string, v: unknown) => (q.filters.push(['eq', c, v]), b),
        neq: (c: string, v: unknown) => (q.filters.push(['neq', c, v]), b),
        limit: () => b,
        maybeSingle: async () => ({ data: h.cycle && { ...h.cycle, updated_at: h.readStamp ?? h.cycle.updated_at }, error: h.readErr }),
        then: (ok: (r: Res) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, no),
      };
      return b;
    },
  }),
}));

import { publishCycleNow, saveCycleFields, unpublishCycleNow } from '@/lib/cycle-settings-actions';

const ID = '33333333-3333-4333-8333-333333333333';
const STAMP = '2026-11-10T13:00:00.000000+00:00';
const PUB = { ...CS_VIEW.cycle!, id: ID, updated_at: STAMP } as CycleRow & { updated_at: string };
const DRAFT = { ...CS_VIEW_DRAFT.cycle!, id: ID, updated_at: STAMP } as CycleRow & { updated_at: string };
const CHANGED = 'This cycle changed while you were editing. Reload and try again.';
// Applications for PUB opened Mon Oct 12, 9:00 AM Eastern (13:00Z).
const OPENS = Date.parse(PUB.opens_at!);

beforeEach(() => {
  h.user = { app_metadata: { role: 'admin' } };
  h.cycle = { ...PUB };
  h.other = null;
  h.apps = 0;
  h.appsErr = null;
  h.readStamp = null;
  h.write = null;
  h.readErr = null;
  h.updates = [];
  vi.restoreAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('saveCycleFields', () => {
  it('saves one setting: only its column, one UPDATE pinned to the id and status, the saved row back', async () => {
    const r = await saveCycleFields(ID, { awardName: 'Legacy Award' }, { awardName: 'Legacy Scholarship' });
    expect(r).toMatchObject({ ok: true, row: { award_name: 'Legacy Award' } });
    expect(h.updates).toEqual([{ payload: { award_name: 'Legacy Award' }, filters: [['eq', 'id', ID], ['eq', 'status', 'published'], ['eq', 'updated_at', STAMP]] }]);
  });
  it('refuses a board member (role from the auth server) and writes nothing', async () => {
    h.user = { app_metadata: { role: 'board' } };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: 'Only board members with admin rights can change cycle settings.' });
    expect(h.updates).toEqual([]);
  });
  it('refuses a signed-out caller', async () => {
    h.user = null;
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: 'Sign in again to change cycle settings.' });
    expect(h.updates).toEqual([]);
  });
  it.each([
    ['a bad id', 'not-a-uuid', { awardName: 'X' }, { awardName: 'Legacy Scholarship' }],
    ['a field not on the screen', ID, { status: 'archived' }, { status: 'published' }],
    ['a wrong type', ID, { eventEnabled: 'on' }, { eventEnabled: false }],
  ])('refuses %s', async (_n, id, patch, before) => {
    expect(await saveCycleFields(id, patch, before)).toEqual({ ok: false, message: 'That change is not allowed.' });
    expect(h.updates).toEqual([]);
  });
  it('refuses out-of-order dates and a bad amount', async () => {
    expect(await saveCycleFields(ID, { closesDate: '2026-10-01', closesTime: '09:00' }, { closesDate: '2026-11-06', closesTime: '23:59' })).toMatchObject({ ok: false, message: 'The deadline has to be after applications open.' });
    expect(await saveCycleFields(ID, { decisionDate: '2026-11-15' }, { decisionDate: '2026-11-30' })).toMatchObject({ ok: false, message: 'The decision comes on or after the last interview.' });
    expect((await saveCycleFields(ID, { amount: 'lots' }, { amount: '2,500.00' })).ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
  it('refuses an archived cycle and a stale page', async () => {
    h.cycle = { ...PUB, status: 'archived' };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: 'An archived cycle can not be changed.' });
    h.cycle = { ...PUB };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Old name' })).toMatchObject({ ok: false, stale: true });
    expect(h.updates).toEqual([]);
  });
  it('says so when the write fails, logging the code only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.write = { data: null, error: { code: 'XX000' } };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: "That didn't save. Try again." });
    expect(log).toHaveBeenCalledWith('[cycle-settings] write failed', { table: 'cycles', code: 'XX000' });
  });
  it('turns a broken check constraint into a plain sentence', async () => {
    h.write = { data: null, error: { code: '23514' } };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: 'That change breaks a cycle rule. Reload to see the latest.' });
  });
  it('treats zero rows back (after the admin check) as the cycle changing in between', async () => {
    h.write = { data: [], error: null };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: CHANGED });
  });
  it('refuses when another write moved updated_at between the read and the UPDATE', async () => {
    h.readStamp = '2026-11-10T12:00:00.000000+00:00';
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: CHANGED });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].filters).toContainEqual(['eq', 'updated_at', h.readStamp]);
  });
  it('a repeated save (the first answer came too late) is a success and writes nothing again', async () => {
    expect((await saveCycleFields(ID, { awardName: 'Legacy Award' }, { awardName: 'Legacy Scholarship' })).ok).toBe(true);
    h.cycle = { ...PUB, award_name: 'Legacy Award', updated_at: '2026-11-10T13:05:00.000000+00:00' };
    // the page still believes the old name (its answer never came) and sends the same change again
    expect(await saveCycleFields(ID, { awardName: 'Legacy Award' }, { awardName: 'Legacy Scholarship' })).toMatchObject({ ok: true, row: { award_name: 'Legacy Award' } });
    expect(h.updates).toHaveLength(1);
  });
  it('reports a failed read without writing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.readErr = { code: '42501' };
    expect(await saveCycleFields(ID, { awardName: 'X' }, { awardName: 'Legacy Scholarship' })).toEqual({ ok: false, message: "That didn't save. Try again." });
    expect(h.updates).toEqual([]);
  });
});

describe('publishCycleNow / unpublishCycleNow', () => {
  it('refuses a draft that misses required settings', async () => {
    h.cycle = { ...DRAFT };
    const r = await publishCycleNow(ID);
    expect(r.ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
  it('refuses while another cycle is published', async () => {
    h.cycle = { ...PUB, status: 'draft' };
    h.other = 'Fall 2025';
    expect((await publishCycleNow(ID)).ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
  it('refuses a draft whose dates are out of order, with the plain reason', async () => {
    h.cycle = { ...PUB, status: 'draft', decision_date: '2026-11-12' };
    expect(await publishCycleNow(ID)).toMatchObject({ ok: false, message: 'Fix this first: The decision comes on or after the last interview.' });
    expect(h.updates).toEqual([]);
  });
  it('publishes a complete draft (status only) and maps 23505 to one-published', async () => {
    h.cycle = { ...PUB, status: 'draft' };
    expect(await publishCycleNow(ID)).toMatchObject({ ok: true, row: { status: 'published' } });
    expect(h.updates[0]).toEqual({ payload: { status: 'published' }, filters: [['eq', 'id', ID], ['eq', 'status', 'draft']] });
    h.write = { data: null, error: { code: '23505' } };
    expect(await publishCycleNow(ID)).toEqual({ ok: false, message: 'Another cycle is already published, and only one can be published at a time.' });
  });
  it('refuses a board member', async () => {
    h.user = { app_metadata: { role: 'board' } };
    expect((await publishCycleNow(ID)).ok).toBe(false);
    expect((await unpublishCycleNow(ID)).ok).toBe(false);
    expect(h.updates).toEqual([]);
  });
  it('unpublishes only before applications open and while none is submitted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(OPENS - 60_000);
    h.apps = 21;
    expect(await unpublishCycleNow(ID)).toEqual({ ok: false, message: 'Students have submitted applications, so this cycle stays published. To stop early, move the deadline.' });
    expect(h.updates).toEqual([]);
    h.apps = 0;
    expect(await unpublishCycleNow(ID)).toMatchObject({ ok: true, row: { status: 'draft' } });
    expect(h.updates[0].payload).toEqual({ status: 'draft' });
  });
  it('refuses Unpublish from the open instant on, even with no submitted application', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    h.apps = 0;
    vi.setSystemTime(OPENS);
    expect(await unpublishCycleNow(ID)).toEqual({ ok: false, message: 'Applications are already open, so this cycle stays published. To stop early, move the deadline.' });
    vi.setSystemTime(OPENS - 1);
    expect((await unpublishCycleNow(ID)).ok).toBe(true);
    expect(h.updates).toHaveLength(1);
  });
  it('refuses Unpublish when the submitted count fails, logging the table and code', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(OPENS - 60_000);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.appsErr = { code: '42501' };
    expect(await unpublishCycleNow(ID)).toEqual({ ok: false, message: "That didn't save. Try again." });
    expect(log).toHaveBeenCalledWith('[cycle-settings] write failed', { table: 'cycles', code: '42501' });
    expect(h.updates).toEqual([]);
  });
});
