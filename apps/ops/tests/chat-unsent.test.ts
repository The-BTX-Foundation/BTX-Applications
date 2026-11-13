// Board chat's outside store (lib/chat-unsent.ts): Not-sent rows by target and drafts by view, owned by one person.
// Rows drop on Remove, on a Retry that saved, or when a refresh shows the id saved; a Retry that fails again keeps the
// row in its place. Another person never sees them, a board drawn for someone else empties the store, and the same
// person's board drawn again keeps everything.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addUnsent,
  claimChatStore,
  draftsSnapshot,
  dropUnsent,
  resetUnsent,
  setStoreDraft,
  setUnsentState,
  subscribeUnsent,
  unsentIn,
  unsentSnapshot,
} from '@/lib/chat-unsent';

const A = 'u-a';
const B = 'u-b';

beforeEach(() => {
  resetUnsent();
  claimChatStore(A);
});

describe('Not-sent rows', () => {
  it('keeps rows by target, in order, and tells subscribers', () => {
    let calls = 0;
    const off = subscribeUnsent(() => (calls += 1));
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    addUnsent(A, { id: 'b', target: 'ch-sch', text: 'Two', state: 'failed' });
    addUnsent(A, { id: 'c', target: 'direct:u-kd', text: 'Private', state: 'failed' });
    off();
    expect(calls).toBe(3);
    expect(unsentIn(unsentSnapshot(A), ['ch-sch']).map((r) => r.id)).toEqual(['a', 'b']);
    // A board channel never shows a direct conversation's row.
    expect(unsentIn(unsentSnapshot(A), ['ch-sch', 'ch-fin']).some((r) => r.target === 'direct:u-kd')).toBe(false);
  });

  it('survives a new board: the store is outside React and the snapshot is stable until a change', () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    const snap = unsentSnapshot(A);
    expect(unsentSnapshot(A)).toBe(snap);
    dropUnsent(A, ['not-there']);
    expect(unsentSnapshot(A)).toBe(snap);
  });

  it('a Retry runs ("sending"), fails again in place, then saves and drops', () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    addUnsent(A, { id: 'b', target: 'ch-sch', text: 'Two', state: 'failed' });
    setUnsentState(A, 'a', 'sending');
    expect(unsentSnapshot(A)['ch-sch'][0].state).toBe('sending');
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    expect(unsentIn(unsentSnapshot(A), ['ch-sch']).map((r) => `${r.id}:${r.state}`)).toEqual(['a:failed', 'b:failed']);
    dropUnsent(A, ['a']);
    expect(unsentIn(unsentSnapshot(A), ['ch-sch']).map((r) => r.id)).toEqual(['b']);
  });

  it('drops on Remove, and when a refresh shows the id saved', () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    addUnsent(A, { id: 'b', target: 'ch-fin', text: 'Two', state: 'failed' });
    dropUnsent(A, ['b']);
    expect(unsentSnapshot(A)['ch-fin']).toBeUndefined();
    // The refresh's messages include 'a' (the first try had saved after all).
    dropUnsent(A, ['m1', 'a', 'm2']);
    expect(unsentSnapshot(A)).toEqual({});
  });
});

describe('one person at a time', () => {
  it("never shows user A's row to user B, and B cannot change it", () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'Private to A', state: 'failed' });
    expect(unsentSnapshot(B)).toEqual({});
    addUnsent(B, { id: 'b', target: 'ch-sch', text: 'From B', state: 'failed' });
    setUnsentState(B, 'a', 'sending');
    dropUnsent(B, ['a']);
    setStoreDraft(B, 'ch-sch', 'B typing');
    expect(unsentIn(unsentSnapshot(A), ['ch-sch']).map((r) => `${r.id}:${r.state}`)).toEqual(['a:failed']);
    expect(draftsSnapshot(A)).toEqual({});
  });

  it('a board for another person empties the store first (rows and drafts)', () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'Private to A', state: 'failed' });
    setStoreDraft(A, 'all', 'A draft');
    claimChatStore(B);
    expect(unsentSnapshot(B)).toEqual({});
    expect(draftsSnapshot(B)).toEqual({});
    // A signing back in does not get the old rows back either: they were dropped.
    claimChatStore(A);
    expect(unsentSnapshot(A)).toEqual({});
    expect(draftsSnapshot(A)).toEqual({});
  });

  it('the same person drawn again (a remount) keeps rows and drafts', () => {
    addUnsent(A, { id: 'a', target: 'ch-sch', text: 'One', state: 'failed' });
    setStoreDraft(A, 'ch-fin', 'Half typed');
    const rows = unsentSnapshot(A);
    claimChatStore(A);
    expect(unsentSnapshot(A)).toBe(rows);
    expect(draftsSnapshot(A)).toEqual({ 'ch-fin': 'Half typed' });
  });
});

describe('drafts', () => {
  it('keeps one draft per view, survives a remount, and drops a draft when sent or emptied', () => {
    setStoreDraft(A, 'all', 'For everyone');
    setStoreDraft(A, 'ch-sch', 'For scholarships');
    const snap = draftsSnapshot(A);
    setStoreDraft(A, 'all', 'For everyone'); // no change: same snapshot
    expect(draftsSnapshot(A)).toBe(snap);
    claimChatStore(A); // the page drew a new board
    expect(draftsSnapshot(A)).toEqual({ all: 'For everyone', 'ch-sch': 'For scholarships' });
    setStoreDraft(A, 'ch-sch', ''); // sent (the box clears) or emptied
    expect(draftsSnapshot(A)).toEqual({ all: 'For everyone' });
  });
});
