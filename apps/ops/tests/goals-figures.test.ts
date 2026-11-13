// The Goals board's figure boxes (lib/goals-figures.ts): the order of save, refusal, undo and fresh server data, so a
// refused live write can never leave a figure on screen that the database does not have, and never moves focus out of
// a box the person is typing in.
import { describe, expect, it } from 'vitest';
import { chain, figReducer, FORCE, initFigs, refusalFocus, SAVE_ERR, shouldReseed, undoOutcome, type FigAction, type FigState, type Figs } from '@/lib/goals-figures';
import { liveCaps } from '@/lib/goals-map';

const K = 'money_raised_cents:2025';
const K2 = 'applicants:2024';
const caps = liveCaps();
const step = figReducer(caps);
const run = (s: FigState, ...as: FigAction[]) => as.reduce(step, s);
const start = (figs: Figs = {}) => initFigs(figs, 'sig0', K, caps);
const save = (k: string, value: number, seq: number): FigAction => ({ type: 'save', k, value, at: '9:14 AM', seq });

describe('live caps drive the controls', () => {
  it('opens the first box and lets a figure be saved and undone', () => {
    const s = run(start(), { type: 'type', text: '12,400' }, save(K, 1_240_000, 1));
    expect(start().open).toBe(K);
    expect(s.figs[K]).toBe(1_240_000);
    expect(run(s, { type: 'undo' }).figs[K]).toBeUndefined();
  });
  it('draws no box and undoes nothing without the caps', () => {
    const off = { figure: false, figureUndo: false };
    const none = figReducer(off);
    const s0 = initFigs({}, 'sig0', K, off);
    expect(s0.open).toBeNull();
    expect(none(s0, { type: 'open', k: K }).open).toBeNull();
    expect(none(s0, save(K, 1, 1))).toBe(s0);
    const noUndo = figReducer({ figure: true, figureUndo: false });
    const saved = noUndo(s0, save(K, 5, 1));
    expect(noUndo(saved, { type: 'undo' })).toBe(saved);
  });
});

describe('save', () => {
  it('draws the figure at once and remembers the value before', () => {
    const s = run(start({ [K]: 5 }), save(K, 9, 1));
    expect(s.saved).toEqual({ k: K, at: '9:14 AM', value: 9, before: 5, seq: 1 });
    expect(s.open).toBeNull();
  });
  it('a refused save goes back to the server value, reopens its box with what was typed, and forces a reload', () => {
    const s = run(start(), { type: 'type', text: '12,400' }, save(K, 1_240_000, 1), { type: 'saveRefused', k: K, seq: 1, text: '12,400', server: {} });
    expect(s.figs[K]).toBeUndefined();
    expect(s).toMatchObject({ open: K, typed: '12,400', err: SAVE_ERR, saved: null, seenSig: FORCE, bad: null });
  });
  it('a refused save keeps what the person is typing in another box', () => {
    const s = run(start(), save(K, 1_240_000, 1), { type: 'open', k: K2 }, { type: 'type', text: '96' }, { type: 'saveRefused', k: K, seq: 1, text: '12,400', server: {} });
    expect(s).toMatchObject({ open: K2, typed: '96', err: '', bad: K });
    expect(s.figs[K]).toBeUndefined();
  });
  it('a refused save takes the server value, never a remembered one', () => {
    const s = run(start({ [K]: 5 }), save(K, 9, 1), { type: 'saveRefused', k: K, seq: 1, text: '0.09', server: { [K]: 7 } });
    expect(s.figs[K]).toBe(7);
  });
});

describe('undo', () => {
  it('removes a first entry and reopens its box', () => {
    const s = run(start(), save(K, 9, 1), { type: 'undo' });
    expect(s.figs[K]).toBeUndefined();
    expect(s).toMatchObject({ open: K, typed: '', saved: null });
  });
  it('puts an earlier figure back', () => {
    const s = run(start({ [K]: 5 }), save(K, 9, 1), { type: 'undo' });
    expect(s.figs[K]).toBe(5);
    expect(s.open).toBeNull();
  });
  it('after a saved figure, a refused undo keeps showing it (the database holds it) with the error line, and reloads', () => {
    // Server data predates the save (empty): the cell must not fall back to an empty "Add".
    const s = run(start(), save(K, 9, 1), { type: 'undo' }, { type: 'undoRefused', k: K, seq: 1, value: 9 });
    expect(s.figs[K]).toBe(9);
    expect(s).toMatchObject({ open: null, bad: K, seenSig: FORCE });
  });
});

describe('undo of a refused save (nothing to undo)', () => {
  it('reports no second failure', () => {
    expect(undoOutcome(false, false)).toBe('nothing');
    expect(undoOutcome(true, true)).toBe('done');
    expect(undoOutcome(true, false)).toBe('refused');
  });
  it('keeps the box open with the restored text and the single save error', () => {
    // Save (refused later), Undo before the refusal lands, then the refusal; the board sends no undoRefused ('nothing').
    const s = run(start(), { type: 'type', text: '12,400' }, save(K, 1_240_000, 1), { type: 'undo' }, { type: 'saveRefused', k: K, seq: 1, text: '12,400', server: {} });
    expect(s).toMatchObject({ open: K, typed: '12,400', err: SAVE_ERR, bad: null, saved: null, seenSig: FORCE });
    expect(s.figs[K]).toBeUndefined();
  });
});

describe('stale refusals (save, undo, save again)', () => {
  it('a late undo refusal neither empties the cell nor puts an error beside a valid "Saved · Undo"', () => {
    let s = run(start(), save(K, 9, 1), { type: 'undo' }, save(K, 11, 2));
    s = run(s, { type: 'undoRefused', k: K, seq: 1, value: 9 });
    expect(s.figs[K]).toBe(11);
    expect(s.saved).toMatchObject({ k: K, value: 11, seq: 2 });
    expect(s.bad).toBeNull();
    expect(s.seenSig).toBe(FORCE);
  });
  it('a late save refusal for an older save changes nothing on screen', () => {
    let s = run(start(), save(K, 9, 1), { type: 'undo' }, save(K, 11, 2));
    s = run(s, { type: 'saveRefused', k: K, seq: 1, text: '9', server: {} });
    expect(s).toMatchObject({ open: null, err: '', bad: null });
    expect(s.figs[K]).toBe(11);
  });
});

describe('refusalFocus', () => {
  const refusedSave = { type: 'saveRefused', k: K, seq: 1, text: '9', server: {} } as const;
  const refusedUndo = { type: 'undoRefused', k: K, seq: 1, value: 9 } as const;
  it('moves focus to the reopened box or the row when no other box is open', () => {
    expect(refusalFocus(run(start(), save(K, 9, 1)), refusedSave)).toEqual(['#gl-in', `[data-row="${K}"]`]);
    expect(refusalFocus(run(start(), save(K, 9, 1), { type: 'undo' }), refusedUndo)).toEqual([`[data-row="${K}"]`]);
  });
  it('leaves focus alone while the person types in another box', () => {
    const typing = run(start(), save(K, 9, 1), { type: 'open', k: K2 }, { type: 'type', text: '96' });
    expect(refusalFocus(typing, refusedSave)).toBeNull();
    const typingAfterUndo = run(start({ [K]: 5 }), save(K, 9, 1), { type: 'undo' }, { type: 'open', k: K2 });
    expect(refusalFocus(typingAfterUndo, refusedUndo)).toBeNull();
  });
  it('moves nothing for a stale refusal', () => {
    const again = run(start(), save(K, 9, 1), { type: 'undo' }, save(K, 11, 2));
    expect(refusalFocus(again, refusedSave)).toBeNull();
    expect(refusalFocus(again, refusedUndo)).toBeNull();
  });
});

describe('fresh server data', () => {
  it('is taken in only when the page is quiet and the data is new (or a reload is forced)', () => {
    expect(shouldReseed('a', 'b', true)).toBe(true);
    expect(shouldReseed('a', 'a', true)).toBe(false);
    expect(shouldReseed('a', 'b', false)).toBe(false);
    expect(shouldReseed('', FORCE, true)).toBe(true);
  });
  it('does not overwrite an optimistic figure while a write is running', () => {
    const s = run(start(), save(K, 9, 1), { type: 'server', sig: 'other', figs: {}, quiet: false });
    expect(s.figs[K]).toBe(9);
  });
  it('after refusals, the forced reload replaces every cell with the database figures', () => {
    let s = run(start(), save(K, 9, 1), { type: 'undo' }, { type: 'undoRefused', k: K, seq: 1, value: 9 });
    // Same (empty) server signature as before: still taken in, because the reload was forced.
    s = run(s, { type: 'server', sig: '', figs: {}, quiet: true });
    expect(s.figs).toEqual({});
    s = run(s, { type: 'server', sig: 'k:11', figs: { [K]: 11 }, quiet: true });
    expect(s.figs[K]).toBe(11);
  });
});

describe('chain', () => {
  it('runs writes on one cell in order, even after a failure, and other cells independently', async () => {
    const q = new Map<string, Promise<unknown>>();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = chain(q, K, async () => {
      await gate;
      log.push('save');
      throw new Error('refused');
    });
    const b = chain(q, K, async () => {
      log.push('undo');
      return false;
    });
    const c = chain(q, K2, async () => {
      log.push('other cell');
      return true;
    });
    await c;
    expect(log).toEqual(['other cell']);
    release();
    await expect(a).rejects.toThrow('refused');
    expect(await b).toBe(false);
    expect(log).toEqual(['other cell', 'save', 'undo']);
  });
});
