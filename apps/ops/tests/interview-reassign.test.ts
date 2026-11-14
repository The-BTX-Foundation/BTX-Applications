// lib/interview-reassign.ts against a fake database: who is free, the Change sheet's options, the reassign outcomes
// (success, nobody free, a conflict, no pair, a pick not marked free gets the time added to their free hours) and the
// emails it sends. Mock mode (no Supabase env, no client) changes nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/pairing-db';

const st = vi.hoisted(() => ({
  cands: [] as { userId: string; name: string; interviewsSoFar: number; freeMinutesLeft: number }[],
  swap: { ok: true } as { ok: true } | { ok: false; message: string },
  swaps: [] as unknown[][],
  mails: [] as unknown[][],
  candErr: false,
  ranges: [] as { userId: string; day: string; startMin: number; endMin: number }[],
  limits: new Map<string, number>(),
}));

vi.mock('@/lib/pairing-db', async (orig) => {
  const real = await orig<typeof import('@/lib/pairing-db')>();
  return {
    ...real,
    readCandidates: vi.fn(async () => {
      if (st.candErr) throw new Error('rpc');
      return st.cands;
    }),
    readRanges: vi.fn(async () => st.ranges),
    readLimits: vi.fn(async () => st.limits),
    swapInterviewer: vi.fn(async (...a: unknown[]) => {
      st.swaps.push(a.slice(1));
      return st.swap;
    }),
  };
});
vi.mock('@/lib/email/interviews', () => ({
  sendRebalanceEmails: vi.fn(async (...a: unknown[]) => {
    st.mails.push(a);
    return { ok: true, sent: 2, skipped: 0, failed: 0 };
  }),
}));

// A fake: each table answers one maybeSingle() (`rows`) or a list (`lists`); writes are recorded in `writes`; the rpc
// conflicted_board_members answers `conflicted`.
type Write = { table: string; op: string; values?: unknown; where: Record<string, unknown> };
function fakeDb(rows: { slot?: unknown; pair?: unknown; booking?: unknown; staff?: unknown; cycle?: unknown }, lists: Record<string, unknown[] | (() => unknown[])> = {}, conflicted: unknown[] = [], writes: Write[] = [], failWrites = false): Db {
  const data: Record<string, unknown> = {
    cycles: rows.cycle === undefined ? { id: 'c1' } : rows.cycle,
    interview_slots: rows.slot ?? null,
    interview_pairings: rows.pair ?? null,
    bookings: rows.booking ?? null,
    staff_profiles: rows.staff ?? null,
  };
  return {
    from(table: string) {
      let w: Write | null = null;
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq: (k: string, v: unknown) => {
          if (w) w.where[k] = v;
          return q;
        },
        insert: (values: unknown) => {
          w = { table, op: 'insert', values, where: {} };
          writes.push(w);
          return q;
        },
        update: (values: unknown) => {
          w = { table, op: 'update', values, where: {} };
          writes.push(w);
          return q;
        },
        delete: () => {
          w = { table, op: 'delete', where: {} };
          writes.push(w);
          return q;
        },
        maybeSingle: async () => ({ data: data[table], error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (w) return res({ data: null, error: failWrites && w.op !== 'insert' && w.op !== 'update' ? { code: 'XX' } : null });
          const l = lists[table];
          return res({ data: typeof l === 'function' ? l() : (l ?? []), error: null });
        },
      };
      return q;
    },
    rpc: async () => ({ data: conflicted, error: null }),
  } as unknown as Db;
}

const NOW = new Date('2026-11-14T15:00:00Z');
// 5:00 to 5:30 PM Eastern on Nov 20 (EST, UTC-5).
const SLOT_ROW = { cycle_id: 'c1', starts_at: '2026-11-20T22:00:00.000Z', ends_at: '2026-11-20T22:30:00.000Z' };
const PAIRED = { slot: SLOT_ROW, pair: { interviewer_a: 'u1', interviewer_b: 'u2' }, booking: { application_id: 'app1' }, staff: { display_name: 'Ada Lee' } };
const cand = (userId: string, name: string, n = 0, free = 60) => ({ userId, name, interviewsSoFar: n, freeMinutesLeft: free });
const person = (userId: string, name: string, role = 'board') => ({ userId, name, initials: '', role });
const STAFF = [person('u1', 'Ada Lee'), person('u2', 'Pair Mate'), person('u3', 'Bo Kim'), person('u4', 'Cy Day', 'admin'), person('u5', 'Eve Ray'), person('u6', 'Fay Lo'), person('u7', 'Gus Orr')];
const EVENING = (userId: string) => ({ userId, day: '2026-11-20', startMin: 1020, endMin: 1260 });
beforeEach(() => {
  st.cands = [];
  st.swap = { ok: true };
  st.swaps = [];
  st.mails = [];
  st.candErr = false;
  st.ranges = [];
  st.limits = new Map();
});
afterEach(() => vi.restoreAllMocks());

describe('listFreeReplacements', () => {
  it('leaves out the pair and lists the least loaded first, with initials', async () => {
    st.cands = [cand('u1', 'Ada Lee'), cand('u4', 'Cy Day', 2), cand('u3', 'Bo Kim', 1)];
    const { listFreeReplacements } = await import('@/lib/interview-reassign');
    expect(await listFreeReplacements('s1', fakeDb(PAIRED))).toEqual([
      { id: 'u3', name: 'Bo Kim', initials: 'BK' },
      { id: 'u4', name: 'Cy Day', initials: 'CD' },
    ]);
  });
  it('is empty when the interview is gone', async () => {
    const { listFreeReplacements } = await import('@/lib/interview-reassign');
    expect(await listFreeReplacements('s1', fakeDb({}))).toEqual([]);
  });
});

describe('listReplacementOptions', () => {
  it('free people first, then the rest by name with a note; the pair, people who know the student and busy people are left out', async () => {
    st.cands = [cand('u4', 'Cy Day', 2), cand('u3', 'Bo Kim', 1)];
    st.ranges = [EVENING('u3'), EVENING('u4'), EVENING('u6')];
    st.limits = new Map([['u6', 1]]);
    const lists = {
      interview_pairings: [
        { slot_id: 's1', interviewer_a: 'u1', interviewer_b: 'u2', interview_slots: SLOT_ROW },
        { slot_id: 's2', interviewer_a: 'u6', interviewer_b: 'u3', interview_slots: { starts_at: '2026-11-19T22:00:00.000Z', ends_at: '2026-11-19T22:30:00.000Z' } },
        { slot_id: 's3', interviewer_a: 'u7', interviewer_b: 'u4', interview_slots: { starts_at: '2026-11-20T22:15:00.000Z', ends_at: '2026-11-20T22:45:00.000Z' } },
      ],
    };
    const { listReplacementOptions } = await import('@/lib/interview-reassign');
    // u7 is on an overlapping interview, u5 knows the student (an rpc row object).
    const out = await listReplacementOptions('s1', STAFF, fakeDb(PAIRED, lists, [{ conflicted_board_members: 'u5' }]));
    expect(out).toEqual([
      { id: 'u3', name: 'Bo Kim', initials: 'BK', free: true, note: null },
      { id: 'u6', name: 'Fay Lo', initials: 'FL', free: false, note: 'At their limit of 1' },
    ]);
  });
  it('is empty when the interview is gone', async () => {
    const { listReplacementOptions } = await import('@/lib/interview-reassign');
    expect(await listReplacementOptions('s1', STAFF, fakeDb({}))).toEqual([]);
  });
});

describe('reassignInterviewer', () => {
  const input = { slotId: 's1', outgoingId: 'u1', why: 'availability_removed' as const };

  it('success: moves the seat to the least loaded free member and emails both', async () => {
    st.cands = [cand('u4', 'Cy Day', 2), cand('u3', 'Bo Kim', 1)];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer(input, fakeDb(PAIRED))).toEqual({ ok: true, incomingId: 'u3', incomingName: 'Bo Kim' });
    expect(st.swaps).toEqual([['s1', 'u1', 'u3', { trusted: true }]]);
    expect(st.mails[0][0]).toBe('c1');
    expect(st.mails[0][1]).toEqual([{ slotId: 's1', from: 'u1', to: 'u3', fromName: 'Ada Lee', changeId: expect.any(String) }]);
  });
  it('each reassign carries its own change id, so a later change on the same interview emails again', async () => {
    st.cands = [cand('u3', 'Bo Kim', 1)];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    await reassignInterviewer(input, fakeDb(PAIRED));
    await reassignInterviewer(input, fakeDb(PAIRED));
    const ids = st.mails.map((m) => (m[1] as { changeId: string }[])[0].changeId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('a pick on the page is used when that person is free', async () => {
    st.cands = [cand('u3', 'Bo Kim', 1), cand('u4', 'Cy Day', 2)];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u4', why: 'changed_on_page', now: NOW }, fakeDb(PAIRED))).toMatchObject({ ok: true, incomingId: 'u4' });
  });
  it('no_one_free: nothing changes and no email goes out', async () => {
    st.cands = [cand('u2', 'Pair Mate')];
    const { reassignInterviewer, NO_ONE_FREE } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer(input, fakeDb(PAIRED))).toEqual({ ok: false, reason: 'no_one_free', message: NO_ONE_FREE });
    expect([st.swaps, st.mails]).toEqual([[], []]);
  });
  it('conflict: a pick who is not free (busy, knows the student, at their limit) is refused', async () => {
    st.cands = [cand('u3', 'Bo Kim')];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u9' }, fakeDb(PAIRED))).toMatchObject({ ok: false, reason: 'taken' });
    expect(st.swaps).toEqual([]);
  });
  it('conflict: the seat changed under us (the write found no row)', async () => {
    st.cands = [cand('u3', 'Bo Kim')];
    const { SWAP_TAKEN } = await import('@/lib/pairing-db');
    st.swap = { ok: false, message: SWAP_TAKEN };
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer(input, fakeDb(PAIRED))).toEqual({ ok: false, reason: 'taken', message: SWAP_TAKEN });
    expect(st.mails).toEqual([]);
  });
  it('the outgoing member is no longer on it', async () => {
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, outgoingId: 'u7' }, fakeDb(PAIRED))).toMatchObject({ ok: false, reason: 'taken' });
  });
  it('not_paired when the interview has no pair', async () => {
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer(input, fakeDb({ ...PAIRED, pair: null }))).toMatchObject({ ok: false, reason: 'not_paired' });
  });
  it('a failed candidate read is an error, nothing changed', async () => {
    st.candErr = true;
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer(input, fakeDb(PAIRED))).toMatchObject({ ok: false, reason: 'error' });
    expect(st.swaps).toEqual([]);
  });

  it('a page pick not marked free: the time is added to their free hours first, then the seat moves (checked)', async () => {
    st.cands = [cand('u3', 'Bo Kim')];
    const writes: Write[] = [];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    const r = await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, {}, [], writes));
    expect(r).toEqual({ ok: true, incomingId: 'u5', incomingName: 'Eve Ray' });
    expect(writes).toEqual([{ table: 'board_free_ranges', op: 'insert', values: { cycle_id: 'c1', user_id: 'u5', day: '2026-11-20', start_min: 1020, end_min: 1050 }, where: {} }]);
    expect(st.swaps).toEqual([['s1', 'u1', 'u5', { trusted: true, checked: true }]]);
    expect(st.mails).toHaveLength(1);
  });
  it('a row with the same start is widened, never duplicated', async () => {
    // An hour-long interview, 5:00 to 6:00 PM, and a row that covers only its first half.
    st.ranges = [{ userId: 'u5', day: '2026-11-20', startMin: 1020, endMin: 1050 }];
    const hour = { ...PAIRED, slot: { ...SLOT_ROW, ends_at: '2026-11-20T23:00:00.000Z' } };
    const writes: Write[] = [];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect((await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(hour, {}, [], writes))).ok).toBe(true);
    expect(writes).toEqual([{ table: 'board_free_ranges', op: 'update', values: { end_min: 1080 }, where: { cycle_id: 'c1', user_id: 'u5', day: '2026-11-20', start_min: 1020 } }]);
  });
  it('a page pick at their limit but free then: no range is added, the limit stays', async () => {
    st.ranges = [EVENING('u6')];
    st.limits = new Map([['u6', 0]]);
    const writes: Write[] = [];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u6', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, {}, [], writes))).toMatchObject({ ok: true, incomingId: 'u6' });
    expect(writes).toEqual([]);
  });
  it('if the seat move fails after a range was added, the range is taken back', async () => {
    const { SWAP_TAKEN } = await import('@/lib/pairing-db');
    st.swap = { ok: false, message: SWAP_TAKEN };
    const writes: Write[] = [];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, {}, [], writes))).toMatchObject({ ok: false, reason: 'taken' });
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete']);
    expect(st.mails).toEqual([]);
  });
  it('page picks who know the student, are busy then, are not staff or are already on it are refused, vaguely; nothing is written', async () => {
    const lists = { interview_pairings: [{ slot_id: 's3', interviewer_a: 'u7', interviewer_b: 'u9', interview_slots: SLOT_ROW }] };
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    for (const id of ['u5', 'u7', 'u8', 'u2']) {
      const writes: Write[] = [];
      const r = await reassignInterviewer({ ...input, incomingId: id, why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, lists, ['u5'], writes));
      expect(r).toEqual({ ok: false, reason: 'taken', message: "That person can't take this interview." });
      expect(writes).toEqual([]);
    }
    expect(st.swaps).toEqual([]);
  });
  it('the auto cover (no pick) still takes free candidates only and keeps the swap\'s own check', async () => {
    st.cands = [];
    const writes: Write[] = [];
    const { reassignInterviewer, NO_ONE_FREE } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, staff: STAFF }, fakeDb(PAIRED, {}, [], writes))).toEqual({ ok: false, reason: 'no_one_free', message: NO_ONE_FREE });
    expect(writes).toEqual([]);
    st.cands = [cand('u3', 'Bo Kim')];
    await reassignInterviewer(input, fakeDb(PAIRED));
    expect(st.swaps).toEqual([['s1', 'u1', 'u3', { trusted: true }]]);
  });

  it('the page refuses an interview that has started, and one outside the current cycle; nothing is written', async () => {
    const { reassignInterviewer, STARTED, NOT_CURRENT } = await import('@/lib/interview-reassign');
    const writes: Write[] = [];
    const page = { ...input, incomingId: 'u5', why: 'changed_on_page' as const, staff: STAFF };
    expect(await reassignInterviewer({ ...page, now: new Date('2026-11-20T22:05:00Z') }, fakeDb(PAIRED, {}, [], writes))).toEqual({ ok: false, reason: 'taken', message: STARTED });
    expect(await reassignInterviewer({ ...page, now: NOW }, fakeDb({ ...PAIRED, cycle: { id: 'c2' } }, {}, [], writes))).toEqual({ ok: false, reason: 'taken', message: NOT_CURRENT });
    expect(await reassignInterviewer({ ...page, now: NOW }, fakeDb({ ...PAIRED, cycle: null }, {}, [], writes))).toMatchObject({ message: NOT_CURRENT });
    expect([writes, st.swaps]).toEqual([[], []]);
  });
  it('the auto cover is not held to the page\'s start and cycle checks', async () => {
    st.cands = [cand('u3', 'Bo Kim')];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect((await reassignInterviewer({ ...input, now: new Date('2026-11-21T00:00:00Z') }, fakeDb({ ...PAIRED, cycle: { id: 'c2' } }))).ok).toBe(true);
  });
  it('race: the pick got another interview at that time after the list was read; the added range is taken back', async () => {
    let reads = 0;
    const lists = { interview_pairings: () => (++reads === 1 ? [] : [{ slot_id: 's9', interviewer_a: 'u5', interviewer_b: 'u3', interview_slots: SLOT_ROW }]) };
    const writes: Write[] = [];
    const { reassignInterviewer, BUSY_NOW } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, lists, [], writes))).toEqual({ ok: false, reason: 'taken', message: BUSY_NOW });
    expect(writes.map((w) => w.op)).toEqual(['insert', 'delete']);
    expect([st.swaps, st.mails]).toEqual([[], []]);
  });
  it('audit: a page change logs the actor and ids (no names) and whether a range was added', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF, actorId: 'u9' }, fakeDb(PAIRED));
    expect(info).toHaveBeenCalledWith('[reassign] changed on page', { actorId: 'u9', slotId: 's1', outgoingId: 'u1', incomingId: 'u5', rangeAdded: true });
    info.mockClear();
    st.cands = [cand('u3', 'Bo Kim')];
    await reassignInterviewer(input, fakeDb(PAIRED));
    expect(info).not.toHaveBeenCalled();
  });
  it('a failed undo is logged with ids, never swallowed silently', async () => {
    const { SWAP_TAKEN } = await import('@/lib/pairing-db');
    st.swap = { ok: false, message: SWAP_TAKEN };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(PAIRED, {}, [], [], true));
    expect(err).toHaveBeenCalledWith('[reassign] added free range not removed', { cycleId: 'c1', userId: 'u5', day: '2026-11-20', startMin: 1020, code: 'XX' });
  });
  it('two rows that only cover the time together still get a new range (one row must cover it)', async () => {
    // 4:30 to 5:30 PM; rows 4 to 5 and 5 to 6.
    const slot = { ...PAIRED, slot: { cycle_id: 'c1', starts_at: '2026-11-20T21:30:00.000Z', ends_at: '2026-11-20T22:30:00.000Z' } };
    st.ranges = [{ userId: 'u5', day: '2026-11-20', startMin: 960, endMin: 1020 }, { userId: 'u5', day: '2026-11-20', startMin: 1020, endMin: 1080 }];
    const writes: Write[] = [];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect((await reassignInterviewer({ ...input, incomingId: 'u5', why: 'changed_on_page', now: NOW, staff: STAFF }, fakeDb(slot, {}, [], writes))).ok).toBe(true);
    expect(writes).toEqual([{ table: 'board_free_ranges', op: 'insert', values: { cycle_id: 'c1', user_id: 'u5', day: '2026-11-20', start_min: 990, end_min: 1050 }, where: {} }]);
  });
});
