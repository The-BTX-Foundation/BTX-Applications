// Scholarships > Scoring: the signed-in scorer's queue, the rubric, their picks and the interview notes.
// LIVE: `rubric_criteria`, `scores`, `score_private_notes`, `interview_summaries`, the pairings and `applications`
// (code and name: every staff member sees names, D2; see live() below). MOCK mode (no Supabase env): mock/scores.ts and mock/staff.ts.
import { hasSupabaseEnv } from '@btx/data';
import { dateOnlyLabel, dayLabel, timeLabel } from './format';
import { isTestApplication } from './test-application';
import { loadApplicants, type ApplicantRow } from './applicants';
import { shortAwardName, weightedScore } from './sch-logic';
import { applicationRows, db, interviewsFor, publishedCycle, rubricFor, scoreProgress, staffNames, summariesFor, visibleScores, whoAmI, type Interview } from './sch-live';
import { MOCK_SCHEDULE } from '@/mock/cycle';
import { STARTER_QUESTIONS } from '@/mock/interview-flow';
import { readQuestions } from './interview-flow-db';
import type { Db } from './pairing-db';
import { CYCLE_AVERAGE, QUEUE_CODES, RUBRIC, sheetFixture, weighted, type Quote } from '@/mock/scores';
import { staffById } from '@/mock/staff';

export type Criterion = { key: string; name: string; weight: number; avg: string };

export type Sheet = {
  applicationId: string;
  code: string;
  /** The applicant's full name. */
  name: string;
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
  /** A board member's Portal test application (shown as a "Board test" label). */
  test?: boolean;
};

export type ScoringData = {
  /** "3 to score by Sun Oct 11 · ...". */
  sub: string;
  criteria: Criterion[];
  /** The interview questions for each criterion (by key), shown beside its score inputs. Empty when the cycle has none. */
  questions?: Record<string, string[]>;
  /** "points" prints "20 points", "percent" prints "20%" (the stress frame). */
  weightStyle: 'points' | 'percent';
  sheets: Sheet[];
  /** Everyone still to score when the queue shows only a few (stress: "Show all 120"). */
  queueTotal: number;
  /** True when the scorecard is shown without a queue first (phone). */
  failed: boolean;
  source: 'live' | 'mock';
};

function queueLine(picks: Record<string, number>, published: boolean, score: string | null, otherName: string, otherPublished: boolean, total = 6): string {
  const n = Object.keys(picks).length;
  const first = otherName.split(' ')[0];
  if (published) return otherPublished ? `${score ?? ''}, both published` : `${score ?? ''}, waiting on ${otherName}`;
  if (n > 0) return `Draft, ${n} of ${total}`;
  return otherPublished ? `Not started, ${first} published` : 'Not started';
}

// Builds a sheet for an applicant (real row or fixture) in mock or live mode.
function sheetFor(row: Pick<ApplicantRow, 'id' | 'code' | 'name' | 'applied' | 'interviewLine' | 'test'>): Sheet {
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
    name: row.name,
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
    test: row.test,
  };
}

const criteria = (names?: string[]): Criterion[] =>
  RUBRIC.map((c, i) => ({ key: c.key, name: names?.[i] ?? c.name, weight: c.weight, avg: CYCLE_AVERAGE[c.key].toFixed(1) }));

// The due date is a mock schedule date; live mode has no scores-due setting yet, so it says no date.
const subLine = (n: number, due: string) => `${n} to score${due ? ` by ${due}` : ''} · scores stay private until both interviewers publish`;

// The stress frame's data (Figma "Scholarships > Scoring, stress"): 120 to score, long names, title-case criteria
// names, percent weights, a pick of 1 and a pick of 5. Shown with ?demo=stress.
function stress(): ScoringData {
  const base = (over: Partial<Sheet> & Pick<Sheet, 'code' | 'name' | 'queueLine'>): Sheet => ({
    applicationId: `stress-${over.code}`,
    cycleLine: 'Fall 2026, Legacy cycle. Applied Wed Sep 30. Video interview Thu Dec 31, 24 min.',
    phoneLine: 'Interview Thu Dec 31, 24 min',
    picks: {},
    published: false,
    score: null,
    draftSavedAt: null,
    otherName: 'Dorian Sutton',
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
      base({ code: 'APP-2026-00120', name: 'Adaeze-Grace Okonkwo-Fitzgerald', picks: { community: 1, resilience: 5, leadership: 4, communication: 4 }, draftSavedAt: '9:14 AM', summary: fx.summary, quotes: fx.quotes, queueLine: 'Draft, 4 of 6, 2.4 so far' }),
      base({ code: 'APP-2026-00012', name: 'Tariq Wells', queueLine: 'Not started, Charlie published 1.0', otherName: 'Charlie Gaines' }),
      base({ code: 'APP-2026-00119', name: 'Jean-Marc Abernathy-Oyelaran', queueLine: 'Not started', otherPublished: false }),
      base({ code: 'APP-2026-00004', name: 'Naomi Brooks', picks: { community: 5, resilience: 5, leadership: 5, financial: 5, communication: 5, passion: 5 }, published: true, score: '5.0', otherName: 'Camila Keane', otherPublished: false, queueLine: '5.0, waiting on Camila Keane' }),
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
    const questions: Record<string, string[]> = {};
    for (const q of STARTER_QUESTIONS) if (q.key) (questions[q.key] ??= []).push(q.text);
    return { sub: subLine(sheets.filter((s) => !s.published).length, due), criteria: criteria(), questions, weightStyle: 'points', sheets, queueTotal: sheets.filter((s) => !s.published).length, failed: false, source: 'mock' };
  }
  try {
    return await live();
  } catch {
    return { sub: '', criteria: [], weightStyle: 'points', sheets: [], queueTotal: 0, failed: true, source: 'live' };
  }
}

// Live mode: the queue is every application the signed-in person interviews (they are one of the pair on its active
// booking) whose interview has started. The rubric is the cycle's `rubric_criteria`; the picks, draft and published
// state are their own `scores` row; the private note is their `score_private_notes` row; the notes are the shared
// `interview_summaries`. Whether the other interviewer published comes from score_progress().
async function live(): Promise<ScoringData> {
  const client = await db();
  const me = await whoAmI(client);
  if (!me) throw new Error('not staff');
  const cycle = await publishedCycle(client);
  if (!cycle) return { sub: 'No open cycle', criteria: [], weightStyle: 'points', sheets: [], queueTotal: 0, failed: false, source: 'live' };
  const [rubric, apps] = await Promise.all([rubricFor(client, cycle.id), applicationRows(client, cycle.id)]);
  const ids = apps.map((a) => a.id);
  const [interviews, staff, scores, progress] = await Promise.all([
    interviewsFor(client, ids),
    staffNames(client),
    visibleScores(client, ids),
    scoreProgress(client, cycle.id),
  ]);
  const now = new Date();
  const mineApps = apps
    .map((a) => ({ a, iv: interviews.get(a.id) }))
    .filter((x) => x.iv && (x.iv.a === me.id || x.iv.b === me.id) && new Date(x.iv.startsAt) <= now)
    .sort((x, y) => (x.iv as Interview).startsAt.localeCompare((y.iv as Interview).startsAt));
  const queueIds = mineApps.map((x) => x.a.id);
  const [summaries, notes] = await Promise.all([summariesFor(client, queueIds), privateNotes(client, me.id, queueIds)]);

  // The cycle average per criterion: over every published score the reader can see (released ones and their own).
  const pub = scores.filter((s) => s.published);
  const crit: Criterion[] = rubric.map((c) => {
    const vals = pub.map((s) => s.criteria?.[c.key]).filter((v): v is number => typeof v === 'number');
    return { key: c.key, name: c.name, weight: c.weight, avg: vals.length ? (vals.reduce((n, v) => n + v, 0) / vals.length).toFixed(1) : '' };
  });
  const total = crit.length;
  const short = shortAwardName(cycle.award_name ?? 'Scholarship');

  const sheets: Sheet[] = mineApps.map(({ a, iv }) => {
    const v = iv as Interview;
    const otherId = v.a === me.id ? v.b : v.a;
    const otherName = (otherId && staff.get(otherId)?.display_name) || 'the other interviewer';
    const own = scores.find((s) => s.application_id === a.id && s.scorer_id === me.id);
    const otherPublished = Boolean(progress.some((p) => p.application_id === a.id && p.scorer_id === otherId && p.published));
    const picks = own?.criteria ?? {};
    const w = weightedScore(crit, picks);
    const score = w === null ? null : w.toFixed(1);
    const published = own?.published ?? false;
    const sm = summaries.get(a.id);
    const len = sm?.duration_minutes ? `, ${sm.duration_minutes} min` : '';
    return {
      applicationId: a.id,
      code: a.applicant_code ?? '—',
      name: a.full_name?.trim() || (a.applicant_code ?? '—'),
      cycleLine: `${cycle.term}, ${short} cycle. Applied ${dayLabel(a.submitted_at)}. Video interview ${dayLabel(v.startsAt)}${len}.`,
      phoneLine: `Interview ${dayLabel(v.startsAt)}${len}`,
      picks,
      published,
      score,
      draftSavedAt: own && !published ? timeLabel(own.updated_at) : null,
      otherName,
      otherPublished,
      summary: sm?.summary ?? null,
      quotes: (sm?.quotes ?? []).filter((q) => q.text).map((q) => ({ criterion: q.criterion ?? '', at: q.at ?? '', text: q.text ?? '' })),
      privateNote: notes.get(a.id) ?? '',
      queueLine: queueLine(picks, published, score, otherName, otherPublished, total),
      test: isTestApplication(a.terpmail),
    };
  });
  const open = sheets.filter((s) => !s.published).length;
  // The cycle's interview questions by criterion; a failed read only means none are shown.
  const questions: Record<string, string[]> = {};
  const qs = await readQuestions(client as unknown as Db, cycle.id).catch(() => null);
  if (qs?.ok) for (const q of qs.questions) if (q.criterionKey) (questions[q.criterionKey] ??= []).push(q.text);
  return { sub: subLine(open, ''), criteria: crit, questions, weightStyle: 'points', sheets, queueTotal: open, failed: false, source: 'live' };
}

// The signed-in person's private notes (only the writer can read them).
async function privateNotes(client: Awaited<ReturnType<typeof db>>, meId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.from('score_private_notes').select('application_id, note').eq('user_id', meId).in('application_id', ids);
  if (error) throw error;
  return new Map(((data ?? []) as { application_id: string; note: string }[]).map((n) => [n.application_id, n.note]));
}
