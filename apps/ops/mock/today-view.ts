// MOCK: the refreshed Today page's sample data (shape in lib/today-view.ts). Dates are relative to Tue Nov 10, 2026, the
// same day the demo uses (BTX Foundation/apps/design/ops-refresh/directions/p-today-states/index.html): normal = the demo's
// SPEC data, stress = longest names, a 70-character title, 12 tasks (3 late) and 99+ chat, empty = nothing needs the viewer.
// Interview times are Eastern (EST is UTC-5 in November). All controls are on: mock mode changes page state only.
import type { AreaRow, BookingNeeds, InterviewTicket, ScheduleLine, TodayTask, TodayView } from '@/lib/today-view';

const ALL_CAPS = { done: true, add: true, snooze: true, remind: true, nudge: true, reply: true, approveInPlace: true };
const QUESTIONS = '/scholarships/interviews/questions';

/** The 16 students who have not booked (the demo's names, one of them the longest real-shaped name). */
const UNBOOKED = [
  'Jalen Thomas', 'Renee Simmons', 'Daniel Asante', 'Maya King',
  'Elijah Carter', 'Folake Nwosu', 'Brianna Reid', 'Gabriel Hayes',
  'Whitney Kamara', 'Isaac Boateng', 'Sofia Ramirez', 'Marcus Bell',
  'Adaeze-Grace Nwachukwu-Bello', 'Kofi Owusu', 'Hannah Lee', 'Jordan Pierce',
].map((name, i) => ({ id: `stu-${i + 1}`, name }));

const NEEDS: BookingNeeds = {
  title: 'Interview booking',
  dueOn: '2026-11-12',
  booked: 5,
  total: 21,
  unbooked: UNBOOKED,
  remindedAt: null,
  suggestion: 'Remind again Thu if still unbooked',
};

const NUDGE = 'Hi Keith, the interview-week post goes out tomorrow. Could you send the caption?';

// The five lines under "Schedule" (the viewer's two interviews carry the gold edge).
function schedule(appl: string): ScheduleLine[] {
  return [
    { name: appl, code: 'APP-2026-00011', whenLabel: 'Thu Nov 12, 5:30 PM', pair: 'You + Keith Dawson', yours: true },
    { name: 'Lena Mensah', code: 'APP-2026-00013', whenLabel: 'Fri Nov 13, 5:00 PM', pair: 'Camila Keane + Miles Donovan', yours: false },
    { name: 'Naomi Brooks', code: 'APP-2026-00004', whenLabel: 'Sun Nov 15, 11:00 AM', pair: 'Toby Faraday + Charlie Gaines', yours: false },
    { name: 'Sade Price', code: 'APP-2026-00015', whenLabel: 'Tue Nov 17, 5:00 PM', pair: 'Dorian Sutton + Priya Natarajan', yours: false },
    { name: 'Tariq Wells', code: 'APP-2026-00012', whenLabel: 'Wed Nov 18, 5:00 PM', pair: 'You + Camila Keane', yours: true },
  ];
}

// A plain task row (no link, no waiting, no schedule).
const plain = (id: string, title: string, areaName: string, dueOn: string): TodayTask => ({
  id, title, areaName, dueOn, kind: 'task', link: null, videoLinks: false, waiting: null, schedule: null, commentCount: 0,
});

// The demo's four tasks of the normal day, for an applicant name (the stress day uses the longest one).
function baseTasks(appl: string): TodayTask[] {
  return [
    { ...plain('share', 'Share the interview schedule with the board', 'Scholarships', '2026-11-09'), kind: 'schedule', schedule: schedule(appl) },
    { ...plain('prep', `Prep for ${appl}'s interview`, 'Scholarships', '2026-11-12'), kind: 'prep', link: { label: 'Open questions', href: QUESTIONS } },
    { ...plain('budget', 'Approve the Q4 budget ($4,830)', 'Finance', '2026-11-13'), kind: 'approval', link: { label: 'Review', href: '/finance/budget/approval' }, commentCount: 1 },
    { ...plain('ig', 'Instagram post: interview week', 'Outreach', '2026-11-11'), kind: 'post', waiting: { on: 'Keith', what: 'caption', userId: 'u-keith', draft: NUDGE } },
  ];
}

// The viewer's two interviews.
function tickets(appl: string): InterviewTicket[] {
  return [
    { id: 't6', applicantName: appl, code: 'APP-2026-00011', startsAt: '2026-11-12T22:30:00Z', minutes: 30, mode: 'Video', withName: 'Keith Dawson', prep: { done: false, dueOn: '2026-11-12', href: QUESTIONS, taskId: 'prep' } },
    { id: 't21', applicantName: 'Tariq Wells', code: 'APP-2026-00012', startsAt: '2026-11-18T22:00:00Z', minutes: 30, mode: 'Video', withName: 'Camila Keane', prep: { done: false, dueOn: null, href: QUESTIONS, taskId: null } },
  ];
}

// The four area rows; the Finance peek changes once the Q4 plan is approved.
function areas(q4Approved: boolean): AreaRow[] {
  return [
    { id: 'scholarships', name: 'Scholarships', icon: 'scholarships', href: '/scholarships/cycle', mark: { kind: 'bar', done: 0, total: 21, left: '0 of 21 scored', right: 'scores due Sun', title: 'Scores due Sunday, November 22' }, peek: 'Interviews run to Fri Nov 20' },
    { id: 'money', name: 'Finance', icon: 'money', href: '/finance/budget', mark: { kind: 'text', text: '$18,600 on hand' }, peek: q4Approved ? 'Q4 plan ($4,830) approved' : 'Q4 plan ($4,830) waits for approval' },
    { id: 'programs', name: 'Programs', icon: 'programs', href: '/programs/certifications', mark: { kind: 'text', text: 'Certification program in setup' }, peek: 'Planning call Thu Nov 19, 7:00 PM' },
    { id: 'outreach', name: 'Outreach', icon: 'outreach', href: '/outreach/plan', mark: { kind: 'squares', done: 2, total: 4, left: '2 of 4 November posts' }, peek: 'Next post tomorrow, Wed Nov 11' },
  ];
}

const LATEST = { from: 'Keith Dawson', initials: 'KD', timeLabel: '9:12 AM', text: 'Times look good. I can take Saturday mornings.' };

/** The normal day (the demo's SPEC data). */
export const TODAY_VIEW: TodayView = {
  today: '2026-11-10',
  dateLabel: 'Tue, Nov 10',
  needs: NEEDS,
  tasks: baseTasks('Ada Okafor'),
  teamOpen: 7,
  tasksFailed: false,
  interviews: tickets('Ada Okafor'),
  areas: areas(false),
  chat: { channelId: 'ch-board', unread: 4, latest: LATEST },
  caps: ALL_CAPS,
};

const LONG = 'Adaeze-Grace Nwachukwu-Bellamy';

/** The stress day: longest names, a 70-character title, 12 tasks (3 late), 99+ chat. */
export const TODAY_VIEW_STRESS: TodayView = {
  ...TODAY_VIEW,
  tasks: [
    ...baseTasks(LONG),
    plain('coi', 'Collect signed conflict-of-interest forms from all eight board members', 'Scholarships', '2026-11-06'),
    plain('thanks', 'Send thank-you notes to the October sponsors', 'Finance', '2026-11-08'),
    plain('rubric', 'Walk the board through the scoring rubric', 'Scholarships', '2026-11-14'),
    plain('letter', 'Draft the November newsletter', 'Outreach', '2026-11-16'),
    plain('room', 'Book the room for the selection meeting', 'Scholarships', '2026-11-17'),
    plain('cert', 'Update the certification program outline', 'Programs', '2026-11-19'),
    plain('report', 'File the quarterly donation report', 'Finance', '2026-11-27'),
  ],
  teamOpen: 31,
  interviews: tickets(LONG),
  chat: { channelId: 'ch-board', unread: 140, latest: LATEST },
};

/** The quiet day: nothing needs the viewer (interviews, areas and chat still draw). */
export const TODAY_VIEW_EMPTY: TodayView = {
  ...TODAY_VIEW,
  needs: null,
  tasks: [],
  teamOpen: 7,
  areas: areas(true),
  chat: { channelId: 'ch-board', unread: 0, latest: LATEST },
};
