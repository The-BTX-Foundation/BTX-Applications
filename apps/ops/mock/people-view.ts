// Mock mode (no Supabase env): the Board members demo's sample (apps/design/ops-refresh/directions/p-people), on the sample
// day Tue Nov 10, 2026. People and titles from mock/money.ts PEOPLE_MOCK (sign-ins moved to the sample week), the demo's
// interviews and open tasks. Three states: normal, stress (an invited address and 120 open tasks), empty (only the viewer).
import type { PeopleInterview, PeoplePerson, PeopleTask, PeopleView, PeopleWork } from '@/lib/people-view';

const TODAY = '2026-11-10';
const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;

// One person of the sample.
const P = (id: string, name: string, initials: string, title: string, role: 'admin' | 'board', last: number | null): PeoplePerson => ({
  id,
  name,
  initials,
  title,
  role,
  lastDay: last === null ? null : day(last),
  nameIsEmail: name.includes('@'),
});

const PEOPLE: PeoplePerson[] = [
  P('dm', 'Dana Mercer', 'DM', 'Program lead', 'admin', 10),
  P('kd', 'Keith Dawson', 'KD', 'President', 'board', 10),
  P('ck', 'Camila Keane', 'CK', 'Board member', 'board', 8),
  P('md', 'Miles Donovan', 'MD', 'Board member', 'board', 10),
  P('tf', 'Toby Faraday', 'TF', 'Board member', 'board', 7),
  P('cg', 'Charlie Gaines', 'CG', 'Board member', 'board', 9),
  P('ds', 'Dorian Sutton', 'DS', 'Board member', 'board', 6),
  P('pn', 'Priya Natarajan', 'PN', 'Board member', 'board', 9),
];

// The interviews ahead (applicant, code, day, time, the pair).
const IV: { d: number; t: string; app: string; code: string; pair: [string, string] }[] = [
  { d: 12, t: '5:30 PM', app: 'Ada Okafor', code: 'APP-2026-00011', pair: ['dm', 'kd'] },
  { d: 13, t: '5:00 PM', app: 'Lena Mensah', code: 'APP-2026-00013', pair: ['ck', 'md'] },
  { d: 15, t: '11:00 AM', app: 'Naomi Brooks', code: 'APP-2026-00004', pair: ['tf', 'cg'] },
  { d: 17, t: '5:00 PM', app: 'Sade Price', code: 'APP-2026-00015', pair: ['ds', 'pn'] },
  { d: 18, t: '5:00 PM', app: 'Tariq Wells', code: 'APP-2026-00012', pair: ['dm', 'ck'] },
];

// One open task of the sample.
const T = (id: string, title: string, area: PeopleTask['area'], icon: PeopleTask['icon'], due: number, more: Partial<PeopleTask> = {}): PeopleTask => ({
  id,
  title,
  area,
  icon,
  dueOn: day(due),
  note: null,
  waitsOn: null,
  ...more,
});

const DM_TASKS: PeopleTask[] = [
  T('t1', 'Share the interview schedule with the board', 'Scholarships', 'cap', 9),
  T('t2', 'Instagram post: interview week', 'Outreach', 'mega', 11, { waitsOn: 'kd' }),
  T('t3', "Remind the 16 students who haven't booked", 'Scholarships', 'cap', 12),
  T('t4', "Prep for Ada Okafor's interview", 'Scholarships', 'cap', 12),
  T('t5', 'Approve the Q4 budget ($4,830)', 'Finance', 'money', 13),
];

// Each person's interviews from the sample list.
function interviewsOf(id: string): PeopleInterview[] {
  return IV.filter((v) => v.pair.includes(id)).map((v) => ({ id: `${v.code}`, applicant: v.app, code: v.code, day: day(v.d), time: v.t, mateId: v.pair.find((x) => x !== id) ?? null }));
}

// The work of every person in a state.
function workFor(people: PeoplePerson[], stress: boolean): Record<string, PeopleWork> {
  const out: Record<string, PeopleWork> = {};
  for (const p of people) out[p.id] = { tasks: [], more: 0, waiting: [], interviews: interviewsOf(p.id) };
  out.dm.tasks = DM_TASKS;
  // The viewer's Instagram post waits on Keith for its caption.
  if (out.kd) {
    out.kd.tasks = [T('t6', 'Shortlist 5 grants to apply for', 'Finance', 'money', 16)];
    out.kd.waiting = [{ ...DM_TASKS[1], title: 'Caption for Instagram post: interview week', ask: 'Hi Keith, the interview-week post goes out tomorrow. Could you send the caption?' }];
  }
  if (out.ck) out.ck.tasks = [T('t7', 'Score 3 applicants', 'Scholarships', 'cap', 22, { note: '1 started' })];
  if (stress && out.ds) {
    out.ds.tasks = [T('t8', 'Announce the Legacy Scholarship at the NSBE event and cocktail hour', 'Outreach', 'mega', 3)];
    out.ds.more = 119;
  }
  return out;
}

const CAPS = { changeRole: true, nudge: true, nudgeUndo: true, message: true, mock: true };

// One state of the sample.
function view(people: PeoplePerson[], stress: boolean): PeopleView {
  return {
    today: TODAY,
    dateLabel: 'Tue, Nov 10',
    me: 'dm',
    people,
    work: workFor(people, stress),
    workFailed: false,
    interviewsStart: TODAY,
    loadFailed: false,
    caps: CAPS,
  };
}

/** The sample as the demo's Normal state draws it. */
export const PEOPLE_VIEW: PeopleView = view(PEOPLE, false);

/** Stress: an invited account whose name is a long address, and one member with 120 open tasks. */
export const PEOPLE_VIEW_STRESS: PeopleView = view([...PEOPLE, P('ao', 'adaeze.grace.okonkwo@example.org', 'AO', 'Invited', 'board', null)], true);

/** Empty: only the viewer (the other accounts are not set up yet). */
export const PEOPLE_VIEW_EMPTY: PeopleView = view(PEOPLE.slice(0, 1), false);
