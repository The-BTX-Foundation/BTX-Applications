// Live mode of the Board members page (lib/people-live.ts, lib/people-view-loader.ts) against a fake session client: the
// staff list at the row cap fails the load, a failed core read fails the card, a failed work read only the work cells, the
// interviews' start day is read as written, and live mode ignores every demo/as flag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[] | 'error'>,
  dir: [] as Row[] | 'error',
  who: { id: 'u1', role: 'admin' } as { id: string; role: string } | null,
  env: true,
}));

// A chainable stand-in for the Supabase query builder: filters are ignored, .range() pages the rows, 'error' fails the read.
function query(table: string) {
  let range: [number, number] | null = null;
  const q: Record<string, unknown> = {};
  for (const m of ['eq', 'in', 'gte', 'order', 'limit']) q[m] = () => q;
  q.range = (from: number, to: number) => {
    range = [from, to];
    return q;
  };
  q.then = (ok: (r: { data: Row[] | null; error: unknown }) => unknown) => {
    const t = h.tables[table] ?? [];
    if (t === 'error') return Promise.resolve(ok({ data: null, error: new Error('read failed') }));
    return Promise.resolve(ok({ data: range ? t.slice(range[0], range[1] + 1) : t, error: null }));
  };
  return q;
}
vi.mock('@/lib/supabase-server', () => ({
  sessionClient: async () => ({
    from: (t: string) => ({ select: () => query(t) }),
    rpc: async () => (h.dir === 'error' ? { data: null, error: new Error('rpc failed') } : { data: h.dir, error: null }),
  }),
}));
vi.mock('@/lib/daily-db', () => ({ whoAmI: async () => h.who }));
vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => h.env }));

import { DIRECTORY_CAP, loadLivePeopleView } from '@/lib/people-live';
import { loadPeopleView } from '@/lib/people-view-loader';

const profile = (id: string, name: string): Row => ({ user_id: id, display_name: name, initials: '', title: null, created_at: '2026-01-01T00:00:00Z' });
const dirRow = (id: string, role = 'board'): Row => ({ user_id: id, role, last_sign_in_at: '2026-11-10T15:00:00Z' });

beforeEach(() => {
  h.who = { id: 'u1', role: 'admin' };
  h.env = true;
  h.tables = {
    staff_profiles: [profile('u1', 'Dana Mercer'), profile('u2', 'Keith Dawson')],
    tasks: [],
    interview_slots: [],
    cycles: [{ interview_start: '2026-11-16', created_at: '2026-10-01T00:00:00Z' }],
  };
  h.dir = [dirRow('u1', 'admin'), dirRow('u2')];
});
afterEach(() => vi.useRealTimers());

describe('loadLivePeopleView', () => {
  it('loads the people and their (empty) work', async () => {
    const v = await loadLivePeopleView();
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.workFailed).toBe(false);
    expect(v.people.map((p) => p.name)).toEqual(['Dana Mercer', 'Keith Dawson']);
    expect(v.caps).toMatchObject({ changeRole: true, nudge: true, nudgeUndo: false, message: false });
  });
  it(`the staff list at the ${DIRECTORY_CAP}-row cap fails the load (never a short list)`, async () => {
    h.dir = Array.from({ length: DIRECTORY_CAP }, (_, i) => dirRow(`x${i}`));
    const v = await loadLivePeopleView();
    expect(!v.failed && v.loadFailed).toBe(true);
    expect(!v.failed && v.people).toEqual([]);
  });
  it('a failed core read shows the "didn\'t load" card (loadFailed)', async () => {
    h.tables.staff_profiles = 'error';
    const a = await loadLivePeopleView();
    expect(!a.failed && a.loadFailed).toBe(true);
    h.tables.staff_profiles = [profile('u1', 'Dana Mercer')];
    h.dir = 'error';
    const b = await loadLivePeopleView();
    expect(!b.failed && b.loadFailed).toBe(true);
  });
  it('a failed work read keeps the people and marks the work cells "Couldn\'t count" (workFailed)', async () => {
    h.tables.tasks = 'error';
    const v = await loadLivePeopleView();
    if (v.failed) throw new Error('failed');
    expect(v.loadFailed).toBe(false);
    expect(v.workFailed).toBe(true);
    expect(v.people).toHaveLength(2);
    expect(v.work).toEqual({});
  });
  it('not signed in is the whole-page failure', async () => {
    h.who = null;
    expect(await loadLivePeopleView()).toEqual({ failed: true });
  });
  // The interviews start Monday 2026-11-16 (a `date` column). Read through a time zone it would be Sunday the 15th.
  for (const [label, now, today] of [
    ['the day before (Sun 11:30 PM Eastern)', '2026-11-16T04:30:00Z', '2026-11-15'],
    ['the day of (Mon 12:30 AM Eastern)', '2026-11-16T05:30:00Z', '2026-11-16'],
    ['the day after (Tue 11:30 PM Eastern)', '2026-11-18T04:30:00Z', '2026-11-17'],
  ] as const) {
    it(`interviewsStart is the written day on ${label}`, async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      const v = await loadLivePeopleView();
      if (v.failed) throw new Error('failed');
      expect(v.today).toBe(today);
      expect(v.interviewsStart).toBe('2026-11-16');
    });
  }
});

describe('failed reads are logged with the table and code only', () => {
  const logged = () => (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it('a failed core read, the row cap, a failed work read and a failed cycle read each log once, with no name or role', async () => {
    h.dir = 'error';
    await loadLivePeopleView();
    h.dir = Array.from({ length: DIRECTORY_CAP }, (_, i) => dirRow(`x${i}`));
    await loadLivePeopleView();
    h.dir = [dirRow('u1', 'admin'), dirRow('u2')];
    h.tables.tasks = 'error';
    h.tables.cycles = 'error';
    const v = await loadLivePeopleView();
    expect(!v.failed && v.people.length).toBe(2);
    const calls = logged();
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c[0]).toBe('[people] read failed');
      expect(Object.keys(c[1] as object).sort()).toEqual(['code', 'table']);
    }
    expect(calls.map((c) => (c[1] as { table: string }).table).sort()).toEqual(['cycles', 'staff_directory', 'staff_directory', 'tasks']);
    expect((calls[1][1] as { code: string }).code).toBe('row_cap');
    const text = JSON.stringify(calls);
    for (const word of ['Dana', 'Mercer', 'Keith', 'Dawson', 'admin', 'board', '@']) expect(text).not.toContain(word);
  });
  it('a successful load logs nothing', async () => {
    await loadLivePeopleView();
    expect(logged()).toHaveLength(0);
  });
});

describe('loadPeopleView in live mode', () => {
  it('ignores every demo and as flag', async () => {
    const base = await loadPeopleView();
    for (const demo of ['failed', 'error', 'stress', 'empty', 'uncounted', 'loading', 'failsend', 'failrole']) {
      const v = await loadPeopleView({ demo, as: 'board' } as never);
      expect(v).toEqual(base);
    }
    if (base.failed) throw new Error('failed');
    expect(base.loadFailed || base.workFailed).toBe(false);
  });
});
