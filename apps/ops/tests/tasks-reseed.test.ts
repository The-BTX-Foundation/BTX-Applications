import { describe, expect, it } from 'vitest';
import { reseed, settleAdd, settleComment, shouldReseed, type Seeded } from '@/lib/tasks-reseed';

type T = { id: string; title: string };
type B = T & Seeded;
const make = (t: T): B => ({ ...t, phase: 'open', nonce: 0, fx: null, decided: null, decidedStep: -1 });
const row = (id: string, phase: string, nonce = 3): B => ({ id, title: `old ${id}`, phase, nonce, fx: 'enter', decided: null, decidedStep: -1 });

describe('reseed', () => {
  it('keeps on-screen state, takes new words, adds new rows and drops rows the server dropped', () => {
    const out = reseed([row('a', 'undo'), row('b', 'open'), row('gone-done', 'gone')], [{ id: 'a', title: 'A' }, { id: 'c', title: 'C' }], make);
    expect(out.map((t) => [t.id, t.phase, t.title])).toEqual([
      ['a', 'undo', 'A'],
      ['c', 'open', 'C'],
    ]);
    expect(out[0].nonce).toBe(3);
  });
  it('keeps a row still folding away, and a live add waiting for its insert', () => {
    const out = reseed([row('x', 'undoClosing'), row('new-1', 'open')], [], make);
    expect(out.map((t) => t.id)).toEqual(['x', 'new-1']);
  });
  it('a row the board hid ("gone") comes back open when the server lists it as open (a failed Undo is never hidden for the visit)', () => {
    const out = reseed([row('u', 'gone', 5)], [{ id: 'u', title: 'Still open' }], make);
    expect(out).toEqual([{ id: 'u', title: 'Still open', phase: 'open', nonce: 0, fx: null, decided: null, decidedStep: -1 }]);
  });
});

describe('shouldReseed (runs after every settled refresh, never mid-write)', () => {
  const base = { sigChanged: false, refreshed: false, goneListed: false, busy: 0, stale: false, refreshing: false };
  it('runs on a new list, on a settled refresh with the same list, and when the server lists a hidden row', () => {
    expect(shouldReseed(base)).toBe(false);
    expect(shouldReseed({ ...base, sigChanged: true })).toBe(true);
    expect(shouldReseed({ ...base, refreshed: true })).toBe(true);
    expect(shouldReseed({ ...base, goneListed: true })).toBe(true);
  });
  it('waits while a write runs, while the data predates a write, or while a refresh is on its way', () => {
    expect(shouldReseed({ ...base, refreshed: true, busy: 1 })).toBe(false);
    expect(shouldReseed({ ...base, refreshed: true, stale: true })).toBe(false);
    expect(shouldReseed({ ...base, refreshed: true, refreshing: true })).toBe(false);
  });
  it('a failed Undo whose reopen landed: the same list after the refresh still brings the hidden row back', () => {
    const cur = [row('u', 'gone')];
    const fresh = [{ id: 'u', title: 'U' }];
    expect(shouldReseed({ ...base, refreshed: true })).toBe(true);
    expect(reseed(cur, fresh, make)[0].phase).toBe('open');
  });
});

describe('settleAdd / settleComment (no twins after a retry)', () => {
  it('a saved add takes the real id', () => {
    const out = settleAdd([row('a', 'open'), { ...row('new-1', 'open'), fx: 'enter' }], 'new-1', 'X');
    expect(out.map((t) => [t.id, t.fx])).toEqual([
      ['a', 'enter'],
      ['X', null],
    ]);
  });
  it('when the real id is already on the board (the refresh brought it in), the temporary row leaves', () => {
    const out = settleAdd([row('X', 'open'), row('new-1', 'open')], 'new-1', 'X');
    expect(out.map((t) => t.id)).toEqual(['X']);
  });
  it('the same for a comment already in the thread', () => {
    expect(settleComment([{ id: 'c1' }, { id: 'c-new-1' }], 'c-new-1', 'c9')).toEqual([{ id: 'c1' }, { id: 'c9' }]);
    expect(settleComment([{ id: 'c9' }, { id: 'c-new-1' }], 'c-new-1', 'c9')).toEqual([{ id: 'c9' }]);
  });
});
