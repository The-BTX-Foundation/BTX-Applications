// The Scoring page's write rules (lib/scoring-flow.ts): saves are serialized per application with the latest value
// winning, a write held past the limit says "No answer in time", a published sheet is locked, Publish runs only when
// everything is picked and nothing else is in flight, and a refused draft stays on screen with its words.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAILED_WORDS,
  TIMEOUT_WORDS,
  applyPick,
  canPublish,
  createSaveQueue,
  draftAfter,
  draftAnswerCounts,
  draftWords,
  editLocked,
  keepAfterRead,
  publishAsksFirst,
  publishCheckWords,
  publishFailWords,
  withLocal,
  within,
  type LocalDraft,
} from '@/lib/scoring-flow';
import type { ScSheet } from '@/lib/scoring-view';

const sheet = (o: Partial<ScSheet> = {}): ScSheet => ({
  applicationId: 'a1',
  code: 'APP-1',
  name: 'Ada',
  test: false,
  interviewDay: '2026-11-12',
  minutes: 20,
  otherName: 'Charlie',
  otherPublished: false,
  picks: {},
  published: false,
  publishedAt: null,
  savedAt: null,
  summary: null,
  quotes: [],
  note: '',
  ...o,
});

// A write whose answers the test hands out one at a time.
function deferredWrites() {
  const calls: { id: string; value: number; resolve: (r: string) => void }[] = [];
  const write = (id: string, value: number) => new Promise<string>((resolve) => calls.push({ id, value, resolve }));
  return { calls, write };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe('createSaveQueue', () => {
  it('writes one at a time per application and only the latest waiting value', async () => {
    const { calls, write } = deferredWrites();
    const settled: unknown[] = [];
    const q = createSaveQueue(write, (s) => settled.push(s));
    q.push('a1', 1);
    q.push('a1', 2);
    q.push('a1', 3);
    expect(calls.map((c) => c.value)).toEqual([1]);
    expect(q.busy('a1')).toBe(true);
    calls[0].resolve('ok1');
    await flush();
    // 2 was replaced by 3 while 1 was in flight.
    expect(calls.map((c) => c.value)).toEqual([1, 3]);
    expect(settled).toEqual([]);
    calls[1].resolve('ok3');
    await flush();
    expect(settled).toEqual([{ id: 'a1', value: 3, result: 'ok3', error: null }]);
    expect(q.busy('a1')).toBe(false);
  });

  it('keeps applications independent', async () => {
    const { calls, write } = deferredWrites();
    const q = createSaveQueue(write, () => {});
    q.push('a1', 1);
    q.push('a2', 5);
    expect(calls.map((c) => [c.id, c.value])).toEqual([
      ['a1', 1],
      ['a2', 5],
    ]);
  });

  it('settles a throw as an error, never as a success', async () => {
    const settled: { result: unknown; error: unknown }[] = [];
    const q = createSaveQueue(
      async () => {
        throw new Error('network');
      },
      (s) => settled.push(s),
    );
    q.push('a1', 1);
    await flush();
    expect(settled[0].result).toBeNull();
    expect(settled[0].error).toBeInstanceOf(Error);
  });
});

describe('within', () => {
  it('gives the answer when it comes in time', async () => {
    expect(await within(Promise.resolve(7), 50)).toEqual({ done: true, value: 7 });
  });
  it('gives done:false when the limit passes first', async () => {
    vi.useFakeTimers();
    const p = within(new Promise(() => {}), 1000);
    vi.advanceTimersByTime(1000);
    expect(await p).toEqual({ done: false });
  });
});

describe('the lock after publishing', () => {
  it('refuses a pick on a published sheet', () => {
    expect(applyPick(sheet({ published: true, picks: { a: 3 } }), 'a', 5)).toBeNull();
  });
  it('accepts 1 to 5 on a draft and nothing else', () => {
    expect(applyPick(sheet({ picks: { a: 3 } }), 'b', 5)).toEqual({ a: 3, b: 5 });
    expect(applyPick(sheet(), 'a', 0)).toBeNull();
    expect(applyPick(sheet(), 'a', 6)).toBeNull();
    expect(applyPick(sheet(), 'a', 2.5)).toBeNull();
  });
  it('lets the published server copy win over any local draft', () => {
    const local: LocalDraft = { picks: { a: 1 }, state: 'failed', error: 'x', savedLabel: null };
    expect(withLocal(sheet({ published: true, picks: { a: 4 } }), local).picks).toEqual({ a: 4 });
    expect(withLocal(sheet({ picks: { a: 4 } }), local).picks).toEqual({ a: 1 });
  });
});

describe('canPublish', () => {
  const keys = ['a', 'b'];
  it('needs every criterion, no save pending and no publish in flight', () => {
    expect(canPublish(sheet({ picks: { a: 1, b: 2 } }), keys, false, false)).toBe(true);
    expect(canPublish(sheet({ picks: { a: 1 } }), keys, false, false)).toBe(false);
    expect(canPublish(sheet({ picks: { a: 1, b: 2 } }), keys, true, false)).toBe(false);
    expect(canPublish(sheet({ picks: { a: 1, b: 2 } }), keys, false, true)).toBe(false);
    expect(canPublish(sheet({ picks: { a: 1, b: 2 }, published: true }), keys, false, false)).toBe(false);
    expect(canPublish(sheet(), [], false, false)).toBe(false);
  });
});

describe('a draft after a save', () => {
  it('shows Saved only after the call answered ok', () => {
    expect(draftAfter({ a: 2 }, { done: true, value: { ok: true, message: '', savedAt: '9:21 AM' } })).toEqual({ picks: { a: 2 }, state: 'saved', error: null, savedLabel: '9:21 AM' });
  });
  it('keeps a refused draft with its picks and the plain words', () => {
    const d = draftAfter({ a: 2 }, { done: true, value: { ok: false, message: 'You are not paired on this interview.' } });
    expect(d).toEqual({ picks: { a: 2 }, state: 'failed', error: 'You are not paired on this interview.', savedLabel: null });
    expect(draftWords(d, '9:00 AM')).toBe('You are not paired on this interview.');
  });
  it('says the time-out words and the throw words', () => {
    expect(draftAfter({}, { done: false }).error).toBe(TIMEOUT_WORDS);
    expect(TIMEOUT_WORDS).toBe('No answer in time. Reload to check.');
    expect(draftAfter({}, { thrown: true }).error).toBe(FAILED_WORDS);
  });
  it('keeps saving and refused drafts across a fresh read, never over a published sheet', () => {
    const m = new Map<string, LocalDraft>([
      ['a1', { picks: {}, state: 'saving', error: null, savedLabel: null }],
      ['a2', { picks: {}, state: 'saved', error: null, savedLabel: '9:00 AM' }],
      ['a3', { picks: {}, state: 'failed', error: 'x', savedLabel: null }],
      ['a4', { picks: {}, state: 'failed', error: 'x', savedLabel: null }],
    ]);
    const kept = keepAfterRead(m, [sheet({ applicationId: 'a4', published: true })]);
    expect([...kept.keys()]).toEqual(['a1', 'a3']);
  });
  it('words the footer', () => {
    expect(draftWords({ picks: {}, state: 'saving', error: null, savedLabel: null }, null)).toBe('Saving…');
    expect(draftWords(undefined, '9:14 AM')).toBe('Draft saved 9:14 AM');
    expect(draftWords(undefined, null)).toBe('Scores save as you go');
  });
});

describe('publish words', () => {
  it('says plainly what the server holds after a re-read', () => {
    expect(publishCheckWords(true)).toBe('Your score was published.');
    expect(publishCheckWords(false)).toBe('Not published. Your scores are still a draft.');
    expect(publishCheckWords(null)).toBe("Couldn't check what saved. Reload to see it.");
  });
  it('words a refusal and a time-out', () => {
    expect(publishFailWords({ done: false })).toBe(TIMEOUT_WORDS);
    expect(publishFailWords({ thrown: true })).toBe(TIMEOUT_WORDS);
    expect(publishFailWords({ done: true, value: { ok: false, message: 'Score every criterion first.' } })).toBe('Score every criterion first.');
  });
});

describe('the lock while a publish is in flight', () => {
  it('locks picks, keys, the note and draft saves while publishing or checking, and for good once published', () => {
    expect(editLocked(sheet(), null, null)).toBe(false);
    expect(editLocked(sheet(), 'a1', null)).toBe(true);
    expect(editLocked(sheet(), 'a2', null)).toBe(true);
    expect(editLocked(sheet(), null, 'a1')).toBe(true);
    expect(editLocked(sheet({ published: true }), null, null)).toBe(true);
  });
  it('ignores a late draft answer for a sheet being published or now published', () => {
    expect(draftAnswerCounts('a1', sheet(), null)).toBe(true);
    expect(draftAnswerCounts('a1', sheet(), 'a1')).toBe(false);
    expect(draftAnswerCounts('a1', sheet({ published: true }), null)).toBe(false);
    expect(draftAnswerCounts('a1', undefined, null)).toBe(false);
  });
  it('asks first live (no Undo) and publishes at once in the mock (with Undo)', () => {
    expect(publishAsksFirst({ undoPublish: false })).toBe(true);
    expect(publishAsksFirst({ undoPublish: true })).toBe(false);
  });
});
