// The Interview questions page's writer (lib/questions-writes.ts) with stand-in actions and reads: the existing actions are
// called as the old page called them; the edit guard refuses another person's newer words; a retried add never sends a
// twin; a timeout is never a resend; a drag stops at the first failed move; removing a question already gone is done.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}), hasSupabaseEnv: () => true }));
vi.mock('@/lib/actions/interview-questions', () => ({ saveInterviewQuestion: vi.fn(), removeInterviewQuestion: vi.fn(), moveInterviewQuestion: vi.fn(), addStarterQuestions: vi.fn() }));

import { ERR_SAVE, ERR_UNDO_CHANGED } from '@/lib/questions-flow';
import { CLOSE_KEY } from '@/lib/questions-map';
import { WRITE_MS, keyOf, liveWriter, mockWriter, peekGroups, type QnActions, type QnPeek } from '@/lib/questions-writes';

const ok = { ok: true, message: 'Saved.' };
const actions = (o: Partial<QnActions> = {}): QnActions => ({
  save: vi.fn(async () => ({ ...ok, id: 'new-id' })),
  remove: vi.fn(async () => ok),
  move: vi.fn(async () => ok),
  starter: vi.fn(async () => ok),
  ...o,
});
const peek = (o: Partial<QnPeek> = {}): QnPeek => ({ one: vi.fn(async () => ({ text: 'Two' })), list: vi.fn(async () => []), ...o });

describe('liveWriter', () => {
  it('edits through saveInterviewQuestion with the id and the database key', async () => {
    const a = actions();
    expect(await liveWriter(a, peek()).edit('cyc', CLOSE_KEY, 'q2', 'Deux', 'Two')).toEqual({ ok: true, id: 'new-id' });
    expect(a.save).toHaveBeenCalledWith('cyc', { id: 'q2', criterionKey: null, text: 'Deux' });
  });
  it('refuses an edit when someone changed the question since, and writes nothing', async () => {
    const a = actions();
    expect(await liveWriter(a, peek({ one: async () => ({ text: 'Newer words' }) })).edit('cyc', 'a', 'q2', 'Deux', 'Two')).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await liveWriter(a, peek({ one: async () => null })).edit('cyc', 'a', 'q2', 'Deux', 'Two')).toMatchObject({ ok: false, kind: 'gone' });
    expect(await liveWriter(a, peek({ one: async () => 'failed' })).edit('cyc', 'a', 'q2', 'Deux', 'Two')).toMatchObject({ ok: false, kind: 'failed', message: ERR_SAVE });
    expect(a.save).not.toHaveBeenCalled();
  });
  it('adds without an id and passes on the action plain message when it says no', async () => {
    const a = actions({ save: vi.fn(async () => ({ ok: false, message: 'Keep the question under 500 characters.' })) });
    expect(await liveWriter(a, peek()).add('cyc', 'community', 'x')).toEqual({ ok: false, kind: 'failed', message: 'Keep the question under 500 characters.' });
    expect(a.save).toHaveBeenCalledWith('cyc', { criterionKey: 'community', text: 'x' });
  });
  it('a retried add that the server already lists sends nothing', async () => {
    const a = actions();
    const n = { key: 'a:1', kind: 'add' as const, cycleId: 'cyc', gk: 'community', words: 'New one', knownIds: ['q1'], message: ERR_SAVE };
    const w = liveWriter(a, peek({ list: async () => [{ id: 'q1', criterionKey: 'community', text: 'Old' }, { id: 'q9', criterionKey: 'community', text: 'New one' }] }));
    expect(await w.retryAdd('cyc', n)).toEqual({ ok: true, already: true });
    expect(a.save).not.toHaveBeenCalled();
    expect(await liveWriter(a, peek({ list: async () => [] })).retryAdd('cyc', n)).toEqual({ ok: true, id: 'new-id' });
    expect(a.save).toHaveBeenCalledTimes(1);
    expect(await liveWriter(a, peek({ list: async () => 'failed' })).retryAdd('cyc', n)).toMatchObject({ ok: false, kind: 'failed' });
    expect(a.save).toHaveBeenCalledTimes(1);
  });
  it('a write with no answer in time is a timeout, sent once', async () => {
    vi.useFakeTimers();
    const a = actions({ save: vi.fn(() => new Promise<never>(() => {})) });
    const p = liveWriter(a, peek()).add('cyc', 'a', 'x');
    await vi.advanceTimersByTimeAsync(WRITE_MS + 1);
    expect(await p).toEqual({ ok: false, kind: 'timeout', message: '' });
    expect(a.save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('a thrown action is a failed write, not a crash', async () => {
    const a = actions({ remove: vi.fn(async () => { throw new Error('network'); }) });
    expect(await liveWriter(a, peek()).remove('q1')).toEqual({ ok: false, kind: 'failed', message: ERR_SAVE });
  });
  it('removing a question that is already gone is done', async () => {
    const a = actions({ remove: vi.fn(async () => ({ ok: false, message: 'That question is already gone.' })) });
    expect(await liveWriter(a, peek()).remove('q1')).toEqual({ ok: true });
  });
  it('a drag runs its one-place moves in order and stops at the first failure', async () => {
    let n = 0;
    const a = actions({ move: vi.fn(async () => (++n === 2 ? { ok: false, message: "Couldn't save." } : ok)) });
    expect(await liveWriter(a, peek()).move('q1', ['down', 'down', 'down'])).toMatchObject({ ok: false, done: 1 });
    expect(a.move).toHaveBeenCalledTimes(2);
    expect(await liveWriter(actions(), peek()).move('q1', ['up', 'up'])).toEqual({ ok: true, done: 2 });
  });
  it('the starter questions go through addStarterQuestions with the cycle', async () => {
    const a = actions();
    await liveWriter(a, peek()).starter('cyc');
    expect(a.starter).toHaveBeenCalledWith('cyc');
  });
});

describe('mockWriter', () => {
  it('saves nothing and answers with the asked-for failure', async () => {
    expect(await mockWriter(null).add('c', 'a', 'x')).toEqual({ ok: true, id: 'mock-new-1' });
    expect(await mockWriter('failsave').edit('c', 'a', 'q', 'x', 'y')).toMatchObject({ ok: false, kind: 'failed' });
    expect(await mockWriter('conflict').edit('c', 'a', 'q', 'x', 'y')).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await mockWriter('timeout').move('q', ['up'])).toMatchObject({ ok: false, kind: 'timeout', done: 0 });
  });
});

describe('helpers', () => {
  it('maps group keys and peeks', () => {
    expect(keyOf(CLOSE_KEY)).toBeNull();
    expect(keyOf('community')).toBe('community');
    expect(peekGroups([{ id: '1', criterionKey: null, text: 'x' }])).toEqual([{ key: null, name: CLOSE_KEY, weight: null, questions: [{ id: '1', text: 'x' }] }]);
  });
});

describe('liveWriter: review fixes', () => {
  it('a retried edit whose question already holds the words counts as saved, and sends nothing', async () => {
    const a = actions();
    expect(await liveWriter(a, peek({ one: async () => ({ text: 'Deux' }) })).edit('cyc', 'a', 'q2', 'Deux', 'Two')).toEqual({ ok: true });
    expect(a.save).not.toHaveBeenCalled();
  });
  it('Undo of an add removes the question only while it still has the added words', async () => {
    const a = actions();
    expect(await liveWriter(a, peek({ one: async () => ({ text: 'New one ' }) })).undoAdd('q9', 'New one')).toEqual({ ok: true });
    expect(a.remove).toHaveBeenCalledWith('q9');
    const b = actions();
    expect(await liveWriter(b, peek({ one: async () => ({ text: 'Changed by someone' }) })).undoAdd('q9', 'New one')).toEqual({ ok: false, kind: 'failed', message: ERR_UNDO_CHANGED });
    expect(b.remove).not.toHaveBeenCalled();
    const c = actions();
    expect(await liveWriter(c, peek({ one: async () => null })).undoAdd('q9', 'New one')).toEqual({ ok: true });
    expect(await liveWriter(c, peek({ one: async () => 'failed' })).undoAdd('q9', 'New one')).toMatchObject({ ok: false, kind: 'failed', message: ERR_SAVE });
    expect(c.remove).not.toHaveBeenCalled();
  });
  it('the starter questions report the true number added, counted from reads before and after', async () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, criterionKey: null, text: `Q${i}` }));
    const list = vi.fn().mockResolvedValueOnce(rows(2)).mockResolvedValueOnce(rows(12));
    expect(await liveWriter(actions(), peek({ list })).starter('cyc')).toEqual({ ok: true, added: 10 });
    const failedRead = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce(rows(12));
    expect(await liveWriter(actions(), peek({ list: failedRead })).starter('cyc')).toEqual({ ok: true });
  });
});
