import { describe, expect, it } from 'vitest';
import { approvalDetail, bucketFor, buildTasks, type TasksRaw } from '@/lib/tasks-shared';

const ME = 'u-me';
const OTHER = 'u-other';
const TODAY = '2026-10-12'; // a Monday; the week is Sun Oct 11 .. Sat Oct 17

type T = TasksRaw['tasks'][number];
const task = (p: Partial<T> & { id: string }): T => ({
  title: p.id,
  type: 'task',
  area: 'money',
  status: 'open',
  due_on: null,
  checklist_id: null,
  note: null,
  details: null,
  assignee_group: null,
  completed_at: null,
  ...p,
});

const raw = (over: Partial<TasksRaw> = {}): TasksRaw => ({
  tasks: [],
  assignees: [],
  types: [
    { code: 'task', label: 'Task' },
    { code: 'approval', label: 'Approval' },
  ],
  areas: [
    { slug: 'scholarships', name: 'Scholarships' },
    { slug: 'money', name: 'Money' },
  ],
  checklists: [],
  comments: [],
  people: [
    { user_id: ME, display_name: 'Me Person', initials: 'MP' },
    { user_id: OTHER, display_name: 'Other Person', initials: 'OP' },
  ],
  plans: [],
  planLines: [],
  categories: [],
  ...over,
});

describe('bucketFor', () => {
  it('puts past dates in Late and no date in Later', () => {
    expect(bucketFor(TODAY, '2026-10-11')).toBe('late');
    expect(bucketFor(TODAY, null)).toBe('later');
  });
  it('uses Sunday-to-Saturday weeks', () => {
    expect(bucketFor(TODAY, TODAY)).toBe('this_week');
    expect(bucketFor(TODAY, '2026-10-17')).toBe('this_week');
    expect(bucketFor(TODAY, '2026-10-18')).toBe('next_week');
    expect(bucketFor(TODAY, '2026-10-24')).toBe('next_week');
    expect(bucketFor(TODAY, '2026-10-25')).toBe('later');
  });
  it('treats a Saturday today as the end of its week', () => {
    expect(bucketFor('2026-10-17', '2026-10-18')).toBe('next_week');
  });
});

describe('buildTasks', () => {
  const data = buildTasks(
    raw({
      tasks: [
        task({ id: 'late', due_on: '2026-10-09', area: 'scholarships' }),
        task({ id: 'mine-week', due_on: '2026-10-14', checklist_id: 'c1' }),
        task({ id: 'other-next', due_on: '2026-10-20' }),
        task({ id: 'group', assignee_group: 'board' }),
        task({ id: 'done-now', status: 'done', completed_at: '2026-10-12T14:00:00Z', checklist_id: 'c1' }),
        task({ id: 'done-last-week', status: 'done', completed_at: '2026-10-09T14:00:00Z' }),
        task({ id: 'declined', status: 'declined' }),
      ],
      assignees: [
        { task_id: 'late', user_id: ME },
        { task_id: 'mine-week', user_id: OTHER },
        { task_id: 'mine-week', user_id: ME },
        { task_id: 'other-next', user_id: OTHER },
      ],
      checklists: [{ id: 'c1', title: 'Q4 budget', budget_plan_id: null }],
      comments: [
        { id: 'k2', task_id: 'late', author_id: OTHER, body: 'second', created_at: '2026-10-11T10:00:00Z' },
        { id: 'k1', task_id: 'late', author_id: ME, body: 'first', created_at: '2026-10-10T10:00:00Z' },
      ],
    }),
    ME,
    TODAY,
  );

  it('keeps open tasks only, ordered by due date with undated last', () => {
    expect(data.tasks.map((t) => t.id)).toEqual(['late', 'mine-week', 'other-next', 'group']);
  });
  it('derives buckets, labels and late days', () => {
    const late = data.tasks[0];
    expect(late.bucket).toBe('late');
    expect(late.late_days).toBe(3);
    expect(late.area_name).toBe('Scholarships');
    expect(late.type_label).toBe('Task');
    expect(data.tasks[1].bucket).toBe('this_week');
    expect(data.tasks[2].bucket).toBe('next_week');
    expect(data.tasks[3].bucket).toBe('later');
  });
  it('marks mine from task_assignees and prefers me as the shown owner', () => {
    expect(data.tasks.map((t) => t.mine)).toEqual([true, true, false, false]);
    expect(data.tasks[1].owner_id).toBe(ME);
    expect(data.tasks[2].owner_id).toBe(OTHER);
    expect(data.tasks[3].owner_id).toBeNull();
  });
  it('uses the checklist title as context and counts its steps', () => {
    expect(data.tasks[1].context).toBe('Q4 budget');
    expect(data.tasks[1].checklist).toBe('Q4 budget · 1 of 2 done');
  });
  it('sorts comments oldest first and counts them', () => {
    expect(data.comments.late.map((c) => c.id)).toEqual(['k1', 'k2']);
    expect(data.tasks[0].comment_count).toBe(2);
  });
  it('counts mine, team, approvals, open and done this week', () => {
    expect(data.counts).toEqual({ mine: 2, team: 4, approvals: 0, open: 4, done_week: 1 });
    expect(data.done).toEqual([{ id: 'done-now', title: 'done-now' }]);
  });
});

describe('approvals', () => {
  it('builds the quarter plan panel from its lines (cents)', () => {
    const data = buildTasks(
      raw({
        tasks: [task({ id: 'ap', type: 'approval', checklist_id: 'c2', due_on: '2026-10-14' })],
        assignees: [{ task_id: 'ap', user_id: ME }],
        checklists: [{ id: 'c2', title: 'Q4 budget', budget_plan_id: 'p4' }],
        plans: [{ id: 'p4', year: 2026, quarter: 4 }],
        planLines: [
          { plan_id: 'p4', category_id: 'cat-a', amount_cents: 34_000 },
          { plan_id: 'p4', category_id: 'cat-b', amount_cents: 250_000 },
          { plan_id: 'other', category_id: 'cat-a', amount_cents: 1 },
        ],
        categories: [
          { id: 'cat-a', name: 'Operations', year: 2026, budget_cents: 100_000, spent_cents: 20_000 },
          { id: 'cat-b', name: 'Scholarships', year: 2026, budget_cents: 750_000, spent_cents: 347_000 },
        ],
      }),
      ME,
      TODAY,
    );
    const a = data.tasks[0].approval!;
    expect(a.planId).toBe('p4');
    expect(a.totalCents).toBe(284_000);
    expect(a.lines.map((l) => l.label)).toEqual(['Scholarships', 'Operations']);
    expect(a.approveLabel).toBe('Approve $2,840 for Q4');
    expect(a.summary).toEqual(['Q4 plan: $2,840 for October to December.', '2026 so far: $3,670 spent of $8,500.']);
    expect(a.hint).toBe('Approving sets the budget for October to December');
    expect(data.counts.approvals).toBe(1);
  });
  it('uses tasks.details as the summary when there is no plan', () => {
    const a = approvalDetail('Line one.\nLine two.', undefined, []);
    expect(a.summary).toEqual(['Line one.', 'Line two.']);
    expect(a.approveLabel).toBe('Approve');
    expect(a.planId).toBeUndefined();
  });
});

describe('reviewer view', () => {
  it('works with only their own assigned task and no comments or checklists', () => {
    const data = buildTasks(raw({ tasks: [task({ id: 'r1', checklist_id: 'hidden', due_on: '2026-10-13' })], assignees: [{ task_id: 'r1', user_id: ME }] }), ME, TODAY);
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].context).toBeNull();
    expect(data.tasks[0].checklist).toBeUndefined();
    expect(data.counts.mine).toBe(1);
  });
});
