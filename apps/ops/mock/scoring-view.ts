// MOCK: the Scoring page's sample (lib/scoring-view.ts), the demo's data (apps/design/ops-refresh/directions/p-scoring):
// Dana Mercer's queue on Thu Nov 19, 2026, scores due Sun Nov 22. The rubric and the interview notes come from
// mock/scores.ts; the questions are the demo's. Mock mode only: live mode reads the real tables (lib/scoring-live.ts).
import { CYCLE_AVERAGE, RUBRIC } from './scores';
import { MOCK_CAPS, shortName } from '@/lib/scoring-map';
import type { ScCriterion, ScSheet, ScoringView } from '@/lib/scoring-view';

const QUESTIONS: Record<string, string[]> = {
  community: ['Tell us about a community you’re part of and what you’ve given back to it.', 'Why does community matter to you as an engineer?'],
  resilience: ['Tell us about a time something went wrong at school or work. What did you do next?', 'Walk us through a hard problem you solved, step by step.'],
  leadership: ['Describe a team project where you had to step up. What did you learn?', 'Tell us about a disagreement on a team and how it ended.'],
  financial: ['What would this scholarship make possible for you this year?'],
  communication: ['Explain an engineering idea you like to someone outside engineering.'],
  passion: ['What got you into engineering, and what keeps you in it?', 'Where do you want to be in five years?'],
};

export const MOCK_CRITERIA: ScCriterion[] = [...RUBRIC]
  .sort((a, b) => a.position - b.position)
  .map((r) => ({ key: r.key, name: r.name, short: shortName(r.key, r.name), weight: r.weight, avg: CYCLE_AVERAGE[r.key]?.toFixed(1) ?? null, questions: QUESTIONS[r.key] ?? [] }));

const SUMMARY =
  'Tutors on campus twice a week and volunteers with a STEM outreach program at home. Nearly withdrew from a lab course while working nights, then rebuilt the schedule with an advisor. Led a capstone team through a redesign after the first sensor design failed testing. The award would let them cut work hours to take an unpaid research assistantship.';

const base: Pick<ScSheet, 'test' | 'summary' | 'quotes' | 'note' | 'publishedAt' | 'savedAt' | 'published'> = { test: false, summary: null, quotes: [], note: '', publishedAt: null, savedAt: null, published: false };

// The demo's four sheets, in its order.
function sheets(): ScSheet[] {
  return [
    {
      ...base,
      applicationId: 'mock-app-00011',
      code: 'APP-2026-00011',
      name: 'Ada Okafor',
      interviewDay: '2026-11-12',
      minutes: 24,
      otherName: 'Charlie Gaines',
      otherPublished: true,
      picks: { community: 4, resilience: 5, leadership: 4, communication: 4 },
      savedAt: '2026-11-19T14:14:00Z',
      summary: SUMMARY,
      // The interviewers' notes from the interview's page, by question.
      ivNotes: [
        { label: `1. ${QUESTIONS.community[0]}`, notes: [{ name: 'You', body: 'Tutors on campus twice a week.' }, { name: 'Charlie Gaines', body: 'Runs a monthly STEM night at the public library with two friends.' }] },
        { label: `3. ${QUESTIONS.resilience[0]}`, notes: [{ name: 'Charlie Gaines', body: 'Nearly withdrew from a lab course while working nights. Went to the advisor and rebuilt the schedule.' }] },
        { label: 'Overall notes', notes: [{ name: 'Charlie Gaines', body: 'Clear, specific answers with real examples.' }] },
      ],
      quotes: [
        { key: 'community', label: 'Community', at: '8:12', text: '"I only got interested in engineering because someone made time to explain it to me, so I try to be that person for someone else now."' },
        { key: 'resilience', label: 'Resilience', at: '13:34', text: '"I went to my advisor instead of just quietly failing, and we restructured my schedule around my shifts."' },
      ],
    },
    { ...base, applicationId: 'mock-app-00012', code: 'APP-2026-00012', name: 'Tariq Wells', interviewDay: '2026-11-18', minutes: 26, otherName: 'Charlie Gaines', otherPublished: true, picks: {} },
    { ...base, applicationId: 'mock-app-00013', code: 'APP-2026-00013', name: 'Lena Mensah', interviewDay: '2026-11-16', minutes: 22, otherName: 'Charlie Gaines', otherPublished: false, picks: {} },
    {
      ...base,
      applicationId: 'mock-app-00004',
      code: 'APP-2026-00004',
      name: 'Naomi Brooks',
      interviewDay: '2026-11-15',
      minutes: 25,
      otherName: 'Miles Donovan',
      otherPublished: false,
      picks: { community: 4, resilience: 4, leadership: 4, financial: 3, communication: 4, passion: 3 },
      published: true,
      publishedAt: '2026-11-15T20:00:00Z',
    },
  ];
}

const VIEW: Omit<ScoringView, 'sheets'> = {
  today: '2026-11-19',
  now: '2026-11-19T14:20:00Z',
  due: '2026-11-22',
  criteria: MOCK_CRITERIA,
  caps: MOCK_CAPS,
  notesFailed: false,
  questionsFailed: false,
  sim: null,
};

/** The demo's normal state. */
export function mockScoringView(): ScoringView {
  return { ...VIEW, sheets: sheets() };
}

/** `?demo=empty`: everything published (the demo's empty state: missing picks become 4, published Wednesday). */
export function mockScoringEmpty(): ScoringView {
  const all = sheets().map((s) =>
    s.published ? s : { ...s, picks: Object.fromEntries(MOCK_CRITERIA.map((c) => [c.key, s.picks[c.key] ?? 4])), published: true, publishedAt: '2026-11-18T15:00:00Z', savedAt: null },
  );
  return { ...VIEW, sheets: all };
}

const LONG = [
  'Oluwaseun Adebayo-Richardson',
  'Maria Fernanda Castillo-Rodriguez',
  'Christopher Alexander Montgomery',
  'Nguyen Thi Thanh Huong',
  'Anastasia Konstantinopoulou',
  'Jean-Baptiste Okonkwo-Laurent',
  'Siddharth Venkataraman',
  'Mercedes Isabella Villanueva',
  'Kwame Asante-Mensah Boateng',
  'Elizabeth Worthington-Smythe',
];

/** `?demo=stress`: the longest names, a long queue, a long summary and note, and long criterion names. */
export function mockScoringStress(): ScoringView {
  const crit = MOCK_CRITERIA.map((c, i) => (i === 0 ? { ...c, name: 'Community engagement, service to others and the values behind it' } : c));
  const extra: ScSheet[] = LONG.map((name, i): ScSheet => ({
    ...base,
    applicationId: `mock-app-s${i}`,
    code: `APP-2026-${String(100 + i).padStart(5, '0')}`,
    name,
    interviewDay: '2026-11-1' + String(i % 8),
    minutes: 20 + i,
    otherName: i % 2 ? 'Bartholomew Featherstonehaugh-Kensington' : 'Charlie Gaines',
    otherPublished: i % 3 === 0,
    picks: i % 4 === 1 ? { community: 3, resilience: 4 } : ({} as Record<string, number>),
    published: i % 5 === 4,
    publishedAt: i % 5 === 4 ? '2026-11-17T18:00:00Z' : null,
  })).map((s) => (s.published ? { ...s, picks: Object.fromEntries(crit.map((c) => [c.key, 3])) } : s));
  const [ada, ...rest] = sheets();
  const longAda: ScSheet = {
    ...ada,
    name: 'Oluwaseun Adebayo-Richardson Okafor',
    summary: `${SUMMARY} ${SUMMARY}`,
    note: 'Ask the selection meeting about the research assistantship start date and whether the lab hours overlap with the capstone schedule next spring.',
  };
  return { ...VIEW, criteria: crit, sheets: [longAda, ...rest, ...extra] };
}
