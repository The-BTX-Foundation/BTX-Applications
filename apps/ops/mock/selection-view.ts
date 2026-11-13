// The Selection page's mock sample (demo apps/design/ops-refresh/directions/p-selection): the Fall 2026 cycle, the board,
// the 20 ranked applicants with their interviewers and picks, the one applicant without an interview, and Ada Okafor's
// interview notes. Mock mode only (no Supabase env); the shape is lib/selection-view.ts.
import type { SelectionView, SlAward, SlCaps, SlCrit, SlCycle, SlMeeting, SlPerson, SlRow, SlUnscored } from '@/lib/selection-view';

/** The board members who interview (initials -> name). */
const BOARD: Record<string, string> = {
  DM: 'Dana Mercer',
  KD: 'Keith Dawson',
  CK: 'Camila Keane',
  MD: 'Miles Donovan',
  TF: 'Toby Faraday',
  CG: 'Charlie Gaines',
  DS: 'Dorian Sutton',
  PN: 'Priya Natarajan',
};

/** The rubric (mock/scores.ts), with the demo's short labels. */
export const SL_CRIT: SlCrit[] = [
  { key: 'community', short: 'Community', weight: 20 },
  { key: 'resilience', short: 'Resilience', weight: 20 },
  { key: 'leadership', short: 'Leadership', weight: 20 },
  { key: 'financial', short: 'Financial need', weight: 20 },
  { key: 'communication', short: 'Communication', weight: 10 },
  { key: 'passion', short: 'Passion', weight: 10 },
];

/** The cycle (Legacy, $2,500, 21 applicants). */
export const SL_CYCLE: SlCycle = {
  id: 'mock-cycle',
  term: 'Fall 2026',
  mainName: 'Legacy',
  mainAwardName: 'Legacy Scholarship',
  mainCents: 250_000,
  total: 21,
  interviewStart: '2026-11-10',
  interviewEnd: '2026-11-20',
  // Sun Nov 22, 11:59 PM Eastern.
  scoresDue: '2026-11-23T04:59:00.000Z',
  decisionDate: '2026-11-30',
  releasedAt: null,
};

/** Tue Nov 24, 7:00 PM Eastern, on Teams. */
export const SL_MEETING: SlMeeting = { startsAt: '2026-11-25T00:00:00.000Z', videoUrl: 'https://teams.microsoft.com/l/meetup-join/btx-selection' };

/** Every control on (mock mode changes only the page's own state). */
export const SL_MOCK_CAPS: SlCaps = { record: true, undo: true, release: true };

// code, name, interviewer A, interviewer B, A's score, B's score, Board test
const RANK: [string, string, string, string, number, number, boolean?][] = [
  ['APP-2026-00003', 'Jalen Thomas', 'DM', 'CG', 4.9, 4.7],
  ['APP-2026-00014', 'Renee Simmons', 'KD', 'TF', 4.7, 4.5],
  ['APP-2026-00002', 'Daniel Asante', 'PN', 'DS', 4.6, 4.4],
  ['APP-2026-00009', 'Maya King', 'DM', 'MD', 4.5, 4.3],
  ['APP-2026-00011', 'Ada Okafor', 'DM', 'KD', 4.4, 4.2],
  ['APP-2026-00007', 'Whitney Kamara', 'MD', 'CG', 4.4, 4.2],
  ['APP-2026-00012', 'Tariq Wells', 'DM', 'CK', 4.0, 4.2, true],
  ['APP-2026-00018', 'Brianna Reid', 'DM', 'KD', 3.9, 4.1],
  ['APP-2026-00004', 'Naomi Brooks', 'TF', 'CG', 3.7, 4.1],
  ['APP-2026-00001', 'Gabriel Hayes', 'CK', 'KD', 3.7, 3.9],
  ['APP-2026-00005', 'Isaac Boateng', 'DM', 'TF', 3.6, 3.8],
  ['APP-2026-00006', 'Sofia Ramirez', 'TF', 'MD', 3.5, 3.7],
  ['APP-2026-00008', 'Marcus Bell', 'CK', 'PN', 3.4, 3.6],
  ['APP-2026-00010', 'Adaeze-Grace Nwachukwu-Bello', 'DS', 'CG', 3.3, 3.5],
  ['APP-2026-00013', 'Lena Mensah', 'CK', 'MD', 3.2, 3.4],
  ['APP-2026-00015', 'Sade Price', 'DS', 'PN', 3.1, 3.3],
  ['APP-2026-00016', 'Elijah Carter', 'KD', 'PN', 3.0, 3.2],
  ['APP-2026-00017', 'Folake Nwosu', 'CG', 'DS', 2.9, 3.1],
  ['APP-2026-00019', 'Kofi Owusu', 'MD', 'KD', 2.8, 3.0],
  ['APP-2026-00020', 'Hannah Lee', 'DM', 'CG', 2.7, 2.9],
];

/** The applicant without an interview (can still be chosen). */
const UNSCORED: SlUnscored[] = [{ applicationId: 'mock-APP-2026-00021', code: 'APP-2026-00021', name: 'Jordan Pierce', test: false, why: 'No interview' }];

const SUMMARY =
  'Tutors on campus twice a week and volunteers with a STEM outreach program at home. Nearly withdrew from a lab course while working nights, then rebuilt the schedule with an advisor. Led a capstone team through a redesign after the first sensor design failed testing. The award would let them cut work hours to take an unpaid research assistantship.';
const QUOTES = [
  { criterion: 'Community', at: '8:12', text: '"I only got interested in engineering because someone made time to explain it to me, so I try to be that person for someone else now."' },
  { criterion: 'Resilience', at: '13:34', text: '"I went to my advisor instead of just quietly failing, and we restructured my schedule around my shifts."' },
];

// Per-question picks (1 to 5) that add up to a weighted score (the demo's picksFor).
function picksFor(score: number, seed: number): number[] {
  const v = [5, 5, 5, 5, 5, 5];
  let diff = 50 - Math.round(score * 10);
  const order = [0, 1, 2, 3, 4, 5].map((i) => (i + seed) % 6);
  let guard = 0;
  while (diff > 0 && guard++ < 60) {
    for (const i of order) {
      if (diff <= 0) break;
      if (i < 4 && diff >= 2 && v[i] > 2) {
        v[i]--;
        diff -= 2;
      } else if (i >= 4 && v[i] > 2) {
        v[i]--;
        diff -= 1;
      }
    }
  }
  return v;
}

// A board member as the ranking names them.
const person = (k: string): SlPerson => ({ name: BOARD[k], first: BOARD[k].split(' ')[0] });

// The ranked rows; `stress` puts the longest real name at the top (its scores swapped with the first row).
function buildRows(stress: boolean): SlRow[] {
  const rows: SlRow[] = RANK.map(([code, name, a, b, sa, sb, test], i) => ({
    applicationId: `mock-${code}`,
    code,
    name,
    test: !!test,
    combined: Math.round(((sa + sb) / 2) * 10) / 10,
    pair: [person(a), person(b)],
    parts: [sa, sb],
    picks: [code === 'APP-2026-00011' ? [4, 5, 4, 5, 4, 4] : picksFor(sa, i), picksFor(sb, i + 3)],
    summary: code === 'APP-2026-00011' ? SUMMARY : null,
    quotes: code === 'APP-2026-00011' ? QUOTES : [],
  }));
  if (stress) {
    const j = rows.findIndex((r) => r.code === 'APP-2026-00010');
    const top = rows[0];
    const ag = rows[j];
    [top.parts, ag.parts] = [ag.parts, top.parts];
    [top.combined, ag.combined] = [ag.combined, top.combined];
    [top.picks, ag.picks] = [ag.picks, top.picks];
    rows.sort((x, y) => y.combined - x.combined || y.parts[0] - x.parts[0]);
  }
  return rows;
}

/** The extra award the stress state starts with (Renee Simmons, Empowerment, $500, recorded 7:02 PM). */
const STRESS_EXTRA: SlAward = {
  id: 'mock-award-x1',
  applicationId: 'mock-APP-2026-00014',
  code: 'APP-2026-00014',
  name: 'Renee Simmons',
  kind: 'extra',
  awardName: 'Empowerment',
  amountCents: 50_000,
  decidedAt: '2026-11-25T00:02:00.000Z',
  letterDone: false,
};

/** Before the meeting (Tue Nov 10, 9:00 AM): nobody scored yet. */
export const SL_VIEW_TODAY: SelectionView = {
  failed: false,
  loadFailed: false,
  now: '2026-11-10T14:00:00.000Z',
  today: '2026-11-10',
  cycle: SL_CYCLE,
  meeting: SL_MEETING,
  crit: SL_CRIT,
  rows: [],
  unscored: [],
  awards: [],
  caps: SL_MOCK_CAPS,
  failFirst: false,
};

/** The meeting (Tue Nov 24, 7:05 PM): the ranking and the decisions. */
export const SL_VIEW_MEETING: SelectionView = {
  ...SL_VIEW_TODAY,
  now: '2026-11-25T00:05:00.000Z',
  today: '2026-11-24',
  rows: buildRows(false),
  unscored: UNSCORED,
};

/** The meeting with the longest name on top and one extra award already recorded. */
export const SL_VIEW_STRESS: SelectionView = { ...SL_VIEW_MEETING, rows: buildRows(true), awards: [STRESS_EXTRA] };

/** Nobody has applied yet. */
export const SL_VIEW_EMPTY: SelectionView = { ...SL_VIEW_TODAY, cycle: { ...SL_CYCLE, total: 0 }, meeting: null };
