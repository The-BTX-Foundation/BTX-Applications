import { describe, expect, it } from 'vitest';
import { approvalDetail, bucketOf, buildTasks, buildToday, checklistLine, headline, longDate, overview, ringProgress, scoringTodo, sidebarCounts, todayRow, weekAgo, type AreaFacts, type Raw } from '@/lib/daily-tasks';

const ME = 'u-me';
const OTHER = 'u-other';
const base = (o: Raw): Raw => ({ type: 'task', area: 'money', status: 'open', archived: false, position: 0, ...o });

describe('bucketOf', () => {
  it('puts past dates in late, the next 6 days in this week, 7 to 13 in next week, the rest later', () => {
    expect(bucketOf('2026-10-12', '2026-10-11')).toBe('late');
    expect(bucketOf('2026-10-12', '2026-10-12')).toBe('this_week');
    expect(bucketOf('2026-10-12', '2026-10-18')).toBe('this_week');
    expect(bucketOf('2026-10-12', '2026-10-19')).toBe('next_week');
    expect(bucketOf('2026-10-12', '2026-10-25')).toBe('next_week');
    expect(bucketOf('2026-10-12', '2026-10-26')).toBe('later');
    expect(bucketOf('2026-10-12', null)).toBe('later');
  });
});

describe('dates', () => {
  it('weekAgo counts back 7 days across a month end', () => {
    expect(weekAgo('2026-10-03')).toBe('2026-09-26');
  });
  it('longDate writes the weekday and month', () => {
    expect(longDate('2026-10-04')).toBe('Sunday, October 4');
  });
});

describe('checklistLine', () => {
  it('counts done steps and names the next one', () => {
    const steps = [
      { title: 'Draft', status: 'done', position: 0 },
      { title: 'Check', status: 'done', position: 1 },
      { title: 'Approve', status: 'open', position: 2 },
      { title: 'Share', status: 'open', position: 3 },
      { title: 'Old', status: 'open', position: 4, archived: true },
    ];
    expect(checklistLine('Q4 budget', steps)).toBe('Q4 budget · 2 of 4 done, now Approve');
  });
});

describe('approvalDetail', () => {
  it('writes the plan summary, sorts bars and labels the approve button', () => {
    const d = approvalDetail({ quarter: 4, year: 2026 }, [{ label: 'Small', cents: 24_000 }, { label: 'Big', cents: 250_000 }, { label: 'Zero', cents: 0 }], 367_000, 850_000);
    expect(d.lines.map((l) => l.label)).toEqual(['Big', 'Small']);
    expect(d.totalCents).toBe(274_000);
    expect(d.approveLabel).toBe('Approve $2,740 for Q4');
    expect(d.summary).toEqual(['Q4 plan: $2,740 for October to December.', '2026 so far: $3,670 spent of $8,500.']);
  });
});

describe('buildTasks', () => {
  const input = {
    me: ME,
    today: '2026-10-12',
    tasks: [
      base({ id: 't1', title: 'Send links', area: 'scholarships', due_on: '2026-10-09', checklist_id: 'c1', position: 0 }),
      base({ id: 't2', title: 'Approve Q4 budget', type: 'approval', due_on: '2026-10-14', checklist_id: 'c2', position: 1 }),
      base({ id: 't3', title: 'Other people task', due_on: '2026-10-30' }),
      base({ id: 't4', title: 'Everyone task', assignee_group: 'all_board', due_on: '2026-10-13' }),
      base({ id: 't5', title: 'Finished', status: 'done', completed_at: '2026-10-10T15:00:00Z', checklist_id: 'c1', position: 2 }),
      base({ id: 't6', title: 'Finished long ago', status: 'done', completed_at: '2026-09-01T15:00:00Z' }),
      base({ id: 't7', title: 'Archived', archived: true, due_on: '2026-10-20' }),
    ],
    assignees: [
      { task_id: 't1', user_id: ME, assigned_at: '2026-10-01' },
      { task_id: 't2', user_id: ME, assigned_at: '2026-10-01' },
      { task_id: 't3', user_id: OTHER, assigned_at: '2026-10-01' },
    ],
    comments: [
      { id: 'k2', task_id: 't1', author_id: OTHER, body: 'second', created_at: '2026-10-03T00:00:00Z' },
      { id: 'k1', task_id: 't1', author_id: ME, body: 'first', created_at: '2026-10-02T00:00:00Z' },
    ],
    types: [{ code: 'task', label: 'Task' }, { code: 'approval', label: 'Approval' }],
    areas: [{ slug: 'scholarships', name: 'Scholarships' }, { slug: 'money', name: 'Finance' }],
    checklists: [{ id: 'c1', title: 'Fall 2026 cycle' }, { id: 'c2', title: 'Q4 budget', budget_plan_id: 'p1' }],
    people: [{ user_id: ME, display_name: 'Me Admin', initials: 'MA' }],
    plans: [{ id: 'p1', year: 2026, quarter: 4, status: 'awaiting_approval' }],
    planLines: [{ plan_id: 'p1', label: 'Scholarships', cents: 250_000 }],
  };
  const out = buildTasks(input);
  const byId = Object.fromEntries(out.tasks.map((t) => [t.id, t]));

  it('keeps only open, non-archived tasks and counts them', () => {
    expect(out.tasks.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect(out.counts).toEqual({ mine: 3, team: 4, approvals: 1, open: 4, done_week: 1 });
    expect(out.done).toEqual([{ id: 't5', title: 'Finished' }]);
  });
  it('marks mine from the assignee row or the everyone group', () => {
    expect(byId.t1.mine).toBe(true);
    expect(byId.t3.mine).toBe(false);
    expect(byId.t4.mine).toBe(true);
  });
  it('derives bucket, lateness, tomorrow, labels and comment counts', () => {
    expect(byId.t1.bucket).toBe('late');
    expect(byId.t1.late_days).toBe(3);
    expect(byId.t4.rel).toBe('Tomorrow');
    expect(byId.t1.type_label).toBe('Task');
    expect(byId.t1.area_name).toBe('Scholarships');
    expect(byId.t1.comment_count).toBe(2);
    expect(out.comments.t1.map((c) => c.body)).toEqual(['first', 'second']);
  });
  it('builds the checklist line and the approval detail from the plan', () => {
    expect(byId.t1.checklist).toBe('Fall 2026 cycle · 1 of 2 done, now Send links');
    expect(byId.t2.approval?.approveLabel).toBe('Approve $2,500 for Q4');
    expect(byId.t1.approval).toBeUndefined();
  });
});

describe('headline', () => {
  const t = (title: string, late_days: number, bucket = 'late') => ({ title, late_days, bucket }) as never;
  it('names the latest late task with the right verb', () => {
    expect(headline('Dania', [t('Send interview video links', 2), t('Pay invoice', 1)])).toBe('Interview video links are 2 days late, Dania.');
    expect(headline('Dania', [t('Send the report', 1)])).toBe('The report is 1 day late, Dania.');
  });
  it('falls back to this week, then all clear', () => {
    expect(headline('Dania', [t('x', 0, 'this_week'), t('y', 0, 'this_week')])).toBe('2 things need you this week, Dania.');
    expect(headline('Dania', [t('x', 0, 'this_week')])).toBe('1 thing needs you this week, Dania.');
    expect(headline('Dania', [])).toBe("You're all caught up, Dania.");
  });
});

describe('todayRow', () => {
  const item = (o: object) => ({ id: 'x', title: 'T', type: 'task', type_label: 'Task', area: 'money', area_name: 'Finance', status: 'open', due_on: '2026-10-09', due_label: 'Fri Oct 9', weekday: 'Fri', short_date: 'Oct 9', late_days: 0, rel: null, bucket: 'this_week', owner_id: null, context: null, mine: true, team: true, comment_count: 0, ...o }) as never;
  it('sends approvals, requests and scoring to their screens', () => {
    expect(todayRow(item({ type: 'approval', type_label: 'Approval' })).href).toBe('/finance/budget/approval');
    expect(todayRow(item({ type: 'request' })).action?.label).toBe('Add times');
    expect(todayRow(item({ type: 'scoring' })).href).toBe('/scholarships/scoring');
  });
  it('shows one Open button on a late plain task and no duplicate on the phone', () => {
    const r = todayRow(item({ late_days: 3, bucket: 'late' }));
    expect(r.rel).toEqual({ text: '3 days late', late: true });
    expect(r.action?.label).toBe('Open');
    expect(r.phoneActions).toEqual([{ label: 'Open', kind: 'p' }]);
  });
});

describe('overview and buildToday', () => {
  const facts: AreaFacts = {
    mineByArea: { scholarships: 3 },
    ring: { scholarships: { done: 5, total: 13 }, money: { done: 2, total: 4 }, programs: { done: 0, total: 0 } },
    cycle: { interviewEnd: '2026-10-09', scored: 10, applications: 18 },
    fundsCents: 1_860_000,
    raisedCents: 980_000,
    raiseTargetCents: 1_500_000,
    programName: 'certification',
    programStatus: 'setting_up',
    planningCall: 'Planning call Thu Oct 22',
    monthName: 'October',
    postsPlanned: 3,
    postsDone: 0,
    nextPost: 'Wed Oct 7',
  };
  it('draws the four cards the way the design words them', () => {
    const [s, m, p, o] = overview(facts);
    expect(s).toMatchObject({ big: '10 / 18', label: 'scored', line: 'Interviews end Fri Oct 9', forYou: '3 for you' });
    expect(s.ring).toEqual({ frac: 5 / 13, label: '5/13', color: 'gold' });
    expect(m).toMatchObject({ big: '$18,600', line: '$9,800 of $15,000 raised', forYou: null });
    expect(p).toMatchObject({ big: 'Certifications', label: 'in setup' });
    expect(p.ring.label).toBe('0/0');
    expect(o).toMatchObject({ big: '3 posts', label: 'planned in October', line: 'Next post Wed Oct 7' });
  });
  it('says what is missing instead of inventing numbers', () => {
    const [s, m, , o] = overview({ ...facts, cycle: null, fundsCents: null, raiseTargetCents: null, postsPlanned: 0, nextPost: null });
    expect(s.big).toBe('0 / 0');
    expect(m.big).toBe('Not set');
    expect(m.line).toBe('$9,800 raised');
    expect(o.line).toBe('No post scheduled');
  });
  it('assembles the page', () => {
    const d = buildToday({ today: '2026-10-04', first: 'Dania', mine: [], team: [], facts });
    expect(d.dateLine).toBe('Sunday, October 4');
    expect(d.headline).toBe("You're all caught up, Dania.");
    expect(d.areas).toHaveLength(4);
  });
});

describe('ringProgress', () => {
  it('counts the cycle by its tasks or its checklist, and money by budget checklists', () => {
    const tasks = [
      { id: 'a', status: 'done', cycle_id: 'cy' },
      { id: 'b', status: 'open', checklist_id: 'cl-cycle' },
      { id: 'c', status: 'done', checklist_id: 'cl-budget' },
      { id: 'd', status: 'declined', cycle_id: 'cy' },
      { id: 'e', status: 'open', area: 'programs' },
      { id: 'f', status: 'open', area: 'programs', archived: true },
    ];
    const lists = [{ id: 'cl-cycle', cycle_id: 'cy' }, { id: 'cl-budget', budget_plan_id: 'p' }];
    expect(ringProgress(tasks, lists, 'cy')).toEqual({ scholarships: { done: 1, total: 2 }, money: { done: 1, total: 1 }, programs: { done: 0, total: 1 } });
    expect(ringProgress(tasks, lists, null).scholarships).toEqual({ done: 0, total: 0 });
  });
});

describe('sidebar counts', () => {
  it('draws no pill for zero and caps at 99+', () => {
    expect(sidebarCounts({ mineOpen: 7, unread: 120, mineByArea: { money: 2 }, scoringTodo: 0 })).toEqual({ today: 7, chat: '99+', money: 2 });
    expect(sidebarCounts({ mineOpen: 0, unread: 0, mineByArea: {}, scoringTodo: 3 })).toEqual({ scholarships: 3, scoring: 3 });
  });
  it('scoringTodo counts booked interviews I am paired for and have not published', () => {
    const bookings = [
      { application_id: 'a1', slot_id: 's1', status: 'active' },
      { application_id: 'a2', slot_id: 's2', status: 'active' },
      { application_id: 'a3', slot_id: 's3', status: 'active' },
      { application_id: 'a4', slot_id: 's1', status: 'released' },
    ];
    const pairings = [{ slot_id: 's1', interviewer_a: ME, interviewer_b: OTHER }, { slot_id: 's2', interviewer_a: OTHER, interviewer_b: ME }, { slot_id: 's3', interviewer_a: OTHER, interviewer_b: 'z' }];
    const scores = [{ application_id: 'a2', scorer_id: ME, published: true }, { application_id: 'a1', scorer_id: ME, published: false }];
    expect(scoringTodo(ME, bookings, pairings, scores)).toBe(1);
    // Only interviews that have started count, as on the Scoring page.
    expect(scoringTodo(ME, bookings, pairings, scores, new Set())).toBe(0);
  });
});
