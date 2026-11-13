// The Interview questions "Not saved" store (lib/questions-store.ts): per person, replaced by key, and a failed save the
// server later lists goes away (not while it is being retried).
import { describe, expect, it, vi } from 'vitest';
import { claimNotSaved, clearNotSaved, dropListedNotSaved, dropNotSaved, keepNotSaved, nextTmpId, notSavedSnapshot, patchNotSaved, subscribeNotSaved } from '@/lib/questions-store';
import type { NotSaved } from '@/lib/questions-flow';
import type { QnGroup } from '@/lib/questions-view';

const add = (key: string, words: string): NotSaved => ({ key, kind: 'add', cycleId: 'c1', gk: 'a', words, knownIds: ['1'], message: "Couldn't save. Try again." });
const groups = (texts: string[]): QnGroup[] => [{ key: 'a', name: 'A', weight: 20, questions: [{ id: '1', text: 'Old' }, ...texts.map((t, i) => ({ id: `n${i}`, text: t }))] }];

describe('not-saved store', () => {
  it('keeps entries per person, replaces by key and tells listeners', () => {
    const fn = vi.fn();
    const off = subscribeNotSaved(fn);
    keepNotSaved('u1', add('k1', 'First'));
    keepNotSaved('u1', add('k1', 'First again'));
    keepNotSaved('u2', add('k2', 'Other'));
    expect(notSavedSnapshot('u1').map((n) => n.words)).toEqual(['First again']);
    expect(notSavedSnapshot('u2')).toHaveLength(1);
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    dropNotSaved('u1', 'k1');
    dropNotSaved('u2', 'k2');
    expect(notSavedSnapshot('u1')).toEqual([]);
  });
  it('the same array until something changes', () => {
    expect(notSavedSnapshot('u3')).toBe(notSavedSnapshot('u3'));
  });
  it('drops what the server lists, except entries being retried', () => {
    keepNotSaved('u4', add('k1', 'Saved after all'));
    keepNotSaved('u4', add('k2', 'Busy one'));
    patchNotSaved('u4', 'k2', { busy: true });
    keepNotSaved('u4', add('k3', 'Still missing'));
    dropListedNotSaved('u4', groups(['Saved after all', 'Busy one']), 'c1');
    expect(notSavedSnapshot('u4').map((n) => n.key)).toEqual(['k2', 'k3']);
  });
});

describe('not-saved store: review fixes', () => {
  it('keys never restart, so a second failure after leaving and coming back keeps the first words', () => {
    // Two boards (a visit away and back) each make a key; neither replaces the other's entry.
    const first = nextTmpId();
    keepNotSaved('u5', add(`a:${first}`, 'First words'));
    const second = nextTmpId();
    keepNotSaved('u5', add(`a:${second}`, 'Second words'));
    expect(first).not.toBe(second);
    expect(notSavedSnapshot('u5').map((n) => n.words)).toEqual(['First words', 'Second words']);
  });
  it('a board drawn for someone else clears it; the same person again keeps it; sign-out clears it', () => {
    claimNotSaved('u6');
    keepNotSaved('u6', add('k1', 'Mine'));
    claimNotSaved('u6');
    expect(notSavedSnapshot('u6')).toHaveLength(1);
    claimNotSaved('u7');
    expect(notSavedSnapshot('u6')).toEqual([]);
    keepNotSaved('u7', add('k2', 'Theirs'));
    clearNotSaved();
    expect(notSavedSnapshot('u7')).toEqual([]);
  });
  it('never matches an entry from another cycle against this one', () => {
    keepNotSaved('u8', { ...add('k1', 'Same words'), cycleId: 'old' });
    dropListedNotSaved('u8', groups(['Same words']), 'c1');
    expect(notSavedSnapshot('u8')).toHaveLength(1);
  });
});
