// The Instagram board's write decisions (lib/instagram-flow.ts) with the writer and the "Not added" store: a timed-out add
// that a refresh lists (error and words cleared) or does not (Try again keeps the same id), a failed send leaving the
// server's value, a double send, the focus after add, send and Escape, the day a typed line is read against, and the
// live wording (nothing is sent to anyone live).
import { describe, expect, it } from 'vitest';
import { addEffect, emptyWords, ESCAPE_FOCUS, mayMoveFocus, NEED_WORDS, runSend, sendEffect, sentWords, submitDay, type SendResult } from '@/lib/instagram-flow';
import { readPostLine } from '@/lib/instagram-time';
import { dropListedNotAdded, keepNotAdded, notAddedSnapshot } from '@/lib/instagram-unadded';
import { addPost, type IgWriteClient, type NewPost } from '@/lib/instagram-writes';
import { retryIds } from '@/lib/tasks-ids';
import { IG_BOARD } from '@/mock/instagram-view';

const P: NewPost = { channelId: 'ch1', title: 'Thank our donors', postOn: '2026-12-02', ownerId: null };
const KEITH = IG_BOARD[1];

// An insert-only stand-in: each call answers with the next result; ids are recorded.
function inserts(answers: ('ok' | 'timeout' | 'dup')[]) {
  const ids: unknown[] = [];
  const c = {
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          abortSignal: async () => {
            ids.push(row.id);
            const a = answers.shift();
            if (a === 'timeout') throw new DOMException('timed out', 'TimeoutError');
            if (a === 'dup') return { data: null, error: { code: '23505' } };
            return { data: [{ id: row.id }], error: null };
          },
        }),
      }),
      update: () => {
        throw new Error('no update here');
      },
    }),
  } as unknown as IgWriteClient;
  return { c, ids };
}

describe('a timed-out add', () => {
  it('keeps its words and id; a refresh that lists the id clears the error', async () => {
    let n = 0;
    const { c } = inserts(['timeout']);
    const r = await addPost(P, 'me-a', c, 0, retryIds(() => `id-${++n}`));
    const fx = addEffect(r, P.title, P.postOn, true, false);
    expect(fx).toEqual({ saved: false, say: "Couldn't save. Try again. Not added: Thank our donors", keepId: 'id-1', refresh: true });
    if (fx.saved) return;
    keepNotAdded('me-a', { key: 'k', post: P, state: 'failed', id: fx.keepId });
    dropListedNotAdded('me-a', new Set(['other']));
    expect(notAddedSnapshot('me-a')).toHaveLength(1);
    dropListedNotAdded('me-a', new Set(['id-1']));
    expect(notAddedSnapshot('me-a')).toEqual([]);
  });
  it('a refresh that does not list it leaves Try again, which reuses the same id and says Added only after the save', async () => {
    let n = 0;
    const memory = retryIds(() => `id-${++n}`);
    const { c, ids } = inserts(['timeout', 'dup']);
    const r1 = await addPost(P, 'me-b', c, 0, memory);
    keepNotAdded('me-b', { key: 'k', post: P, state: 'failed', id: r1.id });
    dropListedNotAdded('me-b', new Set());
    const row = notAddedSnapshot('me-b')[0];
    const r2 = await addPost(row.post, 'me-b', c, 10 * 60_000, memory, row.id);
    expect(ids).toEqual(['id-1', 'id-1']);
    const fx = addEffect(r2, P.title, P.postOn, true, true);
    expect(fx).toEqual({ saved: true, say: 'Added to December', focus: '#ig-row-id-1|.ig-unadded [data-na]|#ig-add-open|#ig-add-in' });
  });
  it('a new add keeps the cursor in the add line', () => {
    expect(addEffect({ ok: true, id: 'x' }, 'T', null, true, false)).toEqual({ saved: true, say: 'Added to No date yet', focus: '#ig-add-in|#ig-add-open' });
  });
});

describe('send', () => {
  it('a failed send changes nothing locally, says so once, keeps focus on Send and refreshes live', () => {
    expect(sendEffect('failed', true, null, '9:14 AM')).toEqual({ patch: null, error: "Couldn't save. Try again.", say: "Couldn't save. Try again.", focus: '[data-x="send"]|[data-row-sel]', refresh: true });
    expect(sendEffect('failed', false, KEITH, '9:14 AM').refresh).toBe(false);
  });
  it('a send that matched no row says the post moved on', () => {
    expect(sendEffect('moved', true, null, 'x')).toMatchObject({ patch: null, error: 'That post has already moved on.', say: 'That post has already moved on.', refresh: true });
  });
  it('a saved send marks the post and says only what happened (live notifies nobody)', () => {
    expect(sendEffect('ok', true, null, '9:14 AM')).toEqual({ patch: { sent: true, sentAt: '9:14 AM' }, error: null, say: 'Marked as waiting for approval', focus: '[data-x="unsend"]|[data-row-sel]', refresh: true });
    expect(sentWords(true, KEITH)).toBe('Marked as waiting for approval');
    expect(sentWords(false, KEITH)).toBe('Sent to Keith Dawson for approval');
    expect(sentWords(false, null)).toBe('Sent for board approval');
  });
  it('a second tap while a send runs is ignored, and a thrown write is a failure', async () => {
    const busy = new Set<string>();
    let calls = 0;
    let release: (r: SendResult) => void = () => {};
    const write = () => (calls++, new Promise<SendResult>((r) => (release = r)));
    const a = runSend('p1', busy, write);
    expect(await runSend('p1', busy, write)).toBe('busy');
    release('ok');
    expect(await a).toBe('ok');
    expect(calls).toBe(1);
    expect(busy.size).toBe(0);
    expect(await runSend('p1', busy, async () => { throw new Error('x'); })).toBe('failed');
    expect(busy.size).toBe(0);
  });
});

describe('focus', () => {
  it('a move after a write never pulls the cursor out of a field; a click or key move always may', () => {
    expect(mayMoveFocus(true, 'INPUT')).toBe(false);
    expect(mayMoveFocus(true, 'TEXTAREA')).toBe(false);
    expect(mayMoveFocus(true, 'BUTTON')).toBe(true);
    expect(mayMoveFocus(true, 'BODY')).toBe(true);
    expect(mayMoveFocus(false, 'INPUT')).toBe(true);
    expect(mayMoveFocus(true, undefined)).toBe(true);
  });
  it('Escape in the add line goes back to the "Add a post" row', () => {
    expect(ESCAPE_FOCUS).toBe('#ig-add-open');
  });
});

describe('the day a typed line is read against', () => {
  it('live reads the Eastern day at submit; mock keeps the sample day', () => {
    // 3:30 AM UTC on Nov 11 is still Nov 10 in Eastern time; 5:30 AM UTC is Nov 11.
    expect(submitDay(true, '2026-11-09', new Date('2026-11-11T03:30:00Z'))).toBe('2026-11-10');
    expect(submitDay(true, '2026-11-09', new Date('2026-11-11T05:30:00Z'))).toBe('2026-11-11');
    expect(submitDay(false, '2026-11-10', new Date('2027-01-01T12:00:00Z'))).toBe('2026-11-10');
  });
  it('"tomorrow" after midnight is the day after the new day, not the load day', () => {
    const loadDay = '2026-11-10';
    const day = submitDay(true, loadDay, new Date('2026-11-11T12:00:00Z'));
    expect(readPostLine('post tomorrow', day, IG_BOARD).due).toBe('2026-11-12');
    expect(readPostLine('post sat', day, IG_BOARD).due).toBe('2026-11-14');
    expect(readPostLine('post next week', day, IG_BOARD).due).toBe('2026-11-16');
    expect(readPostLine('post today', day, IG_BOARD).due).toBe('2026-11-11');
  });
  it('a line with only a date has no title, so the page asks for words', () => {
    expect(readPostLine('dec 2', '2026-11-10', IG_BOARD).title).toBe('');
    expect(NEED_WORDS).toBe('Add a few words for the post.');
  });
});

describe('empty list words', () => {
  it('names a missing Instagram channel', () => {
    expect(emptyWords(true, true)).toBe('No posts yet. Add the first one.');
    expect(emptyWords(false, false)).toBe('The Instagram channel is not set up yet, so posts cannot be added.');
    expect(emptyWords(false, true)).toBe('No posts yet.');
  });
});
