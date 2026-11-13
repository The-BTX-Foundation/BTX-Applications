// The Instagram page's pure logic (lib/instagram-time.ts, lib/instagram-map.ts, lib/instagram-view-loader.ts mockIg):
// the date words, the "Add a post" line reader, where a post stands, the news card, the month groups, the live mapping,
// the paged reads and the mock flags.
import { describe, expect, it } from 'vitest';
import { IG_BOARD, IG_VIEW } from '@/mock/instagram-view';
import { dayFromWord, postRel, readPostLine } from '@/lib/instagram-time';
import { groupPosts, igStaff, igTarget, liveCaps, mapIgPost, mapIgPosts, newsOf, readPaged, stateWords, stepName } from '@/lib/instagram-map';
import { mockIg } from '@/lib/instagram-view-loader';
import { shortDate } from '@/lib/refresh-time';
import type { IgPost } from '@/lib/instagram-view';

const TODAY = '2026-11-10'; // a Tuesday
const KEITH = IG_BOARD[1];
const CAMILA = IG_BOARD[2];
const P = (o: Partial<IgPost>): IgPost => ({ id: 'x', title: 'T', date: null, owner: null, steps: [false, false, false, false, false], caption: null, photo: '', sent: false, sentAt: null, approver: null, captionBy: null, slug: null, note: null, ...o });

describe('postRel', () => {
  it('names near days, then "Next", then the short date; past days read as their date', () => {
    expect(postRel(TODAY, null)).toBe('No date');
    expect(postRel(TODAY, TODAY)).toBe('Today');
    expect(postRel(TODAY, '2026-11-11')).toBe('Tomorrow');
    expect(postRel(TODAY, '2026-11-13')).toBe('Fri');
    expect(postRel(TODAY, '2026-11-21')).toBe('Next Sat');
    expect(postRel(TODAY, '2026-12-01')).toBe(shortDate('2026-12-01'));
    expect(postRel(TODAY, '2026-11-02')).toBe(shortDate('2026-11-02'));
  });
});

describe('dayFromWord', () => {
  it('reads today, tomorrow, weekdays and next week', () => {
    expect(dayFromWord('today', TODAY)).toBe(TODAY);
    expect(dayFromWord('tmrw', TODAY)).toBe('2026-11-11');
    expect(dayFromWord('fri', TODAY)).toBe('2026-11-13');
    expect(dayFromWord('Tuesday', TODAY)).toBe('2026-11-17'); // the next one, never today
    expect(dayFromWord('next week', TODAY)).toBe('2026-11-16');
  });
  it('reads a month and day, rolling a passed day to next year, and refuses a day that does not exist', () => {
    expect(dayFromWord('dec 2', TODAY)).toBe('2026-12-02');
    expect(dayFromWord('January 5', TODAY)).toBe('2027-01-05');
    expect(dayFromWord('nov 3', TODAY)).toBe('2027-11-03');
    expect(dayFromWord('feb 31', TODAY)).toBeNull();
    expect(dayFromWord('someday', TODAY)).toBeNull();
  });
});

describe('readPostLine', () => {
  it('takes the day and the owner out of the words', () => {
    expect(readPostLine('thank our donors dec 2 camila', TODAY, IG_BOARD)).toEqual({ title: 'Thank our donors', due: '2026-12-02', owner: CAMILA });
  });
  it('lets a month and day win over a weekday inside a name', () => {
    expect(readPostLine('Giving Tuesday dec 1', TODAY, IG_BOARD)).toMatchObject({ title: 'Giving Tuesday', due: '2026-12-01' });
  });
  it('keeps a name inside a short title, and stops reading a part the person tapped away', () => {
    expect(readPostLine('Meet Keith', TODAY, IG_BOARD)).toEqual({ title: 'Meet Keith', due: null, owner: KEITH });
    expect(readPostLine('post tomorrow', TODAY, IG_BOARD, { date: true })).toEqual({ title: 'Post tomorrow', due: null, owner: null });
  });
});

describe('stateWords and step names', () => {
  it('says who a post waits on, or the next step', () => {
    const [posted, , interview, teaser, winner] = IG_VIEW.posts;
    expect(stateWords(posted)).toBeNull();
    expect(stateWords(interview)).toEqual({ wait: true, pre: 'Waiting on ', name: "Keith's", post: ' caption' });
    expect(stateWords(teaser)).toEqual({ wait: false, pre: 'Not started' });
    expect(stateWords(winner)).toEqual({ wait: false, pre: 'Starts once the winner is announced' });
    expect(stateWords(P({ steps: [true, false, false, false, false] }))).toEqual({ wait: false, pre: 'Next: pick the photo' });
    expect(stateWords(P({ steps: [true, true, false, false, false], sent: true }))).toEqual({ wait: true, pre: 'Waiting for approval' });
    expect(stateWords(P({ steps: [true, true, false, false, false], sent: true, approver: KEITH }))).toEqual({ wait: true, pre: 'Waiting on ', name: 'Keith' });
  });
  it('names the approver on step 3 only when one is known', () => {
    expect(stepName(P({}), 2)).toBe('Board approval');
    expect(stepName(P({ approver: KEITH }), 2)).toBe('Board approval: Keith Dawson');
  });
});

describe('newsOf', () => {
  it('is about the next post not posted yet', () => {
    expect(newsOf(IG_VIEW.posts, TODAY, IG_VIEW.me)).toEqual({ id: 'ig3', title: 'Interview week', kicker: 'Waiting on Keith · Tomorrow', go: 'Open', gold: false });
    expect(newsOf(IG_VIEW.posts, TODAY, IG_VIEW.me, () => true)?.kicker).toBe('Nudged Keith · Tomorrow');
  });
  it('is gold when it is my move or nobody owns it, and offers Schedule once approved', () => {
    const mine = P({ id: 'a', date: '2026-11-12', owner: IG_BOARD[0], steps: [true, true, true, false, false] });
    expect(newsOf([mine], TODAY, IG_BOARD[0].id)).toMatchObject({ kicker: 'Approved, schedule it · Thu', go: 'Schedule', gold: true });
    expect(newsOf([mine], TODAY, KEITH.id)?.gold).toBe(false);
    expect(newsOf([P({ date: '2026-11-12' })], TODAY, null)).toMatchObject({ kicker: 'Next · draft the caption · Thu', gold: true });
  });
  it('is empty with no post ahead', () => {
    expect(newsOf([], TODAY, null)).toBeNull();
    expect(newsOf([P({ date: '2026-11-01' })], TODAY, null)).toBeNull();
  });
});

describe('groupPosts', () => {
  it('groups by month, draws this month against the target, names other years, and puts undated last', () => {
    const g = groupPosts([...IG_VIEW.posts, P({ id: 'n', date: '2027-01-05' }), P({ id: 'u' })], TODAY, 4);
    expect(g.map((x) => x.label)).toEqual(['November', 'December', 'January 2027', 'No date yet']);
    expect(g[0]).toMatchObject({ current: true, posted: 2, boxes: 4 });
    expect(g[0].posts.map((p) => p.id)).toEqual(['ig1', 'ig2', 'ig3', 'ig4']);
    expect(g[1].current).toBe(false);
    expect(g[3]).toMatchObject({ undated: true, boxes: 0 });
  });
  it('draws a box per post when there are more posts than the target', () => {
    expect(groupPosts(IG_VIEW.posts, TODAY, 2)[0].boxes).toBe(4);
    expect(groupPosts(IG_VIEW.posts, TODAY, null)[0].boxes).toBe(4);
  });
});

describe('live mapping', () => {
  const staff = igStaff([
    { user_id: 'u2', display_name: 'Zoe Adams', initials: 'ZA' },
    { user_id: 'u1', display_name: 'Ann Lee', initials: 'AL' },
    { user_id: 'u3', display_name: '', initials: '' },
  ]);
  it('keeps named board members, by name', () => {
    expect(staff.map((p) => p.id)).toEqual(['u1', 'u2']);
  });
  it('maps a row: steps from status and what it holds, owner, photo words, sent', () => {
    const byId = new Map(staff.map((p) => [p.id, p]));
    const drafting = mapIgPost({ id: 'a', title: 'X', post_on: '2026-11-20', owner_id: 'u1', caption: 'c', image_path: 'p.jpg', status: 'drafting' }, byId);
    expect(drafting).toMatchObject({ date: '2026-11-20', owner: { id: 'u1' }, caption: 'c', photo: 'Photo added', sent: false, approver: null, captionBy: null });
    expect(drafting.steps).toEqual([true, true, false, false, false]);
    const waiting = mapIgPost({ id: 'b', title: 'Y', post_on: null, owner_id: 'gone', status: 'awaiting_approval', status_note: 'Note' }, byId);
    expect(waiting).toMatchObject({ date: null, owner: null, photo: 'No photo yet', sent: true, note: 'Note' });
    expect(mapIgPost({ id: 'c', status: 'posted' }, byId).steps).toEqual([true, true, true, true, true]);
  });
  it('never draws a row twice, and sorts by date', () => {
    const rows = [{ id: 'b', post_on: '2026-11-20' }, { id: 'a', post_on: '2026-11-05' }, { id: 'b', post_on: '2026-11-20' }];
    expect(mapIgPosts(rows, staff).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('reads the target, and draws only the backed controls', () => {
    expect(igTarget('4 posts a month')).toBe(4);
    expect(igTarget(null)).toBeNull();
    expect(liveCaps(true)).toEqual({ add: true, send: true, tick: false, caption: false, owner: false, nudge: false, undo: false, next: false });
    expect(liveCaps(false).add).toBe(false);
  });
});

describe('readPaged', () => {
  it('reads page after page until an empty one', async () => {
    const pages = [[1, 2], [3], []];
    const asked: [number, number][] = [];
    const rows = await readPaged(async (from, to) => (asked.push([from, to]), pages.shift() ?? []), 2);
    expect(rows).toEqual([1, 2, 3]);
    expect(asked).toEqual([[0, 1], [2, 3], [3, 4]]);
  });
  it('refuses a partial list past the ceiling', async () => {
    await expect(readPaged(async () => [1], 1, 3)).rejects.toThrow(/partial/);
  });
});

describe('mockIg', () => {
  it('maps every demo flag', () => {
    expect(mockIg('failed')).toEqual({ failed: true });
    const normal = mockIg();
    expect(normal).toMatchObject({ failed: false, loadFailed: false, mockWrite: null });
    if (normal.failed) throw new Error('unexpected');
    expect(normal.posts).toHaveLength(5);
    const empty = mockIg('empty');
    expect(!empty.failed && empty.posts).toEqual([]);
    expect(mockIg('error')).toMatchObject({ loadFailed: true });
    expect(mockIg('failadd')).toMatchObject({ mockWrite: 'failadd' });
    expect(mockIg('failsend')).toMatchObject({ mockWrite: 'failsend' });
    const stress = mockIg('stress');
    expect(!stress.failed && stress.posts[2].title).toMatch(/NSBE/);
  });
});
