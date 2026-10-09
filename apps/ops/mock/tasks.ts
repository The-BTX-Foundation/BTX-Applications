// MOCK: everything on the Tasks page (Figma "Tasks" frames). The Ops Hub tables do not exist yet. Same titles, dates and
// owners as Today (mock/today.ts); today is Sunday, October 4, 2026. The stress sample (?demo=stress) is the stress
// frames' long names and 99+ counts: its phone frame lists a different "Mine" sample than the laptop's Team table, so
// those rows are flagged mine-only / team-only instead of being derived from the owner.
import type { ApprovalDetail, Counts, Person, TaskComment, TaskSeed } from '@/lib/tasks-shared';

export const PEOPLE: Person[] = [
  { user_id: 'dm', display_name: 'Dania Morris', initials: 'DM' },
  { user_id: 'kd', display_name: 'Kelsey Davis', initials: 'KD' },
  { user_id: 'ck', display_name: 'Cillisha Knights', initials: 'CK' },
  { user_id: 'ds', display_name: 'Darien Strachan', initials: 'DS', table_name: 'Darien S.' },
];

const Q4: ApprovalDetail = {
  summary: ['Q4 plan: $4,830 for October to December.', '2026 so far: $3,670 spent of $8,500.'],
  lines: [
    { label: 'Scholarships', cents: 250_000 },
    { label: 'Certification program', cents: 150_000 },
    { label: 'Operations', cents: 34_000 },
    { label: 'Sponsorships', cents: 25_000 },
    { label: 'Outreach', cents: 24_000 },
  ],
  totalCents: 483_000,
  hint: 'Approving sets the budget for October to December',
  approveLabel: 'Approve $4,830 for Q4',
};

const SCH = { area: 'scholarships', area_name: 'Scholarships' } as const;
const MON = { area: 'money', area_name: 'Money' } as const;
const OUT = { area: 'outreach', area_name: 'Outreach' } as const;
const TASK = { type: 'task', type_label: 'Task' } as const;
const OPEN = { status: 'open' } as const;

export const SEEDS: TaskSeed[] = [
  { id: 't1', title: 'Send interview video links', ...TASK, ...SCH, ...OPEN, due_on: '2026-10-02', bucket: 'late', owner_id: 'dm', context: 'Fall 2026 cycle', mine: true, team: true, comment_count: 2, action: 'Add links' },
  {
    id: 't2',
    title: 'Give interview availability, Oct 5-9',
    phone_title: 'Give interview availability',
    type: 'request',
    type_label: 'Request',
    ...SCH,
    ...OPEN,
    due_on: '2026-10-05',
    due_note: 'Oct 5-9',
    bucket: 'this_week',
    owner_id: 'dm',
    context: 'Fall 2026 cycle',
    mine: true,
    team: true,
    comment_count: 0,
  },
  {
    id: 't3',
    title: 'Approve Q4 budget',
    type: 'approval',
    type_label: 'Approval',
    ...MON,
    ...OPEN,
    due_on: '2026-10-06',
    bucket: 'this_week',
    owner_id: 'dm',
    context: 'Q4 budget',
    checklist: 'Q4 budget · 2 of 4 done, now Approve',
    mine: true,
    team: true,
    comment_count: 1,
    approval: Q4,
  },
  { id: 't4', title: 'Instagram post: Meet the board', type: 'post', type_label: 'Post', ...OUT, ...OPEN, due_on: '2026-10-07', bucket: 'this_week', owner_id: 'dm', context: 'Instagram', mine: true, team: true, comment_count: 0 },
  { id: 't5', title: 'Send Q3 donor thank-yous', ...TASK, ...MON, ...OPEN, due_on: '2026-10-09', bucket: 'this_week', owner_id: 'dm', context: 'Fundraising', mine: true, team: true, comment_count: 0 },
  { id: 't6', title: 'Score 3 applicants', type: 'scoring', type_label: 'Scoring', ...SCH, ...OPEN, due_on: '2026-10-11', bucket: 'next_week', owner_id: 'dm', context: 'Fall 2026 cycle', extra: '1 started', mine: true, team: true, comment_count: 0 },
  { id: 't7', title: 'Shortlist 5 grants to apply for', ...TASK, ...MON, ...OPEN, due_on: '2026-10-12', bucket: 'next_week', owner_id: 'kd', context: 'Grants', mine: false, team: true, comment_count: 0 },
];

export const COUNTS: Counts = { mine: 6, team: 7, approvals: 1, open: 7, done_week: 2 };

export const DONE = [
  { id: 'd1', title: 'Confirm interviewer pairs' },
  { id: 'd2', title: 'Share the interview schedule' },
];

export const COMMENTS: Record<string, TaskComment[]> = {
  t3: [{ id: 'c1', task_id: 't3', author_id: 'kd', body: 'Looks right to me. The certification line is the new one.', created_at: '2026-10-04T12:02:00Z' }],
};

// Stress: Team (laptop) rows, then the Mine (phone) rows.
export const STRESS_SEEDS: TaskSeed[] = [
  { id: 's1', title: 'Send interview video links', ...TASK, ...SCH, ...OPEN, due_on: '2026-09-22', bucket: 'late', owner_id: 'ck', context: 'Fall 2026 cycle', mine: false, team: true, comment_count: 120 },
  { id: 's2', title: 'Share the interview schedule', ...TASK, ...SCH, ...OPEN, due_on: '2026-09-30', bucket: 'late', owner_id: 'ds', context: 'Fall 2026 cycle', mine: false, team: true, comment_count: 120 },
  { id: 's3', title: 'Give interview availability, Oct 5-9', type: 'request', type_label: 'Request', ...SCH, ...OPEN, due_on: '2026-10-05', bucket: 'this_week', owner_id: null, context: 'Fall 2026 cycle', mine: false, team: true, comment_count: 0 },
  {
    id: 's4',
    title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour',
    type: 'approval',
    type_label: 'Approval',
    ...MON,
    ...OPEN,
    due_on: '2026-10-06',
    bucket: 'this_week',
    owner_id: 'ds',
    context: 'Q4 budget',
    checklist: 'Q4 budget · 2 of 4 done, now Approve',
    mine: false,
    team: true,
    comment_count: 120,
    approval: Q4,
  },
  { id: 's5', title: 'Instagram post: Meet the board', type: 'post', type_label: 'Post', ...OUT, ...OPEN, due_on: '2026-10-07', bucket: 'this_week', owner_id: 'ck', context: 'Instagram', mine: false, team: true, comment_count: 0 },
  { id: 's6', title: 'Send Q3 donor thank-yous', ...TASK, ...MON, ...OPEN, due_on: '2026-10-09', bucket: 'this_week', owner_id: null, context: 'Fundraising', mine: false, team: true, comment_count: 0 },
  { id: 's7', title: 'Score 3 applicants', type: 'scoring', type_label: 'Scoring', ...SCH, ...OPEN, due_on: '2026-10-11', bucket: 'next_week', owner_id: 'dm', context: 'Fall 2026 cycle', extra: '1 started', mine: false, team: true, comment_count: 0 },
  { id: 's8', title: 'Shortlist 5 grants to apply for', ...TASK, ...MON, ...OPEN, due_on: '2026-12-31', bucket: 'next_week', owner_id: 'ds', context: 'Grants', mine: false, team: true, comment_count: 0 },
  // the phone's Mine list
  { id: 'm1', title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', ...TASK, ...SCH, ...OPEN, due_on: '2026-09-22', bucket: 'late', owner_id: 'dm', context: 'Fall 2026 cycle', mine: true, team: false, comment_count: 0, action: 'Mark done' },
  { id: 'm2', title: 'Give interview availability, Oct 5-9', phone_title: 'Give interview availability', type: 'request', type_label: 'Request', ...SCH, ...OPEN, due_on: '2026-10-05', due_note: 'Oct 5-9', bucket: 'this_week', owner_id: 'dm', context: 'Fall 2026 cycle', mine: true, team: false, comment_count: 0 },
  { id: 'm3', title: 'Approve Q4 budget', type: 'approval', type_label: 'Approval', ...MON, ...OPEN, due_on: '2026-10-06', bucket: 'this_week', owner_id: 'dm', context: 'Q4 budget', checklist: 'Q4 budget · 2 of 4 done, now Approve', mine: true, team: false, comment_count: 1, approval: Q4 },
  { id: 'm4', title: 'Instagram post: Meet the board', type: 'post', type_label: 'Post', ...OUT, ...OPEN, due_on: '2026-10-07', bucket: 'this_week', owner_id: null, context: 'Instagram', mine: true, team: false, comment_count: 0 },
  { id: 'm5', title: 'Send Q3 donor thank-yous', ...TASK, ...MON, ...OPEN, due_on: '2026-10-09', bucket: 'this_week', owner_id: 'dm', context: 'Fundraising', mine: true, team: false, comment_count: 0 },
  { id: 'm6', title: 'Score 3 applicants', type: 'scoring', type_label: 'Scoring', ...SCH, ...OPEN, due_on: '2026-12-31', bucket: 'next_week', owner_id: 'dm', context: 'Fall 2026 cycle', extra: '1 started', mine: true, team: false, comment_count: 0 },
];

export const STRESS_COUNTS: Counts = { mine: 6, team: 120, approvals: 1, open: 120, done_week: 0 };

export const STRESS_COMMENTS: Record<string, TaskComment[]> = {
  s4: [{ id: 'c1', task_id: 's4', author_id: 'ds', body: 'Looks right to me. The certification line is the new one.', created_at: '2026-10-04T12:00:00Z' }],
};
