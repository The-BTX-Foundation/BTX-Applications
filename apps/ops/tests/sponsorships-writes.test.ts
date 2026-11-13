// The Sponsorships page's one live write (lib/sponsorships-writes.ts) against a stand-in client: the rpc's six arguments,
// a definite "no Budget line" refusal, every other failure as "maybe saved", and the matching-rows read.
import { describe, expect, it } from 'vitest';
import type { LogInput } from '@/lib/sponsorships-map';
import { logSponsorshipOnce, matchingRows, refusalOf, type WriteClient } from '@/lib/sponsorships-writes';

const P: LogInput = { title: 'NSBE', kind: 'conference', students: 3, cents: 60_000, when: 'Sat Dec 5', on: '2026-12-05' };

// A stand-in client: `rpc` answers with `res`, `from().select()...` with `rows`; every call is recorded.
function client(res: () => Promise<{ data: unknown; error: unknown }>, rows?: () => Promise<{ data: unknown; error: unknown }>) {
  const calls: { fn?: string; args?: unknown; eq: [string, unknown][]; signal?: AbortSignal; limit?: number }[] = [];
  const c: WriteClient = {
    rpc: (fn, args) => {
      const call = { fn, args, eq: [] as [string, unknown][] } as (typeof calls)[number];
      calls.push(call);
      return { abortSignal: (s) => ((call.signal = s), res()) as never };
    },
    from: () => ({
      select: () => {
        const call = { eq: [] as [string, unknown][] } as (typeof calls)[number];
        calls.push(call);
        const m = {
          eq: (k: string, v: unknown) => (call.eq.push([k, v]), m),
          order: () => m,
          limit: (n: number) => ((call.limit = n), { abortSignal: (s: AbortSignal) => ((call.signal = s), (rows ?? res)()) as never }),
        };
        return m as never;
      },
    }),
  };
  return { c, calls };
}

describe('logSponsorshipOnce', () => {
  it('sends one rpc with the six arguments and a time limit', async () => {
    const { c, calls } = client(async () => ({ data: 'new-id', error: null }));
    expect(await logSponsorshipOnce(P, c)).toEqual({ ok: true, id: 'new-id' });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('log_sponsorship');
    expect(calls[0].args).toEqual({ p_title: 'NSBE', p_kind: 'conference', p_students: 3, p_amount_cents: 60_000, p_when_label: 'Sat Dec 5', p_spent_on: '2026-12-05' });
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('no_sponsorship_category is a definite refusal', async () => {
    const { c } = client(async () => ({ data: null, error: { message: 'no_sponsorship_category' } }));
    expect(await logSponsorshipOnce(P, c)).toEqual({ ok: false, reason: 'no_category' });
  });
  it('any other error, an odd answer or a throw may have saved', async () => {
    for (const r of [
      async () => ({ data: null, error: { message: 'timeout' } }),
      async () => ({ data: 42, error: null }),
      async () => {
        throw new Error('AbortError');
      },
    ]) {
      expect(await logSponsorshipOnce(P, client(r).c)).toEqual({ ok: false, reason: 'maybe' });
    }
  });
});

describe('refusalOf', () => {
  it('maps definite database answers, and everything else to maybe', () => {
    expect(refusalOf({ code: 'P0001', message: 'no_sponsorship_category' })).toBe('no_category');
    expect(refusalOf({ code: '42501', message: 'new row violates row-level security policy' })).toBe('denied');
    expect(refusalOf({ message: 'permission denied for function log_sponsorship' })).toBe('denied');
    expect(refusalOf({ code: '23514', message: 'check constraint' })).toBe('invalid');
    expect(refusalOf({ code: '22003', message: 'out of range' })).toBe('invalid');
    expect(refusalOf({ code: '', message: 'AbortError: signal timed out' })).toBe('maybe');
    expect(refusalOf({ message: 'FetchError' })).toBe('maybe');
    expect(refusalOf(null)).toBe('maybe');
  });
  it('the rpc reports an RLS refusal as denied', async () => {
    expect(await logSponsorshipOnce(P, client(async () => ({ data: null, error: { code: '42501', message: 'rls' } })).c)).toEqual({ ok: false, reason: 'denied' });
  });
});

describe('matchingRows', () => {
  it('filters by title, amount and date, and returns the stored rows', async () => {
    const { c, calls } = client(async () => ({
      data: [
        { id: 'a', title: 'NSBE', kind: 'travel', students: 4, amount_cents: 60_000, when_label: 'Dec 5', occurred_on: '2026-12-05', status: 'done' },
        { id: 2, title: 'NSBE', amount_cents: 60_000, occurred_on: '2026-12-05' },
      ],
      error: null,
    }));
    const rows = await matchingRows(P, c);
    expect(rows?.map((r) => r.id).sort()).toEqual(['2', 'a']);
    expect(rows?.find((r) => r.id === 'a')).toMatchObject({ title: 'NSBE', kind: 'travel', students: 4, cents: 60_000, on: '2026-12-05' });
    expect(calls[0].eq).toEqual([['title', 'NSBE'], ['amount_cents', 60_000], ['occurred_on', '2026-12-05']]);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
  });
  it('a failed read, a throw or a full page is null (unknown)', async () => {
    expect(await matchingRows(P, client(async () => ({ data: null, error: { message: 'x' } })).c)).toBeNull();
    expect(await matchingRows(P, client(async () => { throw new Error('x'); }).c)).toBeNull();
    const full = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    expect(await matchingRows(P, client(async () => ({ data: full, error: null })).c)).toBeNull();
  });
});
