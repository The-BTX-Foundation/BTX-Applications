// The Outreach Plan page's pure logic (lib/oplan-map.ts), the mock flags (lib/oplan-view-loader.ts) and the live mappers.
import { describe, expect, it } from 'vitest';
import { addedWhere, MAX_BOXES, postTarget, settleFailedAdds, liveCaps, liveChannels, liveItems, livePeople, nextUpItem, nudgeText, ownerlessItem, squares, statusOf, waitingItem } from '@/lib/oplan-map';
import { mockOplan } from '@/lib/oplan-view-loader';
import type { PnItem } from '@/lib/oplan-view';
import { PN_PEOPLE, pnMockEmpty, pnMockNormal } from '@/mock/oplan-view';

const T = '2026-11-10';
// An item with defaults.
const it0 = (o: Partial<PnItem>): PnItem => ({ id: 'x', ch: 'Instagram', title: 'X', date: null, owner: 'dm', posted: false, postedWord: 'Posted', steps: 0, sections: null, waitOn: null, slug: null, note: null, ...o });

describe('needs and news', () => {
  const items = pnMockNormal().items;
  it('finds the caption to nudge and the item with no owner', () => {
    expect(waitingItem(items, T)?.id).toBe('ig3');
    expect(ownerlessItem(items, T)?.id).toBe('ig4');
  });
  it('shows the news only when the needs card has nothing', () => {
    expect(nextUpItem(items, T, true, false)).toBeNull();
    expect(nextUpItem(items, T, false, true)).toBeNull();
    expect(nextUpItem(items, T, false, false)?.id).toBe('ig3');
    expect(nextUpItem([], T, false, false)).toBeNull();
  });
  it('skips past and posted items', () => {
    expect(waitingItem([it0({ waitOn: 'kd', date: '2026-11-09' })], T)).toBeNull();
    expect(ownerlessItem([it0({ owner: null, date: '2026-11-12', posted: true })], T)).toBeNull();
  });
});

describe('statusOf and squares', () => {
  it('reads progress', () => {
    expect(statusOf(it0({ posted: true, postedWord: 'Sent' }))).toEqual({ kind: 'posted', word: 'Sent' });
    expect(statusOf(it0({ ch: 'Newsletter', sections: { done: 1, of: 5 } }))).toEqual({ kind: 'sections', done: 1, of: 5 });
    expect(statusOf(it0({ steps: 3 }))).toEqual({ kind: 'steps', n: 3 });
    expect(statusOf(it0({}))).toEqual({ kind: 'none' });
  });
  it('draws the target as boxes, extra posts dashed', () => {
    const q = squares(pnMockNormal().items, '2026-11', 4);
    expect(q.posted).toBe(2);
    expect(q.boxes.length).toBe(Math.max(4, q.count));
    const many = Array.from({ length: 5 }, (_, i) => it0({ id: `p${i}`, date: '2026-11-0' + (i + 1), posted: i < 2 }));
    const m = squares(many, '2026-11', 4);
    expect(m.boxes.map((b) => b.over)).toEqual([false, false, false, false, true]);
    expect(squares(many, '2026-11', null).boxes.every((b) => !b.over)).toBe(true);
  });
});

describe('words', () => {
  it('writes the nudge', () => {
    const w = it0({ waitOn: 'kd', slug: 'interview-week', date: '2026-11-11' });
    expect(nudgeText(w, PN_PEOPLE, T)).toBe('Hi Keith, the interview-week post goes out tomorrow. Could you send the caption?');
  });
  it('says where an add lands', () => {
    expect(addedWhere(T, '2026-11-20')).toBe('Added to November');
    expect(addedWhere(T, '2026-12-02')).toBe('Added to December');
    expect(addedWhere(T, null)).toBe('Added to December, no date yet');
  });
});

describe('mock flags', () => {
  it('maps every demo flag', () => {
    expect(mockOplan('failed')).toEqual({ failed: true });
    const e = mockOplan('error');
    expect(!e.failed && e.loadFailed).toBe(true);
    const em = mockOplan('empty');
    expect(!em.failed && em.items.length).toBe(0);
    expect(pnMockEmpty().items).toEqual([]);
    const n = mockOplan();
    expect(!n.failed && !n.loadFailed && n.caps.nudge).toBe(true);
  });
});

describe('live mappers', () => {
  it('turns rows into people, items and channels', () => {
    expect(livePeople([{ user_id: 'u1', display_name: 'Ada Lovelace', initials: null }])).toEqual([{ id: 'u1', name: 'Ada Lovelace', initials: 'AL' }]);
    const items = liveItems(
      [{ id: 'p1', title: 'Teaser', post_on: '2026-11-20', owner_id: null, status: 'approved', caption: 'c', image_path: 'i', status_note: null }],
      [{ id: 'i1', title: 'Dec issue', send_on: '2026-12-01', owner_id: 'u1', status: 'drafting' }],
      [
        { id: 's1', issue_id: 'i1', status: 'done' },
        { id: 's2', issue_id: 'i1', status: 'todo' },
      ],
    );
    expect(items[0]).toMatchObject({ id: 'p1', ch: 'Instagram', date: '2026-11-20', owner: null, steps: 3, posted: false });
    expect(items[1]).toMatchObject({ id: 'i1', ch: 'Newsletter', sections: { done: 1, of: 2 }, postedWord: 'Sent' });
    const ch = liveChannels(
      [
        { id: 'c1', kind: 'instagram', name: 'Instagram', target: '4 posts a month', owner_id: 'u1' },
        { id: 'c2', kind: 'newsletter', name: 'Newsletter', target: null },
        { id: 'c3', kind: 'linkedin', name: 'LinkedIn', target: null, status: 'paused' },
      ],
      items,
      T,
    );
    expect(ch[0]).toMatchObject({ kind: 'instagram', target: 4, owner: 'u1' });
    expect(ch[1]).toMatchObject({ kind: 'newsletter', k: 'Target not set' });
    expect(ch[1].line).toMatch(/^Next issue .*Dec 1$/);
    expect(ch[2]).toMatchObject({ kind: 'other', line: 'Paused' });
  });
  it('turns on only the controls with a real write', () => {
    expect(liveCaps()).toMatchObject({ addPost: true, nudge: false, pickOwner: false, undo: false, nKey: false, addIssue: false });
  });
});

describe('review fixes', () => {
  it('settles a failed add the server lists: no error, its words leave the box', () => {
    const failed = [{ id: 'a', words: 'Recap dec 3' }, { id: 'b', words: 'Other' }];
    expect(settleFailedAdds(failed, new Set(['a']), 'Recap dec 3')).toEqual({ left: [{ id: 'b', words: 'Other' }], clearErr: true, box: '' });
    expect(settleFailedAdds(failed, new Set(['a']), 'New words')).toMatchObject({ clearErr: true, box: 'New words' });
    expect(settleFailedAdds(failed, new Set(), 'Recap dec 3')).toEqual({ left: failed, clearErr: false, box: 'Recap dec 3' });
  });
  it('reads a target only as posts, and caps the boxes', () => {
    expect(postTarget('4 posts a month')).toBe(4);
    expect(postTarget('4')).toBe(4);
    expect(postTarget('500 followers')).toBeNull();
    expect(postTarget(null)).toBeNull();
    expect(squares([], '2026-11', 500).boxes.length).toBe(MAX_BOXES);
    const ch = liveChannels([{ id: 'c1', kind: 'instagram', name: 'Instagram', target: '500 followers' }], [], T);
    expect(ch[0].target).toBeNull();
  });
  it('says only what the drawn window shows for the newsletter', () => {
    const ch = liveChannels([{ id: 'c2', kind: 'newsletter', name: 'Newsletter' }], [], T);
    expect(ch[0].line).toBe('No issue planned through December');
  });
});
