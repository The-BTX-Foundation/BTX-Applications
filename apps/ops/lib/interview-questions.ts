// Scholarships > Interviews > Interview questions: the cycle's questions grouped by scoring criterion, then "To close"
// (not scored). LIVE: `interview_questions` (lib/interview-flow-db.ts) and `rubric_criteria`. MOCK (no Supabase env):
// the 12 starter questions in mock/interview-flow.ts, kept in the page's own state.
import { hasSupabaseEnv } from '@btx/data';
import { currentStaffId } from './me';
import { currentCycle, readInterviews, readStaff, sessionRole, type Db } from './pairing-db';
import { readQuestions } from './interview-flow-db';
import { rubricFor } from './sch-live';
import { whenLine } from './interview-times';
import { groupQuestions, type QuestionGroup } from './question-groups';
import { sessionClient } from './supabase-server';
import { FLOW_BOOKED, FLOW_CYCLE, STARTER_QUESTIONS } from '@/mock/interview-flow';
import { RUBRIC } from '@/mock/scores';
import { staffById } from '@/mock/staff';

export type { QuestionRow, QuestionGroup } from './question-groups';
export type NextInterview = { whenLine: string; code: string; applicant: string; withName: string };

export type QuestionsData = {
  cycleId: string | null;
  /** "Fall 2026 Legacy Scholarship · grouped by the scoring rubric". */
  sub: string;
  groups: QuestionGroup[];
  isAdmin: boolean;
  /** The signed-in person's next booked interview, if they have one. */
  next: NextInterview | null;
  failed: boolean;
  source: 'live' | 'mock';
};

const fail = (source: 'live' | 'mock'): QuestionsData => ({ cycleId: null, sub: '', groups: [], isAdmin: false, next: null, failed: true, source });

// Loads the questions page. ?demo=empty (mock mode) draws the empty state; ?demo=error the "didn't load" state.
export async function loadQuestions(opts: { forceError?: boolean; demo?: string } = {}): Promise<QuestionsData> {
  const me = await currentStaffId();
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return fail('mock');
    const questions = opts.demo === 'empty' ? [] : STARTER_QUESTIONS.map((q, i) => ({ id: `mock-q-${i + 1}`, criterionKey: q.key, text: q.text }));
    const mine = FLOW_BOOKED.find((b) => me !== null && b.pair.includes(me));
    const other = mine ? staffById(mine.pair.find((id) => id !== me) ?? '') : undefined;
    return {
      cycleId: null,
      sub: `${FLOW_CYCLE.term} ${FLOW_CYCLE.award} · grouped by the scoring rubric`,
      groups: groupQuestions(RUBRIC, questions),
      isAdmin: opts.demo !== 'board',
      next: mine && other ? { whenLine: whenLine(mine.startsAt), code: mine.code, applicant: mine.applicant, withName: other.display_name } : null,
      failed: false,
      source: 'mock',
    };
  }
  try {
    const client = (await sessionClient()) as unknown as Db;
    const cycle = await currentCycle(client);
    if (!cycle) return { ...fail('live'), failed: false, sub: 'No open cycle' };
    const [rubric, qs, auth, head, iv, staff] = await Promise.all([
      rubricFor(client as never, cycle.id),
      readQuestions(client, cycle.id),
      sessionRole(client),
      client.from('cycles').select('term, award_name').eq('id', cycle.id).maybeSingle(),
      readInterviews(client, cycle.id),
      readStaff(client),
    ]);
    if (!qs.ok || head.error) throw new Error('read failed');
    const names = new Map(staff.map((s) => [s.userId, s.name]));
    const now = Date.now();
    const mine = iv.booked
      .filter((b) => Date.parse(b.startsAt) > now)
      .map((b) => ({ b, p: iv.pairs.get(b.slotId) }))
      .find((x) => x.p && (x.p.a === auth.id || x.p.b === auth.id));
    const otherId = mine?.p ? (mine.p.a === auth.id ? mine.p.b : mine.p.a) : null;
    const name = [head.data?.term, head.data?.award_name].filter(Boolean).join(' ');
    return {
      cycleId: cycle.id,
      sub: `${name ? `${name} · ` : ''}grouped by the scoring rubric`,
      groups: groupQuestions(rubric, qs.questions),
      isAdmin: auth.role === 'admin',
      next: mine && otherId ? { whenLine: whenLine(mine.b.startsAt), code: mine.b.code, applicant: mine.b.applicant, withName: names.get(otherId) ?? 'the other interviewer' } : null,
      failed: false,
      source: 'live',
    };
  } catch {
    return fail('live');
  }
}
