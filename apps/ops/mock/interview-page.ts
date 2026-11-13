// The page for one interview, mock sample (mock mode only). Built from the Interviews page's sample (mock/interviews-view.ts),
// so the same slot ids, students, interviewers and Teams links show on both: Ada Okafor is t6 (Dana Mercer and Keith
// Dawson), Lena Mensah t9 (Camila Keane and Miles Donovan), Naomi Brooks t14, Sade Price t18, Tariq Wells t21 (Dana and
// Camila). Dana Mercer (MOCK_ME) is the viewer, with admin rights. The questions are the Questions page's sample (the 12
// starter questions under the Legacy rubric). Also the ?demo= states: stress, empty, board (no admin rights), failsave
// (every note save fails); error and failed are the load error, loading the skeleton (both handled by the page).
import { questionGroups } from '@/lib/interview-page-map';
import type { InterviewPageResult, InterviewPageView, IpNote, IpPerson } from '@/lib/interview-page-view';
import { OVERALL } from '@/lib/interview-page-view';
import { STARTER_QUESTIONS } from './interview-flow';
import { INTERVIEWS_VIEW } from './interviews-view';
import { RUBRIC } from './scores';
import { MOCK_ME } from './staff';

const rubricRows = RUBRIC.map((c) => ({ key: c.key, name: c.name, weight: c.weight, position: c.position }));
const rows = (list: { key: string | null; text: string }[]) => list.map((q, i) => ({ id: `mock-q-${i + 1}`, criterion_key: q.key, text: q.text }));

const STRESS_EXTRA: { key: string | null; text: string }[] = [
  { key: 'community', text: 'Tell us about a time you organized something for other students, such as a study group, a club event or a tutoring session, who came, what went wrong on the day, and what you would change if you ran it again next semester.' },
  { key: 'leadership', text: 'When did you change your mind because of someone on your team?' },
];

const AWARD = 'Fall 2026 Legacy Scholarship';

// An Eastern day and minute as an instant (November: Eastern Standard Time, UTC-5).
function instant(day: string, minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return new Date(`${day}T${hh}:${mm}:00-05:00`).toISOString();
}

// Keith Dawson's notes on Ada Okafor's interview (the other interviewer), and Dana's own words so far.
const KEITH_NOTES: Record<string, string> = {
  'mock-q-1': 'Runs a monthly STEM night at the public library with two friends. Started it after a cousin dropped out of calculus.',
  'mock-q-3': 'Nearly withdrew from a lab course while working nights. Went to the advisor and rebuilt the schedule.',
  [OVERALL]: 'Clear, specific answers with real examples. Asked good questions about the internship.',
};
const DANA_NOTES: Record<string, string> = {
  'mock-q-1': 'Tutors on campus twice a week.',
};

// Who could cover each person: board members not on this interview, fewest interviews first (the mock's stand-in for
// listFreeReplacements).
function replacementsFor(pairIds: string[]): IpPerson[] {
  return INTERVIEWS_VIEW.people
    .filter((p) => !pairIds.includes(p.id))
    .sort((a, b) => a.interviews - b.interviews || a.name.localeCompare(b.name))
    .slice(0, 4)
    .map((p) => ({ id: p.id, name: p.name, initials: p.initials, me: p.id === MOCK_ME }));
}

/** The normal mock view for a slot id, or null when the sample has no such interview. */
export function mockInterviewPageView(slotId: string): InterviewPageView | null {
  const b = INTERVIEWS_VIEW.bookings.find((x) => x.id === slotId);
  if (!b || !b.day) return null;
  const startsAt = instant(b.day, b.minute);
  const pair: IpPerson[] = b.pair.map((p) => ({ id: p.id, name: p.name, initials: p.initials, me: p.id === MOCK_ME }));
  const pairIds = pair.map((p) => p.id);
  const names = new Map(INTERVIEWS_VIEW.people.map((p) => [p.id, p.name]));
  const others: Record<string, IpNote[]> = {};
  const isAda = b.code === 'APP-2026-00011';
  if (isAda) for (const [k, body] of Object.entries(KEITH_NOTES)) others[k] = [{ authorId: 'kd', name: names.get('kd') ?? 'Keith Dawson', body }];
  return {
    source: 'mock',
    slotId: b.id,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    name: b.name,
    code: b.code,
    award: AWARD,
    pair,
    me: MOCK_ME,
    isAdmin: true,
    canRead: true,
    link: b.link,
    linkHidden: false,
    groups: questionGroups(rubricRows, rows(STARTER_QUESTIONS)),
    questionsFailed: false,
    mine: isAda ? { ...DANA_NOTES } : {},
    others,
    notesFailed: false,
    caps: { change: pair.length === 2, notes: true, score: pairIds.includes(MOCK_ME) },
    sim: { replacements: Object.fromEntries(pairIds.map((id) => [id, replacementsFor(pairIds)])), failSave: false },
  };
}

const LONG_NOTE =
  'Spoke for a long time about the robotics club she started in her second year, how it grew from four people to thirty, the sponsor she found at a local machine shop, and the season the team almost folded when the faculty adviser left. Took over the budget herself and kept it running.';

/** ?demo=stress: the longest names, long notes from both people, three extra questions. */
function stress(v: InterviewPageView): InterviewPageView {
  const pair: IpPerson[] = [
    { id: MOCK_ME, name: 'Dana Mercer', initials: 'DM', me: true },
    { id: 'md', name: 'Maximilian Donovan-Featherstonehaugh', initials: 'MD', me: false },
  ];
  const groups = questionGroups(rubricRows, rows([...STARTER_QUESTIONS, ...STRESS_EXTRA]));
  const others: Record<string, IpNote[]> = {};
  for (const g of groups) for (const q of g.questions) others[q.id] = [{ authorId: 'md', name: pair[1].name, body: q.n % 2 ? LONG_NOTE : 'Short answer, then a strong example.' }];
  others[OVERALL] = [{ authorId: 'md', name: pair[1].name, body: `${LONG_NOTE}\n\n${LONG_NOTE}` }];
  return {
    ...v,
    name: 'Adaeze-Grace Nwachukwu-Bello Okonkwo-Williamson',
    code: 'APP-2026-00100',
    pair,
    groups,
    mine: { 'mock-q-1': LONG_NOTE, [OVERALL]: LONG_NOTE },
    others,
    caps: { change: true, notes: true, score: true },
    sim: { replacements: { [MOCK_ME]: replacementsFor([MOCK_ME, 'md']), md: replacementsFor([MOCK_ME, 'md']) }, failSave: false },
  };
}

/**
 * The mock result for a slot id and a `?demo=` value (mock mode only). `error` and `failed` are a failed load; `empty` has
 * no questions and nobody paired; `board` is the view of a board member without admin rights (on someone else's interview
 * the link and notes are hidden); `failsave` refuses every note save; `stress` the longest names and notes.
 */
export function mockInterviewPage(slotId: string, demo?: string): InterviewPageResult {
  if (demo === 'error' || demo === 'failed') return { state: 'failed' };
  const v = mockInterviewPageView(slotId);
  if (!v) return { state: 'missing' };
  if (demo === 'stress') return { state: 'ok', view: stress(v) };
  if (demo === 'empty') {
    return { state: 'ok', view: { ...v, pair: [], groups: [], link: null, mine: {}, others: {}, caps: { change: false, notes: true, score: false }, sim: { replacements: {}, failSave: false } } };
  }
  if (demo === 'board') {
    const mine = v.pair.some((p) => p.me);
    return {
      state: 'ok',
      view: {
        ...v,
        isAdmin: false,
        canRead: mine,
        link: mine ? v.link : null,
        linkHidden: !mine && v.link !== null,
        mine: mine ? v.mine : {},
        others: mine ? v.others : {},
        caps: { change: false, notes: mine, score: mine },
      },
    };
  }
  if (demo === 'failsave') return { state: 'ok', view: { ...v, sim: { ...(v.sim as NonNullable<InterviewPageView['sim']>), failSave: true } } };
  return { state: 'ok', view: v };
}
