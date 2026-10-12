// The Applicants list as the page uses it: one flat row per submitted application, plus the extra detail the Figma
// frames show. LIVE: the blind view `application_reviews`, `bookings`, `interview_slots`, `interview_pairings`,
// `staff_profiles`, `interview_summaries`, `scores`, score_progress() and, for admins only, `applications` (names and
// contact details). MOCK mode (no Supabase env) uses mock/applicants.ts and mock/scoring.ts.
import { hasSupabaseEnv } from '@btx/data';
import { dateOnlyLabel, dayLabel, timeLabel } from './format';
import { shortAwardName, standing, type PairPerson } from './sch-logic';
import {
  blindRows,
  db,
  identityFor,
  interviewsFor,
  publishedCycle,
  rubricFor,
  scoreProgress,
  selectionMeeting,
  staffNames,
  summariesFor,
  visibleScores,
  whoAmI,
} from './sch-live';
import { MOCK_APPLICANTS, MOCK_CYCLE_LABEL, MOCK_NOW } from '@/mock/applicants';
import { scoringFor, type Scoring } from '@/mock/scoring';

export type ApplicantRow = {
  /** The application's id (a uuid; a made-up id in mock mode). */
  id: string;
  code: string;
  initials: string;
  applied: string;
  interviewDay: string;
  interviewTime: string;
  /** Interview as one line for the detail panel ("Sat Sep 26, 24 min, video"). */
  interviewLine: string;
  /** True when the interview is still ahead (the list then shows its time under the day). */
  upcoming: boolean;
  scoring: Scoring;
  /** Only mock rows have a made-up id; it tells the page not to ask storage for files. */
  mock: boolean;
  /** Admins only (blind review): the applicant's name, Terpmail and phone. */
  fullName?: string;
  email?: string;
  phone?: string;
};

export type ApplicantsResult = {
  cycleLabel: string;
  rows: ApplicantRow[];
  /** True when the data could not be loaded (shows the "didn't load" card). */
  failed: boolean;
  source: 'live' | 'mock';
  /** The detail panel's line under the code ("Fall 2026 · Legacy cycle"). */
  cycleSub: string;
  /** Export is for admins only (O1). */
  canExport: boolean;
  /** Admins see names and contact details in the detail panel; everyone else sees a code and initials. */
  showNames: boolean;
};

// Builds the rows for mock mode (no Supabase env): the 18 sample applicants from the Figma frames.
function mockRows(): ApplicantRow[] {
  return MOCK_APPLICANTS.map((a) => ({
    id: `mock-${a.code}`,
    code: a.code,
    initials: a.initials,
    applied: dayLabel(a.appliedAt),
    interviewDay: a.interviewAt ? dayLabel(a.interviewAt) : '',
    interviewTime: a.interviewAt ? timeLabel(a.interviewAt) : '',
    interviewLine: a.interviewAt ? `${dayLabel(a.interviewAt)}, 24 min, video` : '',
    upcoming: a.interviewAt ? new Date(a.interviewAt) > new Date(MOCK_NOW) : false,
    scoring: scoringFor(a.code),
    mock: true,
  }));
}

// Loads the submitted applications of the published cycle, as the signed-in person. Every role reads the blind view
// `application_reviews` (code and initials); an admin also gets names and contact details from `applications`. Where
// each application stands comes from the interview pairings, the reader's own score, everyone's progress (admin and
// board only, without values) and the score summary (both scores, once both interviewers publish). A failed query
// returns failed: true instead of throwing.
export async function loadApplicants(opts: { forceError?: boolean } = {}): Promise<ApplicantsResult> {
  if (!hasSupabaseEnv()) {
    return { cycleLabel: MOCK_CYCLE_LABEL, rows: opts.forceError ? [] : mockRows(), failed: Boolean(opts.forceError), source: 'mock', cycleSub: 'Fall 2026 · Legacy cycle', canExport: true, showNames: false };
  }
  try {
    const client = await db();
    const me = await whoAmI(client);
    if (!me) throw new Error('not staff');
    const cycle = await publishedCycle(client);
    if (!cycle) return { cycleLabel: 'No open cycle', rows: [], failed: false, source: 'live', cycleSub: '', canExport: me.role === 'admin', showNames: me.role === 'admin' };

    const apps = await blindRows(client, cycle.id);
    const ids = apps.map((a) => a.id);
    const [interviews, staff, summaries, scores, progress, identity, meeting] = await Promise.all([
      interviewsFor(client, ids),
      staffNames(client),
      summariesFor(client, ids),
      visibleScores(client, ids),
      scoreProgress(client, me, cycle.id),
      identityFor(client, me, ids),
      selectionMeeting(client, cycle.id),
    ]);
    const rubric = await rubricFor(client, cycle.id);
    const now = new Date();
    const person = (id: string | null): PairPerson | null => {
      if (!id) return null;
      const s = staff.get(id);
      return { id, name: s?.display_name ?? 'Interviewer', initials: s?.initials ?? '?' };
    };

    const rows: ApplicantRow[] = apps.map((a) => {
      const code = a.applicant_code ?? '—';
      const iv = interviews.get(a.id);
      const at = iv?.startsAt ?? null;
      const pair = [person(iv?.a ?? null), person(iv?.b ?? null)].filter((p): p is PairPerson => Boolean(p));
      const own = scores.find((s) => s.application_id === a.id && s.scorer_id === me.id) ?? null;
      const pubs = scores.filter((s) => s.application_id === a.id && s.published && s.weighted_score !== null);
      // Other people's scores are visible only once both interviewers published, so two visible = released.
      const released = pubs.length >= 2 ? { combined: Math.round((pubs.reduce((n, s) => n + (s.weighted_score as number), 0) / pubs.length) * 100) / 100 } : null;
      const sm = summaries.get(a.id);
      const id = identity.get(a.id);
      const minutes = sm?.duration_minutes ? `${sm.duration_minutes} min, ` : '';
      return {
        id: a.id,
        code,
        initials: a.initials ?? '—',
        applied: dayLabel(a.submitted_at),
        interviewDay: at ? dayLabel(at) : '',
        interviewTime: at ? timeLabel(at) : '',
        interviewLine: at ? `${dayLabel(at)}, ${minutes}video` : '',
        upcoming: at ? new Date(at) > now : false,
        scoring: standing({
          now,
          interviewAt: at,
          pair,
          meId: me.id,
          mine: own ? { criteriaCount: own.criteria_count, published: own.published, weighted: own.weighted_score } : null,
          progress: progress ? progress.filter((p) => p.application_id === a.id).map((p) => ({ scorerId: p.scorer_id, published: p.published })) : null,
          released,
          interviewSummary: sm?.summary ?? null,
          criteriaTotal: rubric.length || 6,
          selectionLabel: meeting ? dayLabel(meeting.starts_at) : '',
          awardLabel: cycle.decision_date ? dateOnlyLabel(cycle.decision_date) : '',
        }),
        mock: false,
        fullName: id?.full_name ?? undefined,
        email: id?.terpmail ?? undefined,
        phone: id?.phone ?? undefined,
      };
    });
    return { cycleLabel: `${cycle.term} cycle`, rows, failed: false, source: 'live', cycleSub: `${cycle.term} · ${shortAwardName(cycle.award_name ?? 'Scholarship')} cycle`, canExport: me.role === 'admin', showNames: me.role === 'admin' };
  } catch {
    return { cycleLabel: '', rows: [], failed: true, source: 'live', cycleSub: '', canExport: false, showNames: false };
  }
}
