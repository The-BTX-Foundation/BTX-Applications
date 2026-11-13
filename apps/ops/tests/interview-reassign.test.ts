// lib/interview-reassign.ts against a fake database: who is free, the reassign outcomes (success, nobody free, a
// conflict, no pair) and the emails it sends. Mock mode (no Supabase env, no client) changes nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/pairing-db';

const st = vi.hoisted(() => ({
  cands: [] as { userId: string; name: string; interviewsSoFar: number; freeMinutesLeft: number }[],
  swap: { ok: true } as { ok: true } | { ok: false; message: string },
  swaps: [] as unknown[][],
  mails: [] as unknown[][],
  candErr: false,
}));

vi.mock('@/lib/pairing-db', async (orig) => {
  const real = await orig<typeof import('@/lib/pairing-db')>();
  return {
    ...real,
    readCandidates: vi.fn(async () => {
      if (st.candErr) throw new Error('rpc');
      return st.cands;
    }),
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

// A read-only fake: each table answers one maybeSingle().
function fakeDb(rows: { slot?: unknown; pair?: unknown; booking?: unknown; staff?: unknown }): Db {
  const data: Record<string, unknown> = {
    interview_slots: rows.slot ?? null,
    interview_pairings: rows.pair ?? null,
    bookings: rows.booking ?? null,
    staff_profiles: rows.staff ?? null,
  };
  return {
    from(table: string) {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: data[table], error: null }) };
      return q;
    },
  } as unknown as Db;
}

const PAIRED = { slot: { cycle_id: 'c1' }, pair: { interviewer_a: 'u1', interviewer_b: 'u2' }, booking: { application_id: 'app1' }, staff: { display_name: 'Ada Lee' } };
const cand = (userId: string, name: string, n = 0, free = 60) => ({ userId, name, interviewsSoFar: n, freeMinutesLeft: free });

beforeEach(() => {
  st.cands = [];
  st.swap = { ok: true };
  st.swaps = [];
  st.mails = [];
  st.candErr = false;
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
  it('an admin’s pick is used when that person is free', async () => {
    st.cands = [cand('u3', 'Bo Kim', 1), cand('u4', 'Cy Day', 2)];
    const { reassignInterviewer } = await import('@/lib/interview-reassign');
    expect(await reassignInterviewer({ ...input, incomingId: 'u4', why: 'covered_by_admin' }, fakeDb(PAIRED))).toMatchObject({ ok: true, incomingId: 'u4' });
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
});
