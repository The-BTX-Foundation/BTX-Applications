import { describe, expect, it } from 'vitest';
import { build, buildChecklist, dueRel } from '@/lib/cycle-core';
import { MOCK_CYCLE, MOCK_SCHEDULE } from '@/mock/cycle';

const base = {
  title: 'Fall 2026 cycle',
  award: 'Legacy Scholarship',
  status: 'open',
  applicants: 18,
  open: '2026-08-17',
  close: '2026-09-14',
  iStart: '2026-09-15',
  iEnd: '2026-10-09',
  decision: '2026-10-23',
  schedule: { scoresDue: null, selectionMeeting: null, fundsSent: null },
  today: '2026-10-04',
};

describe('cycle phases', () => {
  it('shows "Not set" for the dates the database does not have (O3)', () => {
    const c = build(base);
    expect(c.phases.map((p) => p.dates)).toEqual(['Aug 17 - Sep 14', 'Sep 15 - Oct 9', 'Not set', 'Not set', 'Fri Oct 23', 'Not set']);
  });
  it('keeps the sample dates in mock mode, with the same states as before', () => {
    const c = build({ ...base, schedule: MOCK_SCHEDULE, applicants: MOCK_CYCLE.applicants });
    expect(c.phases.map((p) => p.state)).toEqual(['done', 'now', 'up', 'up', 'up', 'up']);
    expect(c.phases[2].dates).toBe('Sun Oct 11');
    expect(c.nowLabel).toBe('Interviews');
    expect(c.nowLine).toBe('Now: interviews, to Fri Oct 9 (5 days left)');
  });
  it('without dates, the phase after interviews is now once interviews end; one finished phase finishes those before it', () => {
    const after = build({ ...base, today: '2026-10-12' });
    expect(after.phases.map((p) => p.state)).toEqual(['done', 'done', 'now', 'up', 'up', 'up']);
    expect(after.nowLabel).toBe('Scores due');
    const late = build({ ...base, today: '2026-10-30' });
    expect(late.phases.map((p) => p.state)).toEqual(['done', 'done', 'done', 'done', 'done', 'now']);
  });
  it('a cycle with no dates at all is all "up"', () => {
    const c = build({ ...base, open: null, close: null, iStart: null, iEnd: null, decision: null });
    expect(c.phases.every((p) => p.state === 'up' && p.dates === 'Not set')).toBe(true);
    expect(c.nowLine).toBe('Not started');
  });
  it('leaves undated phases out of the phone Next line', () => {
    expect(build(base).nextLine).toBe('Next: award Fri Oct 23');
  });
  it('writes the applicant count', () => {
    expect(build({ ...base, applicants: 7 }).sub).toBe('Legacy Scholarship · open · 7 applicants');
  });
});

describe('dueRel', () => {
  it('says how late or soon an open step is', () => {
    expect(dueRel('2026-10-02', '2026-10-04', false)).toEqual({ text: '2 days late', late: true });
    expect(dueRel('2026-10-03', '2026-10-04', false)).toEqual({ text: '1 day late', late: true });
    expect(dueRel('2026-10-04', '2026-10-04', false)).toEqual({ text: 'Today' });
    expect(dueRel('2026-10-05', '2026-10-04', false)).toEqual({ text: 'Tomorrow' });
    expect(dueRel('2026-10-20', '2026-10-04', false)).toBeUndefined();
    expect(dueRel('2026-10-01', '2026-10-04', true)).toBeUndefined();
  });
});

describe('buildChecklist', () => {
  const people = new Map([['u1', { name: 'Dania Morris', initials: 'DM' }]]);
  const lists = [{ id: 'l1', title: 'Fall 2026 cycle' }];
  const tasks = [
    { id: 't1', title: 'Confirm pairs', type: 'task', status: 'done', due_on: '2026-10-01', checklist_id: 'l1', assignee_group: 'bot' },
    { id: 't2', title: 'Send video links', type: 'task', status: 'open', due_on: '2026-10-02', checklist_id: 'l1' },
    { id: 't3', title: 'Score 3', type: 'scoring', status: 'open', note: 'Interviews', checklist_id: 'l1', assignee_group: 'all_board' },
    { id: 't4', title: 'Other list task', type: 'task', status: 'open', checklist_id: 'other' },
  ];
  const cl = buildChecklist(lists, tasks, [{ task_id: 't2', user_id: 'u1' }], people, '2026-10-04');
  it('counts done and total over the cycle checklists only', () => {
    expect(cl).toMatchObject({ done: 1, total: 3 });
    expect(cl.groups).toHaveLength(1);
    expect(cl.groups[0]).toMatchObject({ label: 'Fall 2026 cycle', now: true });
  });
  it('maps state, owner, kind and lateness', () => {
    const [a, b, c] = cl.groups[0].rows;
    expect(a).toMatchObject({ state: 'done', status: 'Done', owner: { kind: 'bot', label: 'BTX' } });
    expect(b).toMatchObject({ state: 'late', owner: { kind: 'person', label: 'Dania Morris', initials: 'DM' }, rel: { text: '2 days late', late: true } });
    expect(c).toMatchObject({ state: 'open', kind: 'Scoring', sub: 'Interviews', owner: { kind: 'group', label: 'All board members' } });
  });
  it('is empty when the cycle has no checklist', () => {
    expect(buildChecklist([], [], [], people, '2026-10-04')).toEqual({ done: 0, total: 0, groups: [] });
  });
});
