// The Interview questions write queue (lib/questions-queue.ts): one write at a time; a failure cancels what was queued
// behind it (each cancelled write runs its own cancel, so an edit keeps its words and a removal says "Not done"); a
// handler that throws counts as a failure and the writes after it still run; the page reads again after every outcome.
import { describe, expect, it, vi } from 'vitest';
import { keepNotSaved, notSavedSnapshot } from '@/lib/questions-store';
import { ERR_SKIPPED, type WriteOutcome } from '@/lib/questions-flow';
import { writeQueue, type QueueOp } from '@/lib/questions-queue';

const hooks = () => ({ failed: vi.fn(), settled: vi.fn(), idle: vi.fn() });
const op = (o: WriteOutcome | (() => Promise<WriteOutcome>), extra: Partial<QueueOp> = {}): QueueOp => ({
  write: typeof o === 'function' ? o : async () => o,
  ok: vi.fn(),
  fail: vi.fn(),
  cancel: vi.fn(),
  ...extra,
});

describe('write queue', () => {
  it('runs writes one after another and reads again after each', async () => {
    const h = hooks();
    const q = writeQueue(h);
    const order: string[] = [];
    const a = op(async () => (order.push('a'), { ok: true }));
    const b = op(async () => (order.push('b'), { ok: true }));
    q.push(a);
    await q.push(b);
    expect(order).toEqual(['a', 'b']);
    expect(a.ok).toHaveBeenCalled();
    expect(h.settled).toHaveBeenCalledTimes(2);
    expect(h.idle).toHaveBeenCalledTimes(1);
  });
  it('a failure cancels what was queued behind it: a queued edit keeps its words, nothing is sent', async () => {
    const h = hooks();
    const q = writeQueue(h);
    const sent = vi.fn(async (): Promise<WriteOutcome> => ({ ok: true }));
    const bad = op({ ok: false, kind: 'failed', message: '' });
    // The board's edit cancel: the words go to "Not saved".
    const edit = op(sent, { cancel: () => keepNotSaved('uq1', { key: 'e:q2', kind: 'edit', cycleId: 'c1', gk: 'a', qid: 'q2', words: 'My words', fromText: 'Two', message: ERR_SKIPPED, conflict: false }) });
    const move = op(sent);
    q.push(bad);
    q.push(edit);
    await q.push(move);
    expect(bad.fail).toHaveBeenCalled();
    expect(h.failed).toHaveBeenCalledTimes(1);
    expect(sent).not.toHaveBeenCalled();
    expect(move.cancel).toHaveBeenCalled();
    expect(notSavedSnapshot('uq1')).toMatchObject([{ words: 'My words', message: ERR_SKIPPED }]);
    // A write pushed after the failure settled runs as usual.
    const later = op({ ok: true });
    await q.push(later);
    expect(later.ok).toHaveBeenCalled();
  });
  it('a handler that throws counts as a failure and the chain stays alive', async () => {
    const h = hooks();
    const q = writeQueue(h);
    const boom = op({ ok: true }, { ok: () => { throw new Error('boom'); } });
    const queued = op({ ok: true });
    q.push(boom);
    await q.push(queued);
    expect(boom.fail).toHaveBeenCalledWith({ ok: false, kind: 'failed', message: '' });
    expect(h.failed).toHaveBeenCalledTimes(1);
    expect(queued.cancel).toHaveBeenCalled();
    const failThrows = op({ ok: false, kind: 'failed', message: '' }, { fail: () => { throw new Error('boom'); } });
    await q.push(failThrows);
    const after = op({ ok: true });
    await q.push(after);
    expect(after.ok).toHaveBeenCalled();
    const writeThrows = op(async () => { throw new Error('net'); });
    await q.push(writeThrows);
    expect(writeThrows.fail).toHaveBeenCalled();
    expect(q.pending()).toBe(0);
  });
});
