import { describe, expect, it } from 'vitest';
import { APPROVAL_HREF, LIVE_CAPS, mapApproval, mapPerson, mapRequest, mapTask, mapTasksView } from '@/lib/tasks-map';
import { taskRowActions, detailActions } from '@/lib/tasks-time';
import { availabilityRow } from '@/lib/availability-today';
import type { TaskItem } from '@/lib/tasks-shared';

const TODAY = '2026-11-10';
const item = (o: Partial<TaskItem>): TaskItem =>
  ({
    id: 't1',
    title: 'Shortlist 5 grants',
    type: 'task',
    type_label: 'Task',
    area: 'money',
    area_name: 'Finance',
    status: 'open',
    due_on: '2026-11-16',
    bucket: 'this_week',
    owner_id: 'me',
    context: null,
    mine: true,
    team: true,
    comment_count: 0,
    due_label: '',
    weekday: '',
    short_date: '',
    late_days: 0,
    rel: null,
    ...o,
  }) as TaskItem;

const approval = {
  summary: ['Q4 plan: $4,830 for October to December.', 'With Q4, 2026 spending reaches the full $8,500 budget.'],
  lines: [{ label: 'Scholarships', cents: 250000 }],
  totalCents: 483000,
  hint: 'Approving sets the budget for October to December',
  approveLabel: 'Approve $4,830 for Q4',
};

describe('live caps', () => {
  it('turn on only the real writes', () => {
    expect(LIVE_CAPS).toEqual({ done: true, add: true, comment: true, snooze: true, checklist: false, declineReason: false, approveInPlace: false, nudge: false, remind: false });
  });
});

describe('mapTask', () => {
  it('keeps the real fields and invents nothing', () => {
    const t = mapTask(TODAY, item({ extra: '1 started', checklist: 'Prep · 1 of 3 done' }), [{ id: 'c', task_id: 't1', author_id: 'kd', body: 'Hi', created_at: '2026-11-09T21:40:00Z' }]);
    expect(t).toMatchObject({ id: 't1', kind: 'task', areaName: 'Finance', dueOn: '2026-11-16', ownerId: 'me', mine: true, stored: true, checklistLine: 'Prep · 1 of 3 done' });
    expect(t.waiting).toBeNull();
    expect(t.remind).toBeNull();
    expect(t.schedule).toBeNull();
    expect(t.checklist).toBeNull();
    expect(t.comments).toEqual([{ id: 'c', by: 'kd', at: 'Mon 4:40 PM', body: 'Hi' }]);
  });
  it('a late live approval links to the approval page and never offers Mark done (B16)', () => {
    const t = mapTask(TODAY, item({ type: 'approval', title: 'Approve the Q4 budget ($4,830)', due_on: '2026-11-02', approval }), []);
    expect(t.kind).toBe('approval');
    expect(t.link).toEqual({ label: 'Review', href: APPROVAL_HREF });
    expect(taskRowActions(t, LIVE_CAPS).check).toBe(false);
    expect(detailActions(t, LIVE_CAPS)).toMatchObject({ markDone: false, review: true, approve: false });
  });
});

describe('mapApproval', () => {
  it('builds the heading from the plan, leaves the year bar out, ends the hint with a period', () => {
    expect(mapApproval(approval)).toMatchObject({
      heading: 'Q4 plan, October to December',
      summary: 'With Q4, 2026 spending reaches the full $8,500 budget.',
      totalCents: 483000,
      spentCents: null,
      yearCents: null,
      hint: 'Approving sets the budget for October to December.',
      askName: null,
      href: APPROVAL_HREF,
    });
  });
});

describe('mapPerson', () => {
  it('names a profile, with a fallback for a blank one', () => {
    expect(mapPerson({ user_id: 'u', display_name: 'Keith Dawson', initials: 'KD' })).toEqual({ id: 'u', name: 'Keith Dawson', first: 'Keith', initials: 'KD' });
    expect(mapPerson({ user_id: 'u', display_name: ' ', initials: '' }).name).toBe('Board member');
  });
});

describe('the availability request', () => {
  const req = availabilityRow({ cycle: { id: 'c', closesAt: '2026-11-13T04:59:00Z', interviewStart: '2026-11-16', interviewEnd: '2026-11-27' }, sentAt: null, today: TODAY });
  it('is a Mine row with its link and no check or snooze', () => {
    expect(req).not.toBeNull();
    const t = mapRequest(req!, 'me');
    expect(t).toMatchObject({ kind: 'request', stored: false, mine: true, ownerId: 'me' });
    expect(t.link?.href).toBe('/scholarships/interviews/availability');
    expect(taskRowActions(t, LIVE_CAPS)).toEqual({ check: false, snooze: false, review: false });
  });
  it('joins the top of the live view', () => {
    const v = mapTasksView({ today: TODAY, me: 'me', people: [], areas: [{ slug: 'money', name: 'Finance' }], tasks: [item({})], comments: {}, done: [{ id: 'd', title: 'Old' }] }, req);
    expect(v.tasks.map((t) => t.kind)).toEqual(['request', 'task']);
    expect(v.areas).toEqual(['Finance']);
    expect(v.done).toEqual(['Old']);
    expect(v.dateLabel).toBe('Tue, Nov 10');
    expect(v.caps).toBe(LIVE_CAPS);
  });
  it('carries every owner, the stored area slug and the status into the view', () => {
    const v = mapTasksView({ today: TODAY, me: 'me', people: [], areas: [{ slug: 'money', name: 'Finance' }], tasks: [item({ status: 'in_progress' })], comments: {}, done: [] }, null, { t1: ['kd', 'me'] });
    expect(v.areaSlugs).toEqual({ Finance: 'money' });
    expect(v.tasks[0]).toMatchObject({ ownerIds: ['kd', 'me'], areaSlug: 'money', status: 'in_progress' });
    expect(mapTask(TODAY, item({}), []).ownerIds).toEqual(['me']);
  });
});
