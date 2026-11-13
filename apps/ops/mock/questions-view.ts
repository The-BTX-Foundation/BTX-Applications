// The Interview questions page's mock sample (mock mode, no Supabase env), in the demo's shape and words (demo p-questions):
// the Legacy rubric (mock/scores.ts), the 12 starter questions (mock/interview-flow.ts), Dana Mercer (admin) signed in,
// and her next interview, Thu Nov 12 at 5:30 PM with Keith Dawson. The stress sample adds the demo's three extra
// questions (one very long) and the longest applicant name.
import { STARTER_QUESTIONS } from './interview-flow';
import { RUBRIC } from './scores';
import { MOCK_ME } from './staff';
import { mockCaps, qnGroups } from '@/lib/questions-map';
import type { QnNext, QnView } from '@/lib/questions-view';

const STRESS_EXTRA: { key: string | null; text: string }[] = [
  { key: 'community', text: 'Tell us about a time you organized something for other students, such as a study group, a club event or a tutoring session, who came, what went wrong on the day, and what you would change if you ran it again next semester.' },
  { key: 'community', text: 'Who in your community made time for you when you were starting out?' },
  { key: 'leadership', text: 'When did you change your mind because of someone on your team?' },
];

const rubricRows = RUBRIC.map((c) => ({ key: c.key, name: c.name, weight: c.weight, position: c.position }));
const rows = (list: { key: string | null; text: string }[]) => list.map((q, i) => ({ id: `mock-q-${i + 1}`, criterion_key: q.key, text: q.text }));

/** Thu Nov 12, 2026, 5:30 to 6:00 PM Eastern (22:30 to 23:00 UTC). */
const NEXT: QnNext = { startsAt: '2026-11-12T22:30:00.000Z', endsAt: '2026-11-12T23:00:00.000Z', code: 'APP-2026-00011', applicant: 'Ada Okafor', withName: 'Keith Dawson' };

/** The normal sample. */
export const QN_VIEW: QnView = {
  cycleId: 'mock-cycle',
  term: 'Fall 2026',
  groups: qnGroups(rubricRows, rows(STARTER_QUESTIONS)),
  isAdmin: true,
  next: NEXT,
  nextFailed: false,
  loadFailed: false,
  caps: mockCaps(true),
  me: MOCK_ME,
  starterCount: STARTER_QUESTIONS.length,
  mockWrite: null,
};

/** The stress sample: 15 questions, one very long; the longest applicant name. */
export const QN_VIEW_STRESS: QnView = {
  ...QN_VIEW,
  groups: qnGroups(rubricRows, rows([...STARTER_QUESTIONS, ...STRESS_EXTRA])),
  next: { ...NEXT, applicant: 'Adaeze-Grace Nwachukwu-Bellamy' },
};

/** The empty sample: no questions yet. */
export const QN_VIEW_EMPTY: QnView = { ...QN_VIEW, groups: qnGroups(rubricRows, []) };

/** The starter questions as the page draws them after "Use the starter questions" (mock mode). */
export const QN_STARTER_GROUPS = () => qnGroups(rubricRows, rows(STARTER_QUESTIONS).map((r) => ({ ...r, id: `${r.id}-s${Date.now()}` })));
