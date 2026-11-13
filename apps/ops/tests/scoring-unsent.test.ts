// The Scoring "not saved" memory (lib/scoring-unsent.ts): one owner at a time, someone else signing in clears it, and a
// confirmed save drops the entry.
import { afterEach, describe, expect, it } from 'vitest';
import { claimUnsent, keepDraft, keepNote, resetUnsent, unsentDrafts, unsentNotes } from '@/lib/scoring-unsent';

afterEach(() => resetUnsent());

describe('scoring unsent memory', () => {
  it("keeps the owner's refused draft and note words, and drops them on a confirmed save", () => {
    claimUnsent('u1');
    keepDraft('u1', 'a1', { picks: { community: 3 }, error: "Couldn't save your draft." });
    keepNote('u1', 'a1', 'half a thought');
    expect(unsentDrafts('u1').get('a1')).toEqual({ picks: { community: 3 }, error: "Couldn't save your draft." });
    expect(unsentNotes('u1').get('a1')).toBe('half a thought');
    keepDraft('u1', 'a1', null);
    keepNote('u1', 'a1', null);
    expect(unsentDrafts('u1').size).toBe(0);
    expect(unsentNotes('u1').size).toBe(0);
  });

  it('gives nothing to anyone else and clears when a different person signs in', () => {
    claimUnsent('u1');
    keepDraft('u1', 'a1', { picks: { community: 3 }, error: 'x' });
    keepNote('u1', 'a1', 'mine');
    expect(unsentDrafts('u2').size).toBe(0);
    expect(unsentNotes('u2').size).toBe(0);
    keepDraft('u2', 'a2', { picks: { community: 1 }, error: 'x' });
    claimUnsent('u2');
    expect(unsentDrafts('u2').size).toBe(0);
    expect(unsentNotes('u2').size).toBe(0);
    claimUnsent('u1');
    expect(unsentDrafts('u1').size).toBe(0);
  });

  it('hands out copies, so the board cannot change the memory by accident', () => {
    claimUnsent('u1');
    keepDraft('u1', 'a1', { picks: { community: 3 }, error: 'x' });
    unsentDrafts('u1').clear();
    expect(unsentDrafts('u1').size).toBe(1);
  });
});
