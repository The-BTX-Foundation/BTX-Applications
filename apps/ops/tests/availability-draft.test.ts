// The draft rules on the refreshed Your availability page (lib/availability-draft.ts): after a send that wasn't
// confirmed, Undo returns to the re-read SERVER state (never an old state shown as saved); edits are refused while a
// send or the reader runs; the reader's late answer is built on the current draft; comparisons trim the note and treat
// names as a set; an open editor finds its span by time, not index; quick picks with no matching days say so.
import { describe, expect, it } from 'vitest';
import {
  clearAddAfterRead,
  DIFFER,
  needsOpen,
  pickMiss,
  pushChange,
  readerDraft,
  rebaseAfterCheck,
  sameSnap,
  spanIndex,
  undoChange,
  unexplained,
  type Change,
  type Snap,
} from '@/lib/availability-draft';
import { addSpan, toSpans } from '@/lib/availability-plan';

const DAYS = ['2026-11-11', '2026-11-12'];
const S0: Snap = { spans: toSpans(DAYS, []), conflicts: [], limit: 5, text: '' };
const wed = (s: Snap): Snap => ({ ...s, spans: addSpan(s.spans, '2026-11-11', 1020, 1260) });
const named = (s: Snap): Snap => ({ ...s, conflicts: [...s.conflicts, 'Jordan Pierce'] });

// Two changes on S0: Wed free, then a name. Returns the stack and the draft.
function twoChanges(): { stack: Change[]; draft: Snap } {
  const a = pushChange([], S0, wed(S0), 'Added Wed Nov 11, 5 to 9 PM', 'add', false)!;
  const b = pushChange(a.stack, a.draft, named(a.draft), 'Added Jordan Pierce to students you know', 'names', false)!;
  return b;
}

describe('availability draft after a send that was not confirmed', () => {
  it('partial save (times saved, names not) then Undo: back to the re-read server state, nothing hidden', () => {
    const { stack, draft } = twoChanges();
    const server = wed(S0); // replaceRanges landed, the names insert failed
    const r = rebaseAfterCheck(server, draft, stack);
    expect(r.saved).toBe(false);
    expect(r.stack).toHaveLength(1);
    expect(r.stack[0].texts).toEqual(['Added Wed Nov 11, 5 to 9 PM', 'Added Jordan Pierce to students you know']);
    const u = undoChange(r.stack)!;
    expect(sameSnap(u.draft, server)).toBe(true); // Wed still shown: it IS saved
    expect(u.stack).toHaveLength(0);
    expect(unexplained(u.draft, server, u.stack)).toBe(false);
    expect(needsOpen({ pending: 0, differs: false, error: false, neverSent: false })).toBe(false);
  });

  it('no answer, re-read shows nothing saved, the save lands late: the next read clears the list; an Undo past it shows DIFFER', () => {
    const { stack, draft } = twoChanges();
    const first = rebaseAfterCheck(S0, draft, stack); // re-read before the late commit
    expect(first.stack[0].before).toEqual(S0);
    // The late commit: the server now holds the whole draft.
    expect(rebaseAfterCheck(draft, draft, first.stack)).toEqual({ stack: [], saved: true });
    // Had the person undone before the late read, the screen (S0) would differ from the server (draft) unexplained.
    const u = undoChange(first.stack)!;
    expect(unexplained(u.draft, draft, u.stack)).toBe(true);
    expect(needsOpen({ pending: 0, differs: true, error: false, neverSent: false })).toBe(true);
    expect(DIFFER).toBe("Your saved times differ from what's shown.");
  });

  it('a confirmed send is unchanged: the server holds the draft, the list clears', () => {
    const { stack, draft } = twoChanges();
    expect(rebaseAfterCheck(draft, draft, stack)).toEqual({ stack: [], saved: true });
  });

  it('plain Undo with nothing sent goes back one step at a time', () => {
    const { stack } = twoChanges();
    const u1 = undoChange(stack)!;
    expect(u1.draft).toEqual(wed(S0));
    const u2 = undoChange(u1.stack)!;
    expect(u2.draft).toEqual(S0);
    expect(undoChange(u2.stack)).toBeNull();
  });
});

describe('availability draft locks and late answers', () => {
  it('refuses every edit while a send or the reader runs', () => {
    expect(pushChange([], S0, named(S0), 'Added Jordan Pierce to students you know', 'names', true)).toBeNull();
    expect(pushChange([], S0, S0, 'nothing', 'add', false)).toBeNull();
  });
  it("the reader's answer is built on the CURRENT draft and keeps what was typed meanwhile", () => {
    const current = named(S0); // changed after the press
    const spans = toSpans(DAYS, [{ day: '2026-11-12', startMin: 600, endMin: 720 }]);
    const next = readerDraft(current, spans, 'thu 10 to 12');
    expect(next.conflicts).toEqual(['Jordan Pierce']);
    expect(next.spans['2026-11-12']).toEqual([[600, 720]]);
    expect(clearAddAfterRead('thu 10 to 12', 'thu 10 to 12')).toBe(true);
    expect(clearAddAfterRead('fri 5 to 9', 'thu 10 to 12')).toBe(false);
  });
});

describe('availability draft comparisons and small rules', () => {
  it('the note is compared trimmed and names as a set', () => {
    expect(sameSnap({ ...S0, text: ' Weekday evenings ', conflicts: ['B', 'A'] }, { ...S0, text: 'Weekday evenings', conflicts: ['A', 'B'] })).toBe(true);
    expect(sameSnap({ ...S0, conflicts: ['A'] }, { ...S0, conflicts: ['B'] })).toBe(false);
  });
  it('an editor finds its span by time; a span gone after a re-read is -1', () => {
    const s = wed(S0).spans;
    expect(spanIndex(s, '2026-11-11', 1020, 1260)).toBe(0);
    expect(spanIndex(s, '2026-11-11', 600, 720)).toBe(-1);
    expect(spanIndex(s, '2026-11-30', 600, 720)).toBe(-1);
  });
  it('quick picks with no matching days say so', () => {
    expect(pickMiss('weekends', 0)).toBe('No weekend days in this window.');
    expect(pickMiss('weekends', 2)).toBe("You're already free then.");
  });
});
