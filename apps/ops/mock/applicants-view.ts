// MOCK: the refreshed Applicants pages' sample (demo p-applicants), on the demo's day, Wed Nov 18, 2026, 9:00 AM Eastern
// (inside interview week), viewed by Dana Mercer. The 21 Fall 2026 applicants are sample names; Tariq Wells is a board
// member's Portal test. Stress adds the longest names and 120 more applications; Empty has none yet.
import { MOCK_CAPS } from '@/lib/applicants-map';
import { INTERVIEWS_VIEW } from './interviews-view';
import type { ApApplicant, ApCycle, ApFact, ApPerson, ApplicantDetailView, ApplicantsView } from '@/lib/applicants-view';

/** The demo's "now": Wed Nov 18, 2026, 9:00 AM Eastern. */
export const MOCK_NOW = '2026-11-18T14:00:00.000Z';
const ME = 'dm';

// An Eastern wall-clock time as an instant (EDT until Nov 1, EST after).
function et(month: number, day: number, h = 0, m = 0): string {
  const off = month < 11 ? '-04:00' : '-05:00';
  return new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${off}`).toISOString();
}

const P = (id: string, name: string): ApPerson => ({ id, name, first: name.split(' ')[0], initials: id.toUpperCase(), me: id === ME });
const BOARD: Record<string, ApPerson> = {
  dm: P('dm', 'Dana Mercer'),
  kd: P('kd', 'Keith Dawson'),
  ck: P('ck', 'Camila Keane'),
  md: P('md', 'Miles Donovan'),
  tf: P('tf', 'Toby Faraday'),
  cg: P('cg', 'Charlie Gaines'),
  ds: P('ds', 'Dorian Sutton'),
  pn: P('pn', 'Priya Natarajan'),
};

export const MOCK_CYCLE: ApCycle = {
  term: 'Fall 2026',
  awardName: 'Legacy Scholarship',
  opensAt: et(10, 12, 12),
  criteriaTotal: 6,
  scoresDue: '2026-11-22',
  interviewEnd: '2026-11-20',
  selectionAt: et(11, 24, 19),
  awardOn: '2026-11-30',
};

type Seed = { n: number; name: string; applied: string; iv: string | null; pair: string[]; pub: string[]; draft?: number; avg?: number; test?: boolean; summary?: string };
const O = (d: number) => et(10, d);
const N = (d: number, h: number, m = 0) => et(11, d, h, m);

const SEEDS: Seed[] = [
  { n: 11, name: 'Ada Okafor', applied: O(20), iv: N(12, 17, 30), pair: ['dm', 'kd'], pub: ['kd'], draft: 4, summary: 'Tutors on campus twice a week and volunteers in a STEM outreach program at home. Nearly withdrew from a lab course while working nights, then rebuilt the schedule with an advisor.' },
  { n: 3, name: 'Jalen Thomas', applied: O(14), iv: N(13, 18), pair: ['dm', 'cg'], pub: ['cg'] },
  { n: 9, name: 'Maya King', applied: O(15), iv: N(16, 17), pair: ['dm', 'md'], pub: ['md'] },
  { n: 5, name: 'Isaac Boateng', applied: O(22), iv: N(17, 18), pair: ['dm', 'tf'], pub: [] },
  { n: 4, name: 'Naomi Brooks', applied: O(13), iv: N(15, 11), pair: ['tf', 'cg'], pub: ['tf'] },
  { n: 15, name: 'Sade Price', applied: O(27), iv: N(17, 17), pair: ['ds', 'pn'], pub: [] },
  { n: 13, name: 'Lena Mensah', applied: O(26), iv: N(13, 17), pair: ['ck', 'md'], pub: ['ck', 'md'], avg: 4.6 },
  { n: 14, name: 'Renee Simmons', applied: O(16), iv: N(14, 10), pair: ['kd', 'tf'], pub: ['kd', 'tf'], avg: 4.8 },
  { n: 2, name: 'Daniel Asante', applied: O(12), iv: N(14, 11), pair: ['pn', 'ds'], pub: ['pn', 'ds'], avg: 4.3 },
  { n: 1, name: 'Gabriel Hayes', applied: O(12), iv: N(16, 18), pair: ['ck', 'kd'], pub: ['ck', 'kd'], avg: 4.1 },
  { n: 7, name: 'Whitney Kamara', applied: O(14), iv: N(15, 12), pair: ['md', 'cg'], pub: ['md', 'cg'], avg: 3.9 },
  { n: 12, name: 'Tariq Wells', applied: O(21), iv: N(18, 17), pair: ['dm', 'ck'], pub: [], test: true },
  { n: 16, name: 'Elijah Carter', applied: O(28), iv: N(18, 18), pair: ['kd', 'pn'], pub: [] },
  { n: 17, name: 'Folake Nwosu', applied: O(29), iv: N(19, 17), pair: ['cg', 'ds'], pub: [] },
  { n: 18, name: 'Brianna Reid', applied: O(30), iv: N(19, 17, 30), pair: ['dm', 'kd'], pub: [] },
  { n: 19, name: 'Kofi Owusu', applied: N(2, 12), iv: N(19, 18), pair: ['md', 'kd'], pub: [] },
  { n: 6, name: 'Sofia Ramirez', applied: O(13), iv: N(20, 16), pair: ['tf', 'md'], pub: [] },
  { n: 8, name: 'Marcus Bell', applied: O(14), iv: N(20, 17), pair: ['ck', 'pn'], pub: [] },
  { n: 10, name: 'Adaeze-Grace Nwachukwu-Bello', applied: O(15), iv: N(20, 17, 30), pair: ['ds', 'cg'], pub: [] },
  { n: 20, name: 'Hannah Lee', applied: N(4, 12), iv: N(20, 18), pair: ['dm', 'cg'], pub: [] },
  { n: 21, name: 'Jordan Pierce', applied: N(6, 12), iv: null, pair: [], pub: [] },
];

const TEST_EMAIL = 'tariq.wells@example.org';
// The sample interview page (mock/interview-page.ts) exists for the students booked in the Interviews sample; keyed by code.
const SLOT_BY_CODE = new Map(INTERVIEWS_VIEW.bookings.map((b) => [b.code, b.id]));
const code = (n: number) => `APP-2026-${String(n).padStart(5, '0')}`;

// One sample applicant.
function A(s: Seed): ApApplicant {
  return {
    id: `mock-${s.n}`,
    code: code(s.n),
    name: s.name,
    test: Boolean(s.test),
    appliedAt: s.applied,
    interviewAt: s.iv,
    interviewMinutes: s.iv ? 30 : null,
    slotId: s.iv ? (SLOT_BY_CODE.get(code(s.n)) ?? null) : null,
    pair: s.pair.map((k) => BOARD[k]),
    published: s.pub,
    draft: s.draft ?? 0,
    avg: s.avg ?? null,
    summary: s.summary ?? null,
    email: s.test ? TEST_EMAIL : 'sample@terpmail.umd.edu',
    phone: '(301) 555-0100',
  };
}

const APPLICANTS = SEEDS.map(A);
const PEOPLE = Object.values(BOARD);

export const APPLICANTS_VIEW: ApplicantsView = { now: MOCK_NOW, me: ME, cycle: MOCK_CYCLE, people: PEOPLE, applicants: APPLICANTS, loadFailed: false, caps: MOCK_CAPS };

export const APPLICANTS_VIEW_EMPTY: ApplicantsView = { ...APPLICANTS_VIEW, applicants: [] };

// Stress: the longest real-looking names, then 120 more applicants spread over every stage.
const LONG = ['Adaeze-Grace Nwachukwu-Bello', 'Maximiliana Oluwaseun Fitzgerald-Okonkwo', 'Bartholomew Chukwuemeka Vanderbilt-Asante'];
const KEYS = Object.keys(BOARD);
const STRESS_EXTRA: ApApplicant[] = Array.from({ length: 120 }, (_, i) => {
  const n = 100 + i;
  const p = [KEYS[i % 8], KEYS[(i + 3) % 8]];
  const kind = i % 4;
  return A({
    n,
    name: `${LONG[i % 3]} ${i + 1}`,
    applied: O(12 + (i % 19)),
    iv: kind === 3 ? null : kind === 2 ? N(19 + (i % 2), 17) : N(12 + (i % 5), 17),
    pair: kind === 3 ? [] : p,
    pub: kind === 0 ? p : kind === 1 ? [p[1]] : [],
    avg: kind === 0 ? 3 + (i % 20) / 10 : undefined,
    draft: kind === 1 ? i % 6 : 0,
  });
});
export const APPLICANTS_VIEW_STRESS: ApplicantsView = { ...APPLICANTS_VIEW, applicants: [...APPLICANTS, ...STRESS_EXTRA] };

const SHORT: [string, string, string] = [
  'I joined the UMD Engineers Without Borders chapter my sophomore year. Our team was stuck on a water filter design for a school abroad, so I offered to build a test rig in the machine shop. We ran three rounds of flow tests and cut the cost per unit by about a third. I now help train new members on the rig, and two of them are leading the next round.',
  'Thermodynamics was the first class where rereading my notes stopped working. I got a 58 on the first exam. I started drawing the system before touching an equation, joined a study group that met twice a week, and worked old exams under a timer. I got an 81 on the second exam and finished with a B+.',
  'I want to work on making older public buildings accessible without huge renovation costs. Over the summer I helped the campus facilities team survey door widths and ramp slopes in fourteen buildings. This semester I am taking a materials course and a CAD elective so I can design and test standard parts for these fixes.',
];

const ANSWERS: ApFact[] = [
  { label: 'Year in school', value: 'Junior' },
  { label: 'Major', value: 'Mechanical engineering' },
  { label: 'Credits left', value: '54' },
  { label: 'Heard about the scholarship from', value: 'A professor' },
  { label: 'Interested in certification', value: 'Yes' },
  { label: 'Interested in mentoring', value: 'No' },
  { label: 'Stay in touch', value: 'Yes' },
  { label: 'Confirmed the answers are true', value: 'Yes' },
];

/** The full application of a sample applicant (stress names included), or null for an unknown code. */
export function mockDetail(c: string): ApplicantDetailView | null {
  const a = APPLICANTS_VIEW_STRESS.applicants.find((x) => x.code === c);
  if (!a) return null;
  return {
    now: MOCK_NOW,
    me: ME,
    cycle: MOCK_CYCLE,
    applicant: a,
    identity: [
      { label: 'Name', value: a.name },
      { label: 'Terpmail', value: a.email },
      { label: 'Other email', value: null },
      { label: 'Phone', value: a.phone },
      { label: 'Gender', value: null },
      { label: 'Race', value: null },
    ],
    answers: ANSWERS,
    shortAnswers: SHORT,
    files: [
      { kind: 'resume', label: 'Resume', filename: 'resume.pdf' },
      { kind: 'transcript', label: 'Transcript', filename: 'transcript.pdf' },
    ],
    caps: MOCK_CAPS,
  };
}
