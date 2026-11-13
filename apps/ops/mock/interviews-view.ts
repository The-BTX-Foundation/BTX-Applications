// The refreshed Interviews page's mock sample (mock mode only): the demo p-interviews, with today Tue Nov 10, 2026 and
// interviews Nov 10 to 20. Dana Mercer (mock/staff.ts MOCK_ME) is the viewer, with admin rights. Also the ?demo= states:
// stress (long names, many times and people), empty (no times built yet) and error (the load-error state).
import { capsFor } from '@/lib/interviews-map';
import type { InterviewsView, IzBooking, IzInterviewer, IzPerson, IzTime, IzWaiting } from '@/lib/interviews-view';
import { MOCK_ME } from './staff';

const TODAY = '2026-11-10';
const FIRST = '2026-11-10';
const LAST = '2026-11-20';

// The board (the demo's BOARD): id, name, free hours, own limit, sent only this week.
const BOARD: [string, string, number, number | null, boolean][] = [
  [MOCK_ME, 'Dana Mercer', 20, null, false],
  ['kd', 'Keith Dawson', 32, null, false],
  ['ck', 'Camila Keane', 14, null, false],
  ['md', 'Miles Donovan', 6, 4, true],
  ['tf', 'Toby Faraday', 26, null, false],
  ['cg', 'Charlie Gaines', 18, null, false],
  ['ds', 'Dorian Sutton', 10, null, false],
  ['pn', 'Priya Natarajan', 16, null, false],
];

// The booked students (the demo's BOOKED): key, name, code, the two interviewers, has a Teams link.
const BOOKED: [string, string, string, [string, string], boolean][] = [
  ['ada', 'Ada Okafor', 'APP-2026-00011', [MOCK_ME, 'kd'], true],
  ['lena', 'Lena Mensah', 'APP-2026-00013', ['ck', 'md'], true],
  ['naomi', 'Naomi Brooks', 'APP-2026-00004', ['tf', 'cg'], true],
  ['sade', 'Sade Price', 'APP-2026-00015', ['ds', 'pn'], false],
  ['tariq', 'Tariq Wells', 'APP-2026-00012', [MOCK_ME, 'ck'], false],
];

// The times (the demo's list): day of November, "HH:MM", board members free, the booked student's key.
const TIMES: [number, string, number, string?][] = [
  [10, '18:00', 3], [10, '18:30', 2],
  [11, '17:00', 4], [11, '17:30', 4], [11, '18:00', 3],
  [12, '17:30', 4, 'ada'], [12, '18:00', 3], [12, '19:00', 2],
  [13, '17:00', 4, 'lena'], [13, '17:30', 3],
  [14, '10:00', 5], [14, '10:30', 5], [14, '11:00', 4],
  [15, '11:00', 3, 'naomi'],
  [16, '17:00', 4], [16, '17:30', 4], [16, '18:00', 3],
  [17, '17:00', 3, 'sade'], [17, '18:00', 3], [17, '18:30', 2],
  [18, '17:00', 3, 'tariq'], [18, '17:30', 2],
  [19, '18:00', 4], [19, '18:30', 3],
  [20, '17:00', 2], [20, '17:30', 2],
];

// The 16 who have not booked (the demo's "See who" list).
const UNBOOKED = ['Jalen Thomas', 'Renee Simmons', 'Daniel Asante', 'Maya King', 'Elijah Carter', 'Folake Nwosu', 'Brianna Reid', 'Gabriel Hayes', 'Whitney Kamara', 'Isaac Boateng', 'Sofia Ramirez', 'Marcus Bell', 'Adaeze-Grace Nwachukwu-Bello', 'Kofi Owusu', 'Hannah Lee', 'Jordan Pierce'];

// When the booking email went to everyone (Mon Nov 9, 9:02 AM Eastern); two had a reminder earlier today.
const EMAILED = '2026-11-09T14:02:00Z';
const REMINDED = '2026-11-10T13:05:00Z';
const waiting = (names: string[]): IzWaiting[] =>
  names.map((name, i) => ({ id: `mock-app-${i + 1}`, name, code: `APP-2026-${String(30 + i).padStart(5, '0')}`, emailed: i % 8 === 3 ? REMINDED : EMAILED, remindedToday: i % 8 === 3 }));

const nov = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const ini = (name: string) => {
  const w = name.split(' ');
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
};

// Builds a view from board rows, booked rows and time rows (shared by the normal and stress samples).
function build(board: typeof BOARD, booked: typeof BOOKED, rows: typeof TIMES, applicants: number, unbooked: string[], sent: string, cover: string[] = []): InterviewsView {
  const person = (id: string): IzInterviewer => {
    const b = board.find((x) => x[0] === id)!;
    return { id, name: b[1], initials: ini(b[1]) };
  };
  const times: IzTime[] = rows.map(([d, t, free, bk], i) => ({ id: `t${i + 1}`, day: nov(d), minute: mins(t), free, opened: true, booking: bk ? `t${i + 1}` : null, heldBy: null }));
  const bookings: IzBooking[] = booked.map(([key, name, code, pair, link]) => {
    const i = rows.findIndex((r) => r[3] === key);
    const t = times[i];
    return { id: t.id, day: t.day, minute: t.minute, whenText: '', name, code, pair: pair.map(person), link: link ? `https://teams.microsoft.com/l/meetup-join/btx-${code.toLowerCase()}` : null, ...(cover.includes(key) ? { needsCover: true } : {}) };
  });
  const people: IzPerson[] = board.map(([id, name, hours, most, weekOnly]) => ({
    id,
    name,
    initials: ini(name),
    hours,
    most,
    sent: true,
    weekOnly,
    interviews: bookings.filter((b) => b.pair.some((p) => p.id === id)).length,
  }));
  return {
    source: 'mock',
    failed: false,
    loadError: false,
    today: TODAY,
    first: FIRST,
    last: LAST,
    me: MOCK_ME,
    isAdmin: true,
    cycleId: 'mock-cycle',
    times,
    bookings,
    people,
    applicants,
    booked: bookings.length,
    sentLine: sent,
    target: 5,
    unbooked: waiting(unbooked),
    dueDay: '2026-11-12',
    caps: capsFor(false, true, true),
  };
}

/** The normal state: the demo, with Naomi Brooks's interview needing cover (Toby Faraday took that time away). */
export const INTERVIEWS_VIEW: InterviewsView = build(BOARD, BOOKED, TIMES, 21, UNBOOKED, 'Sent to all 21 today, 8:01 AM', ['naomi']);

// Stress: long names everywhere, twelve board members, five times a day and fourteen bookings out of 60 applicants.
const STRESS_BOARD: typeof BOARD = [
  ...BOARD.slice(0, 3),
  ['md', 'Maximilian Donovan-Featherstonehaugh', 6, 4, true],
  ...BOARD.slice(4),
  ['ao', 'Adaeze-Grace Okonkwo-Williamson', 40, null, false],
  ['jl', 'Jean-Luc Montgomery-Abernathy', 3, 2, false],
  ['rs', 'Rosalind Sutherland', 28, null, false],
  ['tb', 'Temperance Brightwater-Holloway', 12, 6, false],
];
const STRESS_NAMES = ['Adaeze-Grace Nwachukwu-Bello', 'Christopher Montgomery-Wellington', 'Oluwaseun Abimbola-Adeyemi', 'Ada Okafor', 'Lena Mensah', 'Naomi Brooks', 'Sade Price', 'Tariq Wells', 'Bartholomew Featherstonehaugh', 'Maria-Fernanda Gutierrez-Santos', 'Kwame Asante-Boateng', 'Isabella Rodriguez-Castellanos', 'Jalen Thomas', 'Priscilla Vandenberg-Oduya'];
const PAIRS: [string, string][] = [[MOCK_ME, 'kd'], ['ck', 'md'], ['tf', 'cg'], ['ds', 'pn'], [MOCK_ME, 'ck'], ['ao', 'jl'], ['rs', 'tb'], ['kd', 'ao'], ['cg', 'rs'], [MOCK_ME, 'tb'], ['pn', 'tf'], ['ds', 'ao'], ['jl', 'rs'], ['kd', 'cg']];
const STRESS_TIMES: typeof TIMES = [];
const STRESS_BOOKED: typeof BOOKED = [];
for (let d = 10; d <= 20; d++) {
  for (const t of ['10:00', '10:30', '17:00', '18:00', '19:30']) STRESS_TIMES.push([d, t, ((d + t.length) % 7) + 2]);
}
STRESS_NAMES.forEach((name, i) => {
  const key = `s${i}`;
  // Spread the bookings over the days, one per row index step.
  const row = STRESS_TIMES[(i * 4 + 2) % STRESS_TIMES.length];
  row[3] = key;
  STRESS_BOOKED.push([key, name, `APP-2026-${String(100 + i).padStart(5, '0')}`, PAIRS[i], i % 3 !== 0]);
});
const STRESS_UNBOOKED = Array.from({ length: 46 }, (_, i) => (i === 0 ? 'Adaeze-Grace Nwachukwu-Bello Okonkwo' : `${UNBOOKED[i % UNBOOKED.length]} ${i > 15 ? String.fromCharCode(65 + (i % 26)) + '.' : ''}`.trim()));

/** ?demo=stress. */
export const INTERVIEWS_VIEW_STRESS: InterviewsView = build(STRESS_BOARD, STRESS_BOOKED, STRESS_TIMES, 60, STRESS_UNBOOKED, 'Sent to all 60 today, 8:01 AM', ['s1', 's4', 's9']);

/** ?demo=empty: the cycle's dates are set but no times are built and nobody is booked; three people have not sent hours. */
export const INTERVIEWS_VIEW_EMPTY: InterviewsView = {
  ...build(BOARD, [], [], 21, [], 'Not sent yet'),
  people: BOARD.map(([id, name, hours], i) => ({ id, name, initials: ini(name), hours: i % 3 === 1 ? 0 : hours, most: null, sent: i % 3 !== 1, weekOnly: false, interviews: 0 })),
  target: 0,
  unbooked: [],
  dueDay: null,
};

/** The demo's times, for "Build times" in the empty state (mock only): the same list, none offered yet, none booked. */
export const MOCK_BUILT_TIMES: IzTime[] = TIMES.map(([d, t, free], i) => ({ id: `b${i + 1}`, day: nov(d), minute: mins(t), free, opened: false, booking: null, heldBy: null }));
