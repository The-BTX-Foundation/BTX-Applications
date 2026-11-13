// MOCK: the Cycle page's sample data, in the demo's shape and on its sample day (Tue Nov 10, 2026, 9:14 AM Eastern):
// the demo's makeData(), GROUPS and CHAT (apps/design/ops-refresh/directions/p-cycle). lib/cycle-view-loader.ts returns
// these when there is no Supabase env. Normal: 21 applied, 5 booked. Stress: 148 applied, 47 booked, the longest step
// titles, another person's step and two late steps owned by other board members.
import type { MsMessage } from '@/lib/mentorship-view';
import type { CyCaps, CyCycle, CyOwner, CyRow, CycleView } from '@/lib/cycle-view';

/** Mock mode draws every demo behaviour. */
export const CY_MOCK_CAPS: CyCaps = { remind: true, share: true, tick: true, nudge: true, send: true };

/** The demo's day and time. */
export const CY_TODAY = '2026-11-10';
export const CY_NOW = '2026-11-10T14:14:00.000Z';

const ME: CyOwner = { kind: 'me', label: 'Dana Mercer', initials: 'DM' };
const BOT: CyOwner = { kind: 'bot', label: 'BTX, automatic', initials: '' };
const BOARD: CyOwner = { kind: 'group', label: 'Board', initials: '' };
const ALL: CyOwner = { kind: 'group', label: 'All board members', initials: '' };
const person = (label: string, initials: string): CyOwner => ({ kind: 'person', label, initials });

// One step with the defaults the demo leaves out.
const row = (id: string, title: string, o: Partial<CyRow>): CyRow => ({ id, group: 'interviews', title, owner: null, done: false, doneAt: null, due: null, time: null, act: null, link: null, ...o });

// The demo's cycle: applications Oct 12 to Nov 6 (closed Nov 6 at 11:59 PM Eastern), interviews Nov 10 to 20.
function cycle(n: number, booked: number): CyCycle {
  return {
    title: 'Fall 2026 cycle',
    award: 'Legacy Scholarship',
    amountCents: 250_000,
    opensAt: '2026-10-12T04:00:00.000Z',
    closesAt: '2026-11-07T04:59:00.000Z',
    interviewStart: '2026-11-10',
    interviewEnd: '2026-11-20',
    scoresDue: '2026-11-22',
    selectionDay: '2026-11-24',
    selectionTime: '7:00 PM',
    decisionDate: '2026-11-30',
    fundsSent: null,
    released: false,
    applied: n,
    booked,
    scored: 0,
  };
}

// The demo's steps for `n` applicants with `booked` booked.
function rows(stress: boolean, n: number, booked: number): CyRow[] {
  const out: CyRow[] = [
    row('avail', 'Collect board availability', { owner: BOT, done: true, doneAt: '2026-11-06T15:00:00.000Z' }),
    row('pair', 'Pair two board members per applicant', { owner: BOT, done: true, doneAt: '2026-11-09T15:00:00.000Z' }),
    row('times', `Send interview times to all ${n} students`, { owner: BOT, done: true, doneAt: '2026-11-10T13:01:00.000Z' }),
    row('share', stress ? 'Share the interview schedule and the pairings for both weeks with the whole board' : 'Share the interview schedule with the board', { owner: ME, due: '2026-11-09', act: 'share' }),
    row('remind', `Remind the ${n - booked} students who haven't booked`, { owner: ME, due: '2026-11-12', act: 'remind' }),
    row('finish', `Finish all ${n} interviews`, { owner: stress ? person('Priya Natarajan', 'PN') : BOARD, due: '2026-11-20', link: { label: 'Open interviews', href: '/scholarships/interviews' } }),
    row('score', 'Score every interview', { group: 'scoring', owner: ALL, due: '2026-11-22', link: { label: 'Open scoring', href: '/scholarships/scoring' } }),
    row('meet', 'Selection meeting', { group: 'selection', owner: BOARD, due: '2026-11-24', time: '7:00 PM' }),
  ];
  if (stress) {
    out.splice(
      5,
      0,
      row('q', 'Update the interview questions for the Legacy Scholarship before the first interview', { owner: person('Charlie Gaines', 'CG'), due: '2026-11-08' }),
      row('links', 'Check every booked interview has a Teams link', { owner: person('Dorian Sutton', 'DS'), due: '2026-11-07' }),
    );
  }
  return out;
}

// One chat message.
const msg = (id: string, day: string, who: string, initials: string, time: string, text: string, bot = false): MsMessage => ({ id, day, who, initials, bot, mine: false, time, text });

const CHAT: MsMessage[] = [
  msg('c1', 'Yesterday', 'Keith Dawson', 'KD', '7:40 PM', 'Pairs look good to me. I can take Saturday mornings.'),
  msg('c2', 'Today', 'BTX', '', '8:01 AM', 'Interview times went out to every applicant.', true),
  msg('c3', 'Today', 'BTX', '', '8:40 AM', 'Booked: Ada Okafor (APP-2026-00011), Thu Nov 12, 5:30 PM, with Dana Mercer and Keith Dawson.', true),
  msg('c4', 'Today', 'Miles Donovan', 'MD', '9:05 AM', 'I’ll add my free hours for next week tonight.'),
];
const STRESS_MSG = msg('c5', 'Today', 'Priya Natarajan', 'PN', '9:10 AM', 'Adaeze-Grace Nwachukwu-Bello asked if she can move her interview to the second week. I said yes and told her to pick a new time in the Portal.');

// The page for one sample.
function view(stress: boolean): CycleView {
  const n = stress ? 148 : 21;
  const booked = stress ? 47 : 5;
  return {
    today: CY_TODAY,
    now: CY_NOW,
    me: { userId: 'dm', initials: 'DM' },
    cycle: cycle(n, booked),
    loadFailed: false,
    rows: rows(stress, n, booked),
    listFailed: false,
    chat: { failed: false, title: 'Scholarships chat', people: 7, messages: stress ? [...CHAT, STRESS_MSG] : CHAT, channelId: 'mock-scholarships' },
    caps: CY_MOCK_CAPS,
  };
}

export const CY_VIEW: CycleView = view(false);
export const CY_VIEW_STRESS: CycleView = view(true);
/** No published cycle. */
export const CY_VIEW_EMPTY: CycleView = { ...view(false), cycle: null, rows: [] };
