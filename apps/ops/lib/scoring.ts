// Scholarships > Scoring: the signed-in scorer's queue, the rubric, their picks and the interview notes.
// REAL in live mode: which applicants have a finished interview (`applications`, `bookings`, `interview_slots`, through the
// Applicants loader). MOCK (mock/scores.ts, mock/staff.ts): the rubric, scores, notes and the other interviewer. When the
// Ops Hub tables exist, replace sheetFixture() with reads of `rubric_criteria`, `scores`, `interview_summaries` and
// `score_private_notes`; the page does not change.
import { hasSupabaseEnv } from '@btx/data';
import { dateOnlyLabel } from './format';
import { loadApplicants, type ApplicantRow } from './applicants';
import { MOCK_SCHEDULE } from '@/mock/cycle';
import { CYCLE_AVERAGE, QUEUE_CODES, RUBRIC, sheetFixture, weighted, type Quote } from '@/mock/scores';
import { staffById } from '@/mock/staff';

export type Criterion = { key: string; name: string; weight: number; avg: string };

export type Sheet = {
  applicationId: string;
  code: string;
  /** "A.O." */
  initials: string;
  /** Laptop line under the code: "Fall 2026, Legacy cycle. Applied Wed Sep 2. Video interview Sat Sep 26, 24 min." */
  cycleLine: string;
  /** Phone card line: "Interview Sat Sep 26, 24 min". */
  phoneLine: string;
  picks: Record<string, number>;
  published: boolean;
  /** Your own weighted score once you have picks ("3.7"). */
  score: string | null;
  draftSavedAt: string | null;
  otherName: string;
  otherPublished: boolean;
  summary: string | null;
  quotes: Quote[];
  privateNote: string;
  /** The queue row's second line ("Draft, 4 of 6"). */
  queueLine: string;
};

export type ScoringData = {
  /** "3 to score by Sun Oct 11 · ...". */
  sub: string;
  criteria: Criterion[];
  /** "points" prints "20 points", "percent" prints "20%" (the stress frame). */
  weightStyle: 'points' | 'percent';
  sheets: Sheet[];
  /** Everyone still to score when the queue shows only a few (stress: "Show all 120"). */
  queueTotal: number;
  /** True when the scorecard is shown without a queue first (phone). */
  failed: boolean;
  source: 'live' | 'mock';
};

const picked = (p: Record<string, number>) => RUBRIC.filter((c) => p[c.key]).length;

function queueLine(picks: Record<string, number>, published: boolean, score: string | null, otherName: string, otherPublished: boolean): string {
  const n = picked(picks);
  const first = otherName.split(' ')[0];
  if (published) return `${score ?? ''}, waiting on ${otherName}`;
  if (n > 0) return `Draft, ${n} of 6`;
  return otherPublished ? `Not started, ${first} published` : 'Not started';
}

// Builds a sheet for an applicant (real row or fixture) in mock or live mode.
function sheetFor(row: Pick<ApplicantRow, 'id' | 'code' | 'initials' | 'applied' | 'interviewLine'>): Sheet {
  const fx = sheetFixture(row.code);
  const other = fx ? staffById(fx.otherId) : undefined;
  const otherName = other?.display_name ?? 'the other interviewer';
  const picks = fx?.criteria ?? {};
  const w = weighted(picks);
  const score = w === null ? null : w.toFixed(1);
  const pub = fx?.published ?? false;
  const interview = row.interviewLine ? `Video interview ${row.interviewLine.replace(', video', '')}.` : '';
  return {
    applicationId: row.id,
    code: row.code,
    initials: row.initials,
    cycleLine: `Fall 2026, Legacy cycle. Applied ${row.applied}. ${interview}`.trim(),
    phoneLine: row.interviewLine ? `Interview ${row.interviewLine.replace(', video', '')}` : '',
    picks,
    published: pub,
    score,
    draftSavedAt: fx?.draftSavedAt ?? null,
    otherName,
    otherPublished: fx?.otherPublished ?? false,
    summary: fx?.summary ?? null,
    quotes: fx?.quotes ?? [],
    privateNote: fx?.privateNote ?? '',
    queueLine: queueLine(picks, pub, score, otherName, fx?.otherPublished ?? false),
  };
}

const criteria = (names?: string[]): Criterion[] =>
  RUBRIC.map((c, i) => ({ key: c.key, name: names?.[i] ?? c.name, weight: c.weight, avg: CYCLE_AVERAGE[c.key].toFixed(1) }));

const subLine = (n: number, due: string) => `${n} to score by ${due} · scores stay private until both interviewers publish`;

// The stress frame's data (Figma "Scholarships > Scoring, stress"): 120 to score, long initials, title-case criteria
// names, percent weights, a pick of 1 and a pick of 5. Shown with ?demo=stress.
function stress(): ScoringData {
  const base = (over: Partial<Sheet> & Pick<Sheet, 'code' | 'initials' | 'queueLine'>): Sheet => ({
    applicationId: `stress-${over.code}`,
    cycleLine: 'Fall 2026, Legacy cycle. Applied Wed Sep 30. Video interview Thu Dec 31, 24 min.',
    phoneLine: 'Interview Thu Dec 31, 24 min',
    picks: {},
    published: false,
    score: null,
    draftSavedAt: null,
    otherName: 'Darien Strachan',
    otherPublished: true,
    summary: null,
    quotes: [],
    privateNote: '',
    ...over,
  });
  const fx = sheetFixture('APP-2026-00011')!;
  return {
    sub: subLine(120, 'Thu Dec 31'),
    criteria: criteria(['Community Engagement and Values', 'Resilience and Problem-Solving', 'Leadership and Teamwork', 'Financial Need and Impact', 'Communication Skills', 'Passion and Motivation']),
    weightStyle: 'percent',
    queueTotal: 120,
    sheets: [
      base({ code: 'APP-2026-00120', initials: 'A-G.O.', picks: { community: 1, resilience: 5, leadership: 4, communication: 4 }, draftSavedAt: '9:14 AM', summary: fx.summary, quotes: fx.quotes, queueLine: 'Draft, 4 of 6, 2.4 so far' }),
      base({ code: 'APP-2026-00012', initials: 'T.W.', queueLine: 'Not started, Chariah published 1.0', otherName: 'Chariah Ghee' }),
      base({ code: 'APP-2026-00119', initials: 'J-M.A.', queueLine: 'Not started', otherPublished: false }),
      base({ code: 'APP-2026-00004', initials: 'N.B.', picks: { community: 5, resilience: 5, leadership: 5, financial: 5, communication: 5, passion: 5 }, published: true, score: '5.0', otherName: 'Cillisha Knights', otherPublished: false, queueLine: '5.0, waiting on Cillisha Knights' }),
    ],
    failed: false,
    source: 'mock',
  };
}

// Loads the scoring page. A failed query returns failed: true instead of throwing.
export async function loadScoring(opts: { forceError?: boolean; stress?: boolean } = {}): Promise<ScoringData> {
  const due = dateOnlyLabel(MOCK_SCHEDULE.scoresDue);
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { sub: '', criteria: [], weightStyle: 'points', sheets: [], queueTotal: 0, failed: true, source: 'mock' };
    if (opts.stress) return stress();
    const list = await loadApplicants();
    const rows = QUEUE_CODES.map((c) => list.rows.find((r) => r.code === c)).filter((r): r is ApplicantRow => Boolean(r));
    const sheets = rows.map(sheetFor);
    return { sub: subLine(sheets.filter((s) => !s.published).length, due), criteria: criteria(), weightStyle: 'points', sheets, queueTotal: sheets.filter((s) => !s.published).length, failed: false, source: 'mock' };
  }
  // Live mode: the applicants whose interview is done are the queue. Which of them the signed-in person interviews needs
  // `interview_pairings`, which does not exist yet, so every finished interview is listed.
  const list = await loadApplicants();
  if (list.failed) return { sub: '', criteria: [], weightStyle: 'points', sheets: [], queueTotal: 0, failed: true, source: 'live' };
  const rows = list.rows.filter((r) => r.interviewDay && !r.upcoming);
  const sheets = rows.map(sheetFor);
  return { sub: subLine(sheets.filter((s) => !s.published).length, due), criteria: criteria(), weightStyle: 'points', sheets, queueTotal: sheets.filter((s) => !s.published).length, failed: false, source: 'live' };
}
