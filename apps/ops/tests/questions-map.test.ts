// The Interview questions page's pure mapping (lib/questions-map.ts): groups, numbering, the points bar, the empty line,
// the caps (live hides what has no real write), the next interview and the news card.
import { describe, expect, it } from 'vitest';
import { groupQuestions } from '@/lib/question-groups';
import { CLOSE_KEY, emptyLine, gkOf, liveCaps, mockCaps, newsOf, ptsWidth, qnGroups, qnNumbers, qnTotal, ticketOf, pickNext } from '@/lib/questions-map';
import { RUBRIC } from '@/mock/scores';

const rubric = RUBRIC.map((c) => ({ key: c.key, name: c.name, weight: c.weight, position: c.position }));
const qs = [
  { id: 'a', criterion_key: 'community', text: 'One' },
  { id: 'b', criterion_key: null, text: 'Close' },
  { id: 'c', criterion_key: 'passion', text: 'Two' },
  { id: 'd', criterion_key: 'community', text: 'Three' },
];

describe('qnGroups', () => {
  it('puts questions under the rubric in position order and the rest under "To close", same as groupQuestions', () => {
    const g = qnGroups([...rubric].reverse(), qs);
    const old = groupQuestions(RUBRIC, qs.map((q) => ({ id: q.id, criterionKey: q.criterion_key, text: q.text })));
    expect(g.map((x) => x.key)).toEqual(old.map((x) => x.key));
    expect(g.map((x) => x.questions)).toEqual(old.map((x) => x.questions));
    expect(g.at(-1)).toMatchObject({ key: null, name: 'To close', weight: null });
  });
  it('drops a question whose key is not in the rubric', () => {
    expect(qnTotal(qnGroups(rubric, [{ id: 'x', criterion_key: 'nope', text: 'Lost' }]))).toBe(0);
  });
  it('numbers down the whole page across groups', () => {
    const n = qnNumbers(qnGroups(rubric, qs));
    expect([...n.entries()]).toEqual([['a', 1], ['d', 2], ['c', 3], ['b', 4]]);
  });
  it('sizes the points bar against the heaviest criterion', () => {
    const g = qnGroups(rubric, []);
    expect(ptsWidth(20, g)).toBe(100);
    expect(ptsWidth(10, g)).toBe(50);
    expect(ptsWidth(5, qnGroups([], []))).toBe(0);
  });
  it('keys "To close" with a key no criterion can have (the database allows ^[a-z_]{2,40}$)', () => {
    expect(gkOf(null)).toBe(CLOSE_KEY);
    expect(/^[a-z_]{2,40}$/.test(CLOSE_KEY)).toBe(false);
    expect(gkOf('community')).toBe('community');
  });
});

describe('caps', () => {
  it('live: no undo of a removal or the starter questions, no Draft chip, ever', () => {
    const c = liveCaps(true, true);
    expect(c).toMatchObject({ edit: true, add: true, remove: true, move: true, drag: true, starter: true, editUndo: true, addUndo: true, moveUndo: true });
    expect([c.removeUndo, c.starterUndo, c.draftChip]).toEqual([false, false, false]);
  });
  it('live: nothing without admin rights or without a published cycle', () => {
    expect(Object.values(liveCaps(false, true)).some(Boolean)).toBe(false);
    expect(Object.values(liveCaps(true, false)).some(Boolean)).toBe(false);
  });
  it('mock: everything the demo draws for an admin, nothing for a board member', () => {
    expect(Object.values(mockCaps(true)).every(Boolean)).toBe(true);
    expect(Object.values(mockCaps(false)).some(Boolean)).toBe(false);
  });
});

describe('empty line', () => {
  it('says what the starter questions add, or who adds them', () => {
    expect(emptyLine(true, 12, 6)).toBe('12 starter questions, under the six scored areas and To close.');
    expect(emptyLine(false, 12, 6)).toBe('A board member with admin rights will add them.');
    expect(emptyLine(true, 12, 14)).toContain('the 14 scored');
  });
});

describe('pickNext', () => {
  const slot = (id: string, starts: string) => ({ slot_id: id, interviewer_a: 'me', interviewer_b: 'kd', interview_slots: { starts_at: starts, ends_at: starts.replace('22:30', '23:00') } });
  const apps = [{ id: 'app1', applicant_code: 'APP-1', full_name: 'Ada Okafor' }, { id: 'app2', applicant_code: 'APP-2', full_name: '  ' }];
  const staff = [{ user_id: 'kd', display_name: 'Keith Dawson' }];
  it('takes the earliest booked slot still to come', () => {
    const p = [slot('s2', '2026-11-20T22:30:00Z'), slot('s1', '2026-11-12T22:30:00Z'), slot('s0', '2026-11-01T22:30:00Z')];
    const b = [{ slot_id: 's1', application_id: 'app1' }, { slot_id: 's2', application_id: 'app2' }, { slot_id: 's0', application_id: 'app1' }];
    expect(pickNext('me', p, b, apps, staff, '2026-11-10T00:00:00Z')).toEqual({ startsAt: '2026-11-12T22:30:00Z', endsAt: '2026-11-12T23:00:00Z', code: 'APP-1', applicant: 'Ada Okafor', withName: 'Keith Dawson' });
  });
  it('skips unbooked slots, uses the code when the name is blank, and names an unknown partner plainly', () => {
    const p = [slot('s1', '2026-11-12T22:30:00Z'), { ...slot('s2', '2026-11-13T22:30:00Z'), interviewer_a: 'zz', interviewer_b: 'me' }];
    const b = [{ slot_id: 's2', application_id: 'app2' }];
    expect(pickNext('me', p, b, apps, staff, '2026-11-10T00:00:00Z')).toMatchObject({ applicant: 'APP-2', withName: 'the other interviewer' });
  });
  it('is null with nothing booked', () => {
    expect(pickNext('me', [slot('s1', '2026-11-12T22:30:00Z')], [], apps, staff, '2026-11-10T00:00:00Z')).toBeNull();
  });
});

describe('ticket and news', () => {
  const next = { startsAt: '2026-11-12T22:30:00.000Z', endsAt: '2026-11-12T23:00:00.000Z', code: 'APP-2026-00011', applicant: 'Ada Okafor', withName: 'Keith Dawson' };
  it('reads the ticket in Eastern time', () => {
    expect(ticketOf(next)).toEqual({ wd: 'Thu', day: 12, mon: 'Nov', time: '5:30 PM', minutes: 30 });
  });
  it('a late-evening interview stays on its Eastern day (never parsed as UTC)', () => {
    expect(ticketOf({ ...next, startsAt: '2026-11-13T02:30:00.000Z', endsAt: '2026-11-13T03:00:00.000Z' })).toMatchObject({ day: 12, time: '9:30 PM' });
  });
  it('shows the next interview, or "Add" for an admin with no questions', () => {
    expect(newsOf({ next, caps: mockCaps(true) }, 12)).toMatchObject({ kicker: 'Next · Thu Nov 12, 5:30 PM', title: 'Ada Okafor', go: 'See it', to: 'next' });
    expect(newsOf({ next, caps: mockCaps(true) }, 0)).toMatchObject({ kicker: 'No questions yet', go: 'Add', gold: true, to: 'start' });
    expect(newsOf({ next, caps: mockCaps(false) }, 0)).toBeNull();
    expect(newsOf({ next: null, caps: mockCaps(true) }, 3)).toBeNull();
  });
});
