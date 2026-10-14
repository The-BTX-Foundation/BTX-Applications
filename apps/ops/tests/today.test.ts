import { describe, expect, it } from 'vitest';
import { buildTasks, type TasksRaw } from '@/lib/tasks-shared';
import { headline, longDate, overview, taskGroups, taskRow, type TodayFacts } from '@/lib/today-build';

const ME = 'me';
const TODAY = '2026-10-12';
type T = TasksRaw['tasks'][number];
const task = (p: Partial<T> & { id: string }): T => ({ title: p.id, type: 'task', area: 'money', status: 'open', due_on: null, checklist_id: null, note: null, details: null, assignee_group: null, completed_at: null, ...p });
const build = (tasks: T[], mine: string[]) =>
  buildTasks(
    {
      tasks,
      assignees: mine.map((task_id) => ({ task_id, user_id: ME })),
      types: [],
      areas: [
        { slug: 'scholarships', name: 'Scholarships' },
        { slug: 'money', name: 'Money' },
      ],
      checklists: [],
      comments: [],
      people: [{ user_id: ME, display_name: 'Dania Morris', initials: 'DM' }],
      plans: [],
      planLines: [],
      categories: [],
    },
    ME,
    TODAY,
  ).tasks;

const facts: TodayFacts = {
  areaTasks: { scholarships: { done: 5, total: 13 }, money: { done: 2, total: 4 } },
  scholarships: { scored: 10, total: 18, interviewEnd: '2026-10-16', decision: '2026-10-23' },
  money: { onHandCents: 1_860_000, raisedCents: 980_000, goalCents: 1_500_000 },
  programs: { milestonesDone: 1, milestonesTotal: 5, program: { name: 'Certification program', status: 'setting_up' }, next: { title: 'Planning call', date: '2026-10-22' } },
  outreach: { posted: 0, planned: 3, nextPost: '2026-10-14' },
};

describe('headline and date', () => {
  it('leads with late tasks, then this week, then nothing', () => {
    expect(headline(build([task({ id: 'a', due_on: '2026-10-09' }), task({ id: 'b', due_on: '2026-10-01' })], ['a', 'b']), 'Dania')).toBe('You have 2 late tasks, Dania.');
    expect(headline(build([task({ id: 'a', due_on: '2026-10-13' })], ['a']), 'Dania')).toBe('1 task due this week, Dania.');
    expect(headline([], '')).toBe('Nothing due this week.');
  });
  it('writes the long date', () => {
    expect(longDate(TODAY)).toBe('Monday, October 12');
  });
});

describe('overview', () => {
  const mine = build([task({ id: 'a', area: 'scholarships' }), task({ id: 'b', area: 'scholarships' }), task({ id: 'c' })], ['a', 'b', 'c']);
  it('draws the four cards like the Figma sample', () => {
    const [s, m, p, o] = overview(facts, mine, TODAY, false);
    expect(s).toMatchObject({ big: '10 / 18', label: 'scored', line: 'Interviews end Fri Oct 16', forYou: '2 for you', ring: { label: '5/13', color: 'gold' } });
    expect(m).toMatchObject({ big: '$18,600', label: 'on hand', line: '$9,800 of $15,000 raised', forYou: '1 for you', ring: { label: '2/4' } });
    expect(p).toMatchObject({ big: 'Certification', label: 'in setup', line: 'Planning call Thu Oct 22', forYou: null, ring: { label: '1/5', color: 'ink' } });
    expect(o).toMatchObject({ big: '3 posts', label: 'planned in October', line: 'Next post Wed Oct 14', ring: { label: '0/3' } });
  });
  it('switches the scholarships line to the decision date once interviews end, and handles missing money', () => {
    const [s, m] = overview({ ...facts, scholarships: { ...facts.scholarships, interviewEnd: '2026-10-09' }, money: { onHandCents: null, raisedCents: 0, goalCents: null } }, [], TODAY, false);
    expect(s.line).toBe('Decision Fri Oct 23');
    expect(m).toMatchObject({ big: 'Not set', line: '$0 raised in 2026' });
  });
  it('shows a reviewer only Scholarships', () => {
    expect(overview(facts, [], TODAY, true).map((c) => c.id)).toEqual(['scholarships']);
  });
});

describe('task rows and groups', () => {
  it('gives a late task Mark done and the phone buttons', () => {
    const [t] = build([task({ id: 'late', due_on: '2026-10-10' })], ['late']);
    expect(taskRow(t, TODAY)).toMatchObject({ lead: 'circle', rel: { text: '2 days late', late: true }, action: { label: 'Mark done', kind: 'p' }, phoneDue: '2 days late', phoneLate: true });
  });
  it('points availability requests and scoring at their pages', () => {
    const [req, score] = build([task({ id: 'r', title: 'Give interview availability', type: 'request', area: 'scholarships', due_on: '2026-10-13' }), task({ id: 's', type: 'scoring', area: 'scholarships', due_on: '2026-10-19' })], ['r', 's']);
    expect(taskRow(req, TODAY)).toMatchObject({ action: { label: 'Add times' }, href: '/scholarships/interviews', rel: { text: 'Tomorrow' }, phoneDue: 'Tomorrow', phoneSub: 'Scholarships · request' });
    expect(taskRow(score, TODAY)).toMatchObject({ action: { label: 'Score' }, href: '/scholarships/scoring' });
  });
  it('puts my tasks, interviews and events in Mine, every task in Team', () => {
    const all = build([task({ id: 'mine', due_on: '2026-10-14' }), task({ id: 'theirs', due_on: '2026-10-13' }), task({ id: 'ap', type: 'approval' })], ['mine']);
    const out = taskGroups(
      all,
      [
        { slot_id: 's1', starts_at: '2026-10-13T14:00:00Z', code: 'APP-1', video: true },
        { slot_id: 'far', starts_at: '2026-11-30T14:00:00Z', code: 'APP-2', video: false },
      ],
      [{ id: 'e1', title: 'Board meeting', starts_at: '2026-10-20T22:00:00Z', all_day: false, area: 'money' }],
      TODAY,
    );
    expect(out.counts).toEqual({ mine: 1, team: 3, approvals: 1 });
    expect(out.groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['This week', ['iv-s1', 'mine']],
      ['Next week', ['ev-e1']],
    ]);
    expect(out.groups[0].rows[0]).toMatchObject({ title: 'Interview APP-1', sub: '10:00 AM · Video', rel: { text: 'Tomorrow' }, href: '/scholarships/interviews' });
    expect(out.teamGroups!.map((g) => g.label)).toEqual(['This week', 'Later']);
  });
});
