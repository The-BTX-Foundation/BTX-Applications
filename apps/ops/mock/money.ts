// MOCK: everything on Money > Budget, Fundraising, Grants, the phone approval screen and Admin > People and roles. The
// Ops Hub tables are a draft and not applied, so this is the Figma frames' sample data (a Sunday in October). Money
// figures here come from the frames only; the "[date]" style rows are the frames' own placeholders. The "stress"
// exports are the stress frames' values (?demo=stress). Each loader in lib/ returns the same shapes from the draft
// tables once they exist; swap the import there and the pages do not change.
import type { BudgetCategory, BudgetStep, Comment, Fund, GiftRow, GrantRow, PersonRow, PlanState, SourceRow, SpendRow, Who, WideChecklist } from '@/lib/money-shared';

const dania: Who = { kind: 'person', user_id: 'dm', name: 'Dania Morris', initials: 'DM' };
const kelsey: Who = { kind: 'person', user_id: 'kd', name: 'Kelsey Davis', initials: 'KD' };
const cillisha: Who = { kind: 'person', user_id: 'ck', name: 'Cillisha Knights', initials: 'CK' };
const darien: Who = { kind: 'person', user_id: 'ds', name: 'Darien Strachan', initials: 'DS' };
const none: Who = { kind: 'none' };
const board: Who = { kind: 'group', name: 'Board' };

// ---------------------------------------------------------------- Budget

const CATS = (spentSponsor: number, plan: { sp: number }): BudgetCategory[] => [
  { id: 'c-sch', name: 'Scholarships', phone: 'Scholarships', short: 'Scholarships', budget_cents: 250_000, spent_cents: 0, q4_plan_cents: 250_000 },
  { id: 'c-spo', name: 'Sponsorships (NSBE convention)', phone: 'Sponsorships (NSBE convention)', short: 'Sponsorships', budget_cents: 300_000, spent_cents: spentSponsor, q4_plan_cents: plan.sp },
  { id: 'c-cer', name: 'Certification program', phone: 'Certification program', short: 'Certification program', budget_cents: 150_000, spent_cents: 0, q4_plan_cents: 150_000 },
  { id: 'c-ops', name: 'Operations (website, software, filing)', phone: 'Operations', short: 'Operations', budget_cents: 120_000, spent_cents: 86_000, q4_plan_cents: 34_000 },
  { id: 'c-out', name: 'Outreach (newsletter, Instagram)', phone: 'Outreach', short: 'Outreach', budget_cents: 30_000, spent_cents: 6_000, q4_plan_cents: 24_000 },
];

// The frames' five "Recent spending" rows are all placeholders.
const SPEND: SpendRow[] = [1, 2, 3, 4, 5].map((n) => ({ id: `sp${n}`, spent_on: null, description: '', category_id: null, category: '', amount_cents: null }));

const PLAN = (due: string, from: string): PlanState => ({
  id: 'plan-q4',
  // The same item as Today's "Approve Q4 budget" row (mock/today.ts, id t3).
  task_id: 't3',
  year: 2026,
  quarter: 4,
  status: 'awaiting_approval',
  note: 'The certification program line is new.',
  decline_note: null,
  due_on: due,
  submitter: from,
  decided_by: null,
  decided_at: null,
});

export const BUDGET_MOCK = {
  q3_spent_cents: 46_000,
  funds: { cents: 1_860_000, as_of: '2026-10-02', by: 'Dania Morris' } satisfies Fund,
  categories: CATS(275_000, { sp: 25_000 }),
  recent: SPEND,
  plan: PLAN('2026-10-06', 'Kelsey Davis'),
  steps: [
    { id: 's1', title: 'Log Q3 spending', owner: 'Dania Morris', due_on: '2026-10-02', done: true, now: 'Log Q3 spending', kind: 'step' },
    { id: 's2', title: 'Draft the Q4 plan', owner: 'Kelsey Davis', due_on: '2026-10-01', done: true, now: 'Draft the Q4 plan', kind: 'step' },
    { id: 's3', title: 'Approve Q4 budget', owner: 'Dania Morris', due_on: '2026-10-06', done: false, now: 'Approve', kind: 'approval' },
    { id: 's4', title: 'Share the Q4 budget with the board', owner: 'Kelsey Davis', due_on: '2026-10-09', done: false, now: 'Share the budget', kind: 'step' },
  ] satisfies BudgetStep[],
  comments: {
    count: 1,
    list: [{ id: 'cm1', name: 'Kelsey Davis', initials: 'KD', time: '8:02 AM', body: 'Looks right to me. The certification line is the new one.' }],
  } satisfies { count: number; list: Comment[] },
  chat: { name: 'Kelsey Davis', initials: 'KD', time: '9:20 AM', body: "I'll pull a list of grants we could apply for by the 12th." },
};

export const BUDGET_STRESS: typeof BUDGET_MOCK = {
  q3_spent_cents: 46_000,
  funds: { cents: 19_000_000, as_of: '2026-10-02', by: 'Dania Morris' },
  categories: CATS(341_000, { sp: 0 }),
  recent: SPEND,
  plan: PLAN('2026-12-31', 'Darien Strachan'),
  steps: [
    { id: 's1', title: 'Log Q3 spending', owner: 'Dania Morris', due_on: '2026-09-30', done: true, now: 'Log Q3 spending', kind: 'step' },
    { id: 's2', title: 'Draft the Q4 plan', owner: 'Darien Strachan', due_on: '2026-09-30', done: true, now: 'Draft the Q4 plan', kind: 'step' },
    { id: 's3', title: 'Approve Q4 budget', owner: 'Dania Morris', due_on: '2026-12-31', done: false, now: 'Approve', kind: 'approval' },
    { id: 's4', title: 'Share the Q4 budget with the board', owner: 'Cillisha Knights', due_on: '2026-12-31', done: false, now: 'Share the budget', kind: 'step' },
  ],
  comments: {
    count: 120,
    list: [
      { id: 'cm1', name: 'Darien Strachan', initials: 'DS', time: '8:00 AM', body: 'Looks right to me. The certification line is the new one.' },
      { id: 'cm2', name: 'Cillisha Knights', initials: 'CK', time: '9:30 PM', body: 'Approving tonight. Sponsorships is $0 for Q4 because the NSBE line is spent.' },
    ],
  },
  chat: { name: 'Cillisha Knights', initials: 'CK', time: '9:30 PM', body: "I'll pull a list of grants we could apply for by the 12th." },
};

// ---------------------------------------------------------------- Fundraising

const GIFTS: GiftRow[] = [1, 2, 3, 4, 5].map((n) => ({ id: `g${n}`, gift_on: null, donor: '', source: null, amount_cents: null }));
const SRC = (ind: number): SourceRow[] => [
  { key: 'individual', label: 'Individual donors', cents: ind },
  { key: 'corporate', label: 'Employer match and corporate', cents: 250_000 },
  { key: 'event', label: 'Events', cents: ind === 630_000 ? 100_000 : 0 },
  { key: 'grant', label: 'Grants', cents: 0 },
];
const YE = (owners: [Who, Who, Who, Who, Who], dates: [string, string, string, string, string], t4: string): WideChecklist => ({
  id: 'ye',
  title: 'Year-end giving',
  steps: [
    { id: 'y1', title: 'Set the year-end goal: $5,200', kind: 'Goal', owner: owners[0], due_on: dates[0], done: true, current: false },
    { id: 'y2', title: 'Draft the donor letter', kind: 'Next step', owner: owners[1], due_on: dates[1], done: false, current: true },
    { id: 'y3', title: 'Add a donate link to the newsletter', kind: 'Newsletter', owner: owners[2], due_on: dates[2], done: false, current: false },
    { id: 'y4', title: t4, kind: 'Outreach post', owner: owners[3], due_on: dates[3], done: false, current: false },
    { id: 'y5', title: 'Send thank-you notes', kind: 'Follow-up', owner: owners[4], due_on: dates[4], done: false, current: false },
  ],
});

export const FUNDRAISING_MOCK = {
  goal_cents: 1_500_000,
  raised_cents: 980_000,
  q3_cents: 420_000,
  donors: 27,
  avg_gift_cents: 36_000,
  new_donors: 8,
  monthly_donors: 5,
  sources: SRC(630_000),
  recent: GIFTS,
  checklist: YE([kelsey, kelsey, dania, dania, kelsey], ['2026-10-02', '2026-10-30', '2026-10-30', '2026-12-01', '2026-12-18'], 'Giving Tuesday post on Instagram'),
};

export const FUNDRAISING_STRESS: typeof FUNDRAISING_MOCK = {
  ...FUNDRAISING_MOCK,
  donors: 120,
  new_donors: 0,
  sources: SRC(730_000),
  checklist: YE([cillisha, darien, dania, dania, none], ['2026-09-30', '2026-10-30', '2026-10-30', '2026-12-31', '2026-12-18'], 'Announce the Legacy Scholarship at the NSBE event and cocktail hour'),
};

// ---------------------------------------------------------------- Grants

const GRANTS_LIST: GrantRow[] = [
  { id: 'gr1', name: 'STEM education grant', funder: null, amount_cents: 1_000_000, amount_is_up_to: true, stage: 'researching', outcome: null, deadline_on: null, date_note: null, submitted_on: null, owner: null },
  { id: 'gr2', name: 'Community fund', funder: null, amount_cents: 500_000, amount_is_up_to: false, stage: 'researching', outcome: null, deadline_on: null, date_note: 'Opens in January', submitted_on: null, owner: null },
];
const GS = (ow: [Who, Who, Who], dates: [string, string, string], t3: string, k3: string): WideChecklist => ({
  id: 'gs',
  title: 'Getting started with grants',
  steps: [
    { id: 'k1', title: 'Decide grants are worth trying', kind: 'Decision', owner: board, due_on: '2026-10-01', done: true, current: false },
    { id: 'k2', title: 'Shortlist 5 grants to apply for', kind: 'Next step', owner: ow[0], due_on: dates[0], done: false, current: true },
    { id: 'k3', title: t3, kind: k3, owner: ow[1], due_on: dates[1], done: false, current: false },
    { id: 'k4', title: 'Gather the 501(c)(3) letter and the 2026 budget', kind: 'Documents', owner: ow[2], due_on: dates[2], done: false, current: false },
  ],
});

export const GRANTS_MOCK = {
  // The frames count real grants only: the two "Researching" rows are the starter ideas.
  count: 0,
  counts: { researching: 2, writing: 0, submitted: 0, decided: 0 },
  grants: GRANTS_LIST,
  checklist: GS([kelsey, dania, dania], ['2026-10-12', '2026-10-30', '2026-10-30'], 'Write a one-page BTX summary for applications', 'Document'),
};

export const GRANTS_STRESS: typeof GRANTS_MOCK = {
  count: 1,
  counts: { researching: 120, writing: 0, submitted: 1, decided: 0 },
  grants: [
    ...GRANTS_LIST,
    { id: 'gr3', name: 'National Society of Black Engineers Professionals Scholarship Program', funder: null, amount_cents: 19_000_000, amount_is_up_to: false, stage: 'submitted', outcome: null, deadline_on: null, date_note: null, submitted_on: '2026-09-30', owner: null },
  ],
  checklist: GS([darien, cillisha, cillisha], ['2026-12-31', '2026-09-30', '2026-09-30'], 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', 'Document'),
};

// ---------------------------------------------------------------- People and roles

const P = (user_id: string, display_name: string, initials: string, title: string | null, role: PersonRow['role'], last: string | null): PersonRow => ({
  user_id,
  display_name,
  initials,
  title,
  role,
  last_sign_in_at: last,
});

export const PEOPLE_MOCK: PersonRow[] = [
  P('dm', 'Dania Morris', 'DM', 'Program lead', 'admin', '2026-10-04T10:00:00-04:00'),
  P('kd', 'Kelsey Davis', 'KD', 'President', 'board', '2026-10-04T09:00:00-04:00'),
  P('ck', 'Cillisha Knights', 'CK', 'Board member', 'board', '2026-10-02T15:00:00-04:00'),
  P('md', 'Marcus Davis', 'MD', 'Board member', 'board', '2026-10-04T08:00:00-04:00'),
  P('tf', 'Tomi Falodun', 'TF', 'Board member', 'board', '2026-10-01T12:00:00-04:00'),
  P('cg', 'Chariah Ghee', 'CG', 'Board member', 'board', '2026-10-03T12:00:00-04:00'),
  P('ds', 'Darien Strachan', 'DS', 'Board member', 'board', '2026-09-30T12:00:00-04:00'),
];

export const PEOPLE_STRESS: PersonRow[] = [
  ...PEOPLE_MOCK,
  // The stress frame's invited reviewer: a long address that must be cut short, and no sign-in yet.
  P('ao', 'adaeze.grace.okonkwo@example.org', 'AO', 'Invited', 'reviewer', null),
];
