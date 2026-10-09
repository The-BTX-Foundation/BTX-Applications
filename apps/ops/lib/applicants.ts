// The Applicants list as the page uses it: one flat row per submitted application, plus the extra detail the Figma
// frames show. REAL columns come from `applications`, `bookings` and `interview_slots`. Fields the schema does not have
// yet (scores, who interviews, the stage a review is at, the interview summary, the pairing) come from the MOCK module
// mock/scoring.ts, looked up by applicant code, so they can be swapped for real tables when the Ops Hub tables exist.
import { hasSupabaseEnv } from '@btx/data';
import { dayLabel, dottedInitials, timeLabel } from './format';
import { sessionClient } from './supabase-server';
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
};

export type ApplicantsResult = {
  cycleLabel: string;
  rows: ApplicantRow[];
  /** True when the data could not be loaded (shows the "didn't load" card). */
  failed: boolean;
  source: 'live' | 'mock';
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

// Loads the submitted applications of the published cycle. Row-level security does the gating: a staff account may read
// submitted applications (applications_select_staff), bookings (bookings_select_staff) and interview slots; anyone else
// gets no rows. A failed query returns failed: true instead of throwing.
export async function loadApplicants(opts: { forceError?: boolean } = {}): Promise<ApplicantsResult> {
  if (!hasSupabaseEnv()) {
    return { cycleLabel: MOCK_CYCLE_LABEL, rows: opts.forceError ? [] : mockRows(), failed: Boolean(opts.forceError), source: 'mock' };
  }
  try {
    const client = await sessionClient();
    // The published cycle (staff can also see drafts, so ask for published explicitly).
    const cycle = await client.from('cycles').select('id, term').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cycle.error) throw cycle.error;
    if (!cycle.data) return { cycleLabel: 'No open cycle', rows: [], failed: false, source: 'live' };

    const apps = await client
      .from('applications')
      .select('id, applicant_code, full_name, submitted_at')
      .eq('cycle_id', cycle.data.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: true });
    if (apps.error) throw apps.error;

    // Interview times: each application's active booking and its slot.
    const ids = (apps.data ?? []).map((a) => a.id);
    const times = new Map<string, string>();
    if (ids.length > 0) {
      const bookings = await client
        .from('bookings')
        .select('application_id, interview_slots(starts_at)')
        .eq('status', 'active')
        .in('application_id', ids);
      if (bookings.error) throw bookings.error;
      for (const b of bookings.data ?? []) {
        const slot = Array.isArray(b.interview_slots) ? b.interview_slots[0] : b.interview_slots;
        if (slot?.starts_at) times.set(b.application_id, slot.starts_at);
      }
    }

    const rows: ApplicantRow[] = (apps.data ?? []).map((a) => {
      const code = a.applicant_code ?? '—';
      const at = times.get(a.id);
      return {
        id: a.id,
        code,
        initials: dottedInitials(a.full_name),
        applied: dayLabel(a.submitted_at),
        interviewDay: at ? dayLabel(at) : '',
        interviewTime: at ? timeLabel(at) : '',
        interviewLine: at ? `${dayLabel(at)}, 24 min, video` : '',
        upcoming: at ? new Date(at) > new Date() : false,
        scoring: scoringFor(code, { interviewAt: at }),
        mock: false,
      };
    });
    return { cycleLabel: `${cycle.data.term} cycle`, rows, failed: false, source: 'live' };
  } catch {
    return { cycleLabel: '', rows: [], failed: true, source: 'live' };
  }
}
