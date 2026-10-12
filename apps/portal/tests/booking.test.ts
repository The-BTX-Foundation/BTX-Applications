import { describe, expect, it } from 'vitest';
import { bookSlot } from '../../../packages/data/src/booking';
import type { BtxClient } from '../../../packages/data/src/client';

const client = (r: { data?: string; error?: { message: string; code?: string } }) =>
  ({ rpc: async () => ({ data: r.data ?? null, error: r.error ?? null }) }) as unknown as BtxClient;

describe('book or switch an interview time', () => {
  it.each(['booked', 'switched', 'unchanged'] as const)('passes through %s', async (result) => {
    expect(await bookSlot(client({ data: result }), 's')).toEqual({ ok: true, result });
  });
  it('reports a taken time without changing anything', async () => {
    expect(await bookSlot(client({ data: 'taken' }), 's')).toEqual({ ok: false, kind: 'taken' });
  });
  it('maps the function errors', async () => {
    expect(await bookSlot(client({ error: { message: 'slot_not_found', code: 'P0002' } }), 's')).toEqual({ ok: false, kind: 'slot_gone' });
    expect(await bookSlot(client({ error: { message: 'slot_in_past', code: '22023' } }), 's')).toEqual({ ok: false, kind: 'slot_gone' });
    expect(await bookSlot(client({ error: { message: 'no_submitted_application', code: '42501' } }), 's')).toEqual({ ok: false, kind: 'not_submitted' });
    expect(await bookSlot(client({ error: { message: 'Failed to fetch' } }), 's')).toEqual({ ok: false, kind: 'network' });
    expect(await bookSlot(client({ error: { message: 'weird', code: '1' } }), 's')).toEqual({ ok: false, kind: 'unknown' });
  });
});
