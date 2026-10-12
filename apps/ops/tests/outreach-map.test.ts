import { describe, expect, it } from 'vitest';
import { staffMap } from '@/lib/area-map';
import { mapChannels, mapPlanRows, mapPosts, mapSections, postDone, postState, targetCount } from '@/lib/outreach-map';

const staff = staffMap([
  { user_id: 'u1', display_name: 'Dania Morris', initials: 'DM' },
  { user_id: 'u2', display_name: 'Tomi Falodun', initials: 'TF' },
]);
const TODAY = '2026-10-12';

describe('postDone', () => {
  it('follows status, and a caption plus photo means two steps are done before approval', () => {
    expect(postDone({ status: 'not_started' })).toBe(0);
    expect(postDone({ status: 'drafting', caption: 'x' })).toBe(1);
    expect(postDone({ status: 'drafting', caption: 'x', image_path: 'p.jpg' })).toBe(2);
    expect(postDone({ status: 'awaiting_approval' })).toBe(2);
    expect(postDone({ status: 'scheduled', caption: 'x', image_path: 'p' })).toBe(4);
    expect(postDone({ status: 'posted' })).toBe(5);
  });
});

describe('postState', () => {
  it('draws drafting as a pill and waiting as text', () => {
    expect(postState('drafting')).toEqual({ label: 'Drafting', kind: 'pill' });
    expect(postState('awaiting_approval')).toEqual({ label: 'Waiting on the board', kind: 'text' });
    expect(postState('not_started').kind).toBe('muted');
  });
});

describe('mapPosts', () => {
  const out = mapPosts(
    [
      { id: 'p1', title: 'Meet the board', post_on: '2026-10-14', owner_id: 'u1', caption: 'c', image_path: 'i', status: 'drafting' },
      { id: 'p2', title: 'Teaser', post_on: '2026-10-17', owner_id: null, status: 'not_started' },
      { id: 'p3', title: 'Sent', post_on: '2026-10-23', owner_id: 'u2', status: 'awaiting_approval' },
      { id: 'p4', title: 'Old', post_on: '2026-09-15', owner_id: 'u1', status: 'posted' },
    ],
    staff,
  );
  it('splits upcoming and posted and writes the state words', () => {
    expect(out.map((p) => [p.group, p.done, p.state])).toEqual([
      ['upcoming', 2, 'Ready to send to the board'],
      ['upcoming', 0, 'Not started'],
      ['upcoming', 2, 'Waiting on the board'],
      ['posted', 5, 'Posted'],
    ]);
  });
  it('marks sent posts, unassigned owners and dates', () => {
    expect(out[2].sent).toBe(true);
    expect(out[1].owner).toBe('unassigned');
    expect(out[0].date).toBe('Wed Oct 14');
  });
});

describe('targetCount', () => {
  it('reads the number a target starts with', () => {
    expect(targetCount('4 posts a month')).toBe(4);
    expect(targetCount('Monthly email')).toBeNull();
    expect(targetCount(null)).toBeNull();
  });
});

describe('mapChannels', () => {
  const channels = [
    { id: 'c1', name: 'Instagram', kind: 'instagram', target: '4 posts a month', status: 'active', owner_id: 'u1' },
    { id: 'c2', name: 'Newsletter', kind: 'newsletter', target: 'Monthly email', status: 'active', status_note: null, owner_id: null },
    { id: 'c3', name: 'LinkedIn', kind: 'linkedin', target: null, status: 'not_started' },
  ];
  const posts = [
    { channel_id: 'c1', post_on: '2026-10-14', status: 'drafting' },
    { channel_id: 'c1', post_on: '2026-10-02', status: 'posted' },
    { channel_id: 'c1', post_on: '2026-11-02', status: 'not_started' },
  ];
  const cards = mapChannels(channels, posts, [{ status: 'drafting', send_on: '2026-10-30' }], staff, TODAY);
  it('counts this month on the Instagram ring', () => {
    expect(cards[0].ring).toEqual({ done: 1, total: 4, line: 'October: 2 planned, 1 posted' });
    expect(cards[0].phoneBig).toBe('1/4');
    expect(cards[0].owner).toMatchObject({ name: 'Dania Morris' });
  });
  it('says when the newsletter is next due and leaves unset channels dashed', () => {
    expect(cards[1].status).toBe('Sends Fri Oct 30');
    expect(cards[2]).toMatchObject({ target: null, status: 'Not started', phoneLines: ['Target [not set]'], owner: null });
  });
});

describe('mapPlanRows', () => {
  it('lists this month only, posts and issues together, in date order', () => {
    const rows = mapPlanRows(
      [
        { id: 'p1', title: 'Late', post_on: '2026-10-23', owner_id: 'u1', status: 'not_started' },
        { id: 'p2', title: 'Next month', post_on: '2026-11-03', status: 'not_started' },
        { id: 'p3', title: 'Early', post_on: '2026-10-07', owner_id: null, status: 'awaiting_approval' },
      ],
      [{ id: 'i1', title: 'October issue', send_on: '2026-10-30', owner_id: 'u1', status: 'drafting' }],
      staff,
      TODAY,
    );
    expect(rows.map((r) => r.what)).toEqual(['Early', 'Late', 'October issue']);
    expect(rows[0]).toMatchObject({ owner: 'unassigned', state: { label: 'Waiting on the board', kind: 'text' }, phoneOwner: 'Unassigned · pick an owner' });
    expect(rows[2]).toMatchObject({ channel: 'newsletter', state: { label: 'Drafting', kind: 'pill' }, id: 'issue-i1' });
  });
});

describe('mapSections', () => {
  const rows = [
    { id: 's1', title: 'Spotlight', blurb: 'b', owner_id: 'u1', status: 'done' },
    { id: 's2', title: 'Winner', blurb: 'b', owner_id: 'u1', status: 'not_started', waits_until: '2026-10-23', waits_note: 'After the winner is announced' },
    { id: 's3', title: 'Certification', blurb: 'b', owner_id: 'u2', status: 'writing' },
    { id: 's4', title: 'Giving', blurb: 'b', owner_id: null, status: 'not_started' },
  ];
  const out = mapSections(rows, staff, TODAY);
  it('picks the first section that is open and not waiting as next', () => {
    expect(out.map((s) => s.state)).toEqual(['done', 'todo', 'next', 'todo']);
    expect(out[2]).toMatchObject({ sub: 'Next section to write', tag: 'Next · Tomi Falodun', phoneLabel: 'Next · Tomi', phoneText: true });
  });
  it('explains a waiting section and an unassigned one', () => {
    expect(out[1]).toMatchObject({ sub: 'After the winner is announced', tag: 'Waits for Fri Oct 23', phoneLabel: 'Waiting', phoneSub: 'Dania Morris · waits for Fri Oct 23' });
    expect(out[3]).toMatchObject({ owner: 'unassigned', phoneSub: 'Unassigned', sub: 'Not started' });
  });
  it('a section whose wait date has passed can be next', () => {
    expect(mapSections([{ id: 'x', title: 'T', owner_id: null, status: 'not_started', waits_until: '2026-10-01' }], staff, TODAY)[0].state).toBe('next');
  });
});
