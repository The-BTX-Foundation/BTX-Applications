// The Interview questions page's write decisions (lib/questions-flow.ts).
import { describe, expect, it } from 'vitest';
import { CLOSE_KEY } from '@/lib/questions-map';
import { ERR_CONFLICT, ERR_GONE, ERR_SAVE, ERR_TIMEOUT, guardUndoAdd, isStale, isTmp, locksMoves, movesLocked, pasteCuts, starterWhat, applyAdd, applyEdit, applyMove, applyRemove, clean, dropIndex, failWords, guardEdit, isListed, isOrphan, mayMoveFocus, movesFor, retryAdd, reverseMoves, savedSay, withTimeout, type NotSaved } from '@/lib/questions-flow';
import type { QnGroup } from '@/lib/questions-view';

const G = (): QnGroup[] => [
  { key: 'a', name: 'A', weight: 20, questions: [{ id: '1', text: 'One' }, { id: '2', text: 'Two' }, { id: '3', text: 'Three' }] },
  { key: null, name: 'To close', weight: null, questions: [{ id: '4', text: 'Four' }] },
];

describe('local changes', () => {
  it('edit, add, remove and move change only what they name, never the input', () => {
    const g = G();
    expect(applyEdit(g, '2', 'Deux')[0].questions[1].text).toBe('Deux');
    expect(applyAdd(g, CLOSE_KEY, 'n', 'New')[1].questions.map((q) => q.id)).toEqual(['4', 'n']);
    expect(applyRemove(g, '1')[0].questions.map((q) => q.id)).toEqual(['2', '3']);
    expect(applyMove(g, '3', 0)[0].questions.map((q) => q.id)).toEqual(['3', '1', '2']);
    expect(applyMove(g, '3', 5)).toBe(g);
    expect(g).toEqual(G());
  });
  it('a drag is one-place moves, and undoes with the reverse', () => {
    expect(movesFor(0, 2)).toEqual(['down', 'down']);
    expect(movesFor(3, 1)).toEqual(['up', 'up']);
    expect(movesFor(1, 1)).toEqual([]);
    expect(reverseMoves(['down', 'down'])).toEqual(['up', 'up']);
  });
  it('drops where the dragged middle passes the other middles', () => {
    expect(dropIndex([10, 50, 90], 60)).toBe(2);
    expect(dropIndex([10, 50, 90], 0)).toBe(0);
  });
  it('cleans words like the demo', () => {
    expect(clean('  a\n\n b   c ')).toBe('a b c');
  });
});

describe('the edit guard', () => {
  it('writes only when the question still has the text the edit started from', () => {
    expect(guardEdit({ text: 'One ' }, 'One')).toBe('ok');
    expect(guardEdit({ text: 'Someone else' }, 'One')).toBe('changed');
    expect(guardEdit(null, 'One')).toBe('gone');
    expect(guardEdit('failed', 'One')).toBe('failed');
  });
});

describe('not saved', () => {
  const add: Extract<NotSaved, { kind: 'add' }> = { key: 'a:1', kind: 'add', cycleId: 'c1', gk: 'a', words: 'New one', knownIds: ['1', '2', '3'], message: ERR_SAVE };
  const edit: Extract<NotSaved, { kind: 'edit' }> = { key: 'e:2', kind: 'edit', cycleId: 'c1', gk: 'a', qid: '2', words: 'Deux', fromText: 'Two', message: ERR_SAVE, conflict: false };
  it('a failed add the server later lists (a new id with the same words) went through', () => {
    expect(isListed(add, G())).toBe(false);
    expect(isListed(add, applyAdd(G(), 'a', '9', 'New  one'))).toBe(true);
    expect(isListed({ ...add, knownIds: ['1', '2', '3', '9'] }, applyAdd(G(), 'a', '9', 'New one'))).toBe(false);
  });
  it('a failed edit the server shows with the new words went through', () => {
    expect(isListed(edit, G())).toBe(false);
    expect(isListed(edit, applyEdit(G(), '2', 'Deux'))).toBe(true);
  });
  it('a failed edit of a removed question is an orphan', () => {
    expect(isOrphan(edit, applyRemove(G(), '2'))).toBe(true);
    expect(isOrphan(add, G())).toBe(false);
  });
  it('a retried add sends only when the words are not there yet', () => {
    expect(retryAdd(add, G())).toBe('send');
    expect(retryAdd(add, applyAdd(G(), 'a', '9', 'New one'))).toBe('already');
    expect(retryAdd(add, 'failed')).toBe('failed');
  });
});

describe('words, focus and time', () => {
  it('says each failure plainly', () => {
    expect(failWords({ ok: false, kind: 'timeout', message: '' })).toBe(ERR_TIMEOUT);
    expect(ERR_TIMEOUT).toBe('No answer in time. Reload to check.');
    expect(failWords({ ok: false, kind: 'conflict', message: '' })).toBe(ERR_CONFLICT);
    expect(failWords({ ok: false, kind: 'gone', message: 'x' })).toBe(ERR_GONE);
    expect(failWords({ ok: false, kind: 'failed', message: 'Keep the question under 500 characters.' })).toBe('Keep the question under 500 characters.');
    expect(failWords({ ok: false, kind: 'failed', message: '' })).toBe(ERR_SAVE);
    expect(savedSay('Saved question 3', true)).toBe('Saved question 3. Saved. Undo available.');
    expect(savedSay('Removed question 3', false)).toBe('Removed question 3. Saved.');
  });
  it('never pulls focus out of a field after a write', () => {
    expect(mayMoveFocus(true, 'TEXTAREA')).toBe(false);
    expect(mayMoveFocus(true, 'BUTTON')).toBe(true);
    expect(mayMoveFocus(false, 'TEXTAREA')).toBe(true);
  });
  it('times out without waiting for ever', async () => {
    expect(await withTimeout(new Promise(() => {}), 5)).toBe('timeout');
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
  });
});

describe('review fixes', () => {
  const add: NotSaved = { key: 'a:tmp-1', kind: 'add', cycleId: 'c1', gk: 'a', words: 'New one', knownIds: ['1'], message: ERR_SAVE };
  it('clean drops zero-width characters', () => {
    expect(clean('\u200BWhy\u200C this\u200D one?\uFEFF ')).toBe('Why this one?');
    expect(clean('\u200B\uFEFF')).toBe('');
  });
  it('a just-added question has a tmp- id until the server answers', () => {
    expect(isTmp('tmp-3')).toBe(true);
    expect(isTmp('8f1c-uuid')).toBe(false);
  });
  it('a move with no answer in time locks moving until a new read lands', () => {
    expect(locksMoves({ ok: false, kind: 'timeout', message: '' })).toBe(true);
    expect(locksMoves({ ok: false, kind: 'failed', message: '' })).toBe(false);
    expect(locksMoves({ ok: true })).toBe(false);
    const read = G();
    expect(movesLocked(read, read)).toBe(true);
    expect(movesLocked(read, G())).toBe(false);
    expect(movesLocked(null, read)).toBe(false);
  });
  it('the starter line says the true number, or that they are on the list', () => {
    expect(starterWhat(12, 12)).toBe('Added the 12 starter questions');
    expect(starterWhat(5, 12)).toBe('Added 5 starter questions');
    expect(starterWhat(1, 12)).toBe('Added 1 starter question');
    expect(starterWhat(0, 12)).toBe('The starter questions are on the list');
    expect(starterWhat(undefined, 12)).toBe('The starter questions are on the list');
  });
  it('a retried edit already saved; Undo of an add only while the words are unchanged', () => {
    expect(guardEdit({ text: 'Deux' }, 'Two', 'Deux')).toBe('saved');
    expect(guardEdit({ text: 'Two' }, 'Two', 'Deux')).toBe('ok');
    expect(guardUndoAdd({ text: 'New one' }, 'New one')).toBe('ok');
    expect(guardUndoAdd({ text: 'Other' }, 'New one')).toBe('changed');
    expect(guardUndoAdd(null, 'New one')).toBe('gone');
  });
  it('a failed save from another cycle is stale', () => {
    expect(isStale(add, 'c1')).toBe(false);
    expect(isStale(add, 'c2')).toBe(true);
    expect(isStale(add, null)).toBe(true);
  });
  it('a paste past 500 characters is cut', () => {
    expect(pasteCuts(490, 0, 20)).toBe(true);
    expect(pasteCuts(490, 10, 20)).toBe(false);
    expect(pasteCuts(0, 0, 500)).toBe(false);
  });
});
