// MOCK: the refreshed Tasks page's sample data (shape in lib/tasks-view.ts). Dates are relative to Tue Nov 10, 2026, the
// same day the demo uses (BTX Foundation/apps/design/ops-refresh/directions/p-tasks/index.html): normal = the demo's data,
// stress = the demo's stress task added (the longest title, 120 comments, 3 days late), empty = nothing open. All controls
// are on: mock mode changes page state only.
import type { ScheduleLine, TasksCaps, TasksComment, TasksTask, TasksView } from '@/lib/tasks-view';

const ALL_CAPS: TasksCaps = { done: true, add: true, comment: true, snooze: true, checklist: true, declineReason: true, approveInPlace: true, nudge: true, remind: true };

const PEOPLE = [
  { id: 'dm', name: 'Dana Mercer', first: 'Dana', initials: 'DM' },
  { id: 'kd', name: 'Keith Dawson', first: 'Keith', initials: 'KD' },
  { id: 'ck', name: 'Camila Keane', first: 'Camila', initials: 'CK' },
  { id: 'ds', name: 'Dorian Sutton', first: 'Dorian', initials: 'DS' },
];

const NUDGE_KD = 'Hi Keith, the interview-week post goes out tomorrow. Could you send the caption?';
const REMIND = "Hi, you haven't booked your BTX scholarship interview yet. Please pick a time by Thursday, November 12: [booking link]";

// The five lines under "Schedule" (the viewer's two interviews carry the gold tint).
const SCHEDULE: ScheduleLine[] = [
  { name: 'Ada Okafor', code: 'APP-2026-00011', whenLabel: 'Thu Nov 12, 5:30 PM', pair: 'You + Keith Dawson', yours: true },
  { name: 'Lena Mensah', code: 'APP-2026-00013', whenLabel: 'Fri Nov 13, 5:00 PM', pair: 'Camila Keane + Miles Donovan', yours: false },
  { name: 'Naomi Brooks', code: 'APP-2026-00004', whenLabel: 'Sun Nov 15, 11:00 AM', pair: 'Toby Faraday + Charlie Gaines', yours: false },
  { name: 'Sade Price', code: 'APP-2026-00015', whenLabel: 'Tue Nov 17, 5:00 PM', pair: 'Dorian Sutton + Priya Natarajan', yours: false },
  { name: 'Tariq Wells', code: 'APP-2026-00012', whenLabel: 'Wed Nov 18, 5:00 PM', pair: 'You + Camila Keane', yours: true },
];

// A plain task (no link, nothing under it); the demo's tasks override what they add.
const plain = (id: string, title: string, areaName: string, dueOn: string | null, ownerId: string): TasksTask => ({
  id,
  title,
  kind: 'task',
  areaName,
  dueOn,
  ownerId,
  mine: ownerId === 'dm',
  link: null,
  schedule: null,
  waiting: null,
  remind: null,
  checklist: null,
  checklistLine: null,
  approval: null,
  comments: [],
  extra: null,
  stored: true,
});

const c = (id: string, by: string, at: string, body: string): TasksComment => ({ id, by, at, body });

// The demo's seven tasks, in its order (the list sorts by due date, then by this order).
function baseTasks(): TasksTask[] {
  return [
    {
      ...plain('share', 'Share the interview schedule with the board', 'Scholarships', '2026-11-09', 'dm'),
      kind: 'schedule',
      schedule: SCHEDULE,
      comments: [c('c1', 'ck', 'Mon 4:40 PM', 'Can you put the interviewer pairs next to each time? Miles asked.'), c('c2', 'kd', 'Mon 6:05 PM', 'Same, plus the video links once they are in.')],
    },
    { ...plain('remind', 'Get the last 16 students booked', 'Scholarships', '2026-11-12', 'dm'), kind: 'remind', remind: { count: 16, draft: REMIND } },
    { ...plain('ig', 'Instagram post: interview week', 'Outreach', '2026-11-11', 'dm'), kind: 'post', waiting: { first: 'Keith', name: 'Keith Dawson', what: 'caption', draft: NUDGE_KD } },
    {
      ...plain('prep', "Prep for Ada Okafor's interview", 'Scholarships', '2026-11-12', 'dm'),
      kind: 'prep',
      link: { label: 'Open questions', href: '/scholarships/interviews/questions' },
      checklist: [
        { label: 'Read her application', done: true },
        { label: 'Look over the questions', done: false },
        { label: 'Save the video link', done: false },
      ],
    },
    {
      ...plain('budget', 'Approve the Q4 budget ($4,830)', 'Finance', '2026-11-13', 'dm'),
      kind: 'approval',
      checklist: [
        { label: 'Draft the Q4 lines', done: true },
        { label: 'Keith checks the numbers', done: true },
        { label: 'Approve', done: false },
        { label: 'Share with the board', done: false },
      ],
      approval: {
        heading: 'Q4 plan, October to December',
        summary: 'With Q4, 2026 spending reaches the full $8,500 budget.',
        totalCents: 483000,
        spentCents: 367000,
        yearCents: 850000,
        lines: [
          { label: 'Scholarships', cents: 250000 },
          { label: 'Certification program', cents: 150000, isNew: true },
          { label: 'Operations', cents: 34000 },
          { label: 'Sponsorships', cents: 25000 },
          { label: 'Outreach', cents: 24000 },
        ],
        hint: 'Approving sets the budget for October to December.',
        approveLabel: 'Approve $4,830 for Q4',
        afterHint: 'The Q4 budget is set for October to December. Next on the checklist: share it with the board.',
        askName: 'Keith Dawson',
        href: '/finance/budget/approval',
      },
      comments: [c('c3', 'kd', 'Mon 12:02 PM', 'Looks right to me. The certification line is the new one.')],
    },
    plain('grants', 'Shortlist 5 grants to apply for', 'Finance', '2026-11-16', 'kd'),
    { ...plain('score', 'Score 3 applicants', 'Scholarships', '2026-11-22', 'ck'), kind: 'scoring', extra: '1 started' },
  ];
}

const DONE = ['Send interview video links', 'Confirm interviewer pairs'];

/** The demo's normal day. */
export const TASKS_VIEW: TasksView = {
  today: '2026-11-10',
  dateLabel: 'Tue, Nov 10',
  me: 'dm',
  people: PEOPLE,
  areas: ['Scholarships', 'Finance', 'Programs', 'Outreach'],
  tasks: baseTasks(),
  done: DONE,
  clock: '9:14 AM',
  caps: ALL_CAPS,
};

/** The demo's stress day: its extra Team task with the longest title and 120 comments. */
export const TASKS_VIEW_STRESS: TasksView = {
  ...TASKS_VIEW,
  // The longest name the Team tab's person chip must carry on a 320px phone (wraps inside the chip, never cut off).
  people: [...PEOPLE, { id: 'xl', name: 'Maximiliana Alexandrina Featherstonehaugh-Montgomery', first: 'Maximiliana', initials: 'MF' }],
  tasks: [
    ...baseTasks(),
    {
      ...plain('s1', 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', 'Outreach', '2026-11-03', 'ds'),
      comments: Array.from({ length: 120 }, (_, i) => c(`s1-${i}`, i % 2 ? 'kd' : 'ds', 'Nov 3', 'Noted.')),
    },
  ],
};

/** A quiet day: nothing open, two things done this week. */
export const TASKS_VIEW_EMPTY: TasksView = { ...TASKS_VIEW, tasks: [] };
