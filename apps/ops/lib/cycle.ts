// The cycle overview as the page uses it. REAL (live mode): the published cycle row (`cycles`: opens_at, closes_at,
// interview_start, interview_end, decision_date, award_name, status) and the number of submitted applications. MOCK
// (mock/cycle.ts): the three schedule dates the table has no column for, the checklist and the chat. In mock mode every
// field comes from the sample.
import { hasSupabaseEnv } from '@btx/data';
import { dateOnlyLabel, shortDate } from './format';
import { sessionClient } from './supabase-server';
import { MOCK_CYCLE, MOCK_SCHEDULE } from '@/mock/cycle';
import { MOCK_NOW } from '@/mock/applicants';

export type Phase = { n: number; label: string; short: string; dates: string; state: 'done' | 'now' | 'up' };

export type CycleOverview = {
  title: string;
  sub: string;
  phases: Phase[];
  /** The label of the phase that is happening now ("Interviews"), for the checklist header. */
  nowLabel: string;
  /** Phone only: the sub line ("Scholarships · Legacy · open · 18 applicants"), "Now: ..." and "Next: ..." lines. */
  phoneSub: string;
  nowLine: string;
  nextLine: string;
  failed: boolean;
};

// An Eastern-time calendar date ("2026-08-17") from a timestamp.
function easternIso(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));
}

// Works out each phase's state from its start and end ("2026-09-14" strings) and today.
function phaseState(start: string | null, end: string | null, today: string): Phase['state'] {
  if (end && end < today) return 'done';
  if (start && start <= today) return 'now';
  return 'up';
}

// Builds the overview from the raw dates.
function build(d: {
  title: string;
  award: string | null;
  status: string;
  applicants: number;
  open: string | null;
  close: string | null;
  iStart: string | null;
  iEnd: string | null;
  decision: string | null;
  today: string;
}): CycleOverview {
  const range = (a: string | null, b: string | null) => (a && b ? `${shortDate(a)} - ${shortDate(b)}` : 'Not set');
  const one = (a: string | null) => (a ? dateOnlyLabel(a) : 'Not set');
  const raw: { label: string; short: string; dates: string; start: string | null; end: string | null }[] = [
    { label: 'Applications', short: 'Apply', dates: range(d.open, d.close), start: d.open, end: d.close },
    { label: 'Interviews', short: 'Interview', dates: range(d.iStart, d.iEnd), start: d.iStart, end: d.iEnd },
    { label: 'Scores due', short: 'Scores', dates: one(MOCK_SCHEDULE.scoresDue), start: d.iEnd, end: MOCK_SCHEDULE.scoresDue },
    { label: 'Selection meeting', short: 'Select', dates: one(MOCK_SCHEDULE.selectionMeeting), start: MOCK_SCHEDULE.scoresDue, end: MOCK_SCHEDULE.selectionMeeting },
    { label: 'Award announced', short: 'Award', dates: one(d.decision), start: MOCK_SCHEDULE.selectionMeeting, end: d.decision },
    { label: 'Funds sent', short: 'Funds', dates: one(MOCK_SCHEDULE.fundsSent), start: d.decision, end: MOCK_SCHEDULE.fundsSent },
  ];
  // The first phase that is not finished is "now" (only phases 1 and 2 show Done / Now words in the design).
  let nowSeen = false;
  const phases: Phase[] = raw.map((r, i) => {
    let state = phaseState(r.start, r.end, d.today);
    if (state === 'now') {
      if (nowSeen) state = 'up';
      nowSeen = true;
    }
    return { n: i + 1, label: r.label, short: r.short, dates: r.dates, state };
  });
  const now = phases.find((p) => p.state === 'now');
  // The phone's two sentences: where the cycle is now (with the days left in that phase) and what follows.
  const nowRaw = raw[phases.findIndex((p) => p.state === 'now')];
  const left = nowRaw?.end ? Math.round((Date.parse(nowRaw.end) - Date.parse(d.today)) / 86_400_000) : null;
  const nowLine = now ? `Now: ${now.label.toLowerCase()}${nowRaw?.end ? `, to ${dateOnlyLabel(nowRaw.end)}` : ''}${left !== null && left >= 0 ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}` : 'Not started';
  const after = phases.filter((p) => p.state === 'up');
  // the phone's wording: "scores due", "selection meeting", "award", "funds sent"
  const word = (p: Phase) => (p.label === 'Award announced' ? 'award' : p.label.toLowerCase());
  const phrase = (p: Phase) => `${word(p)} ${p.dates}`;
  const nextLine = after.length ? `Next: ${after.slice(0, 4).map(phrase).join(', ')}` : '';
  return {
    phoneSub: `Scholarships · ${(d.award ?? 'Scholarship').replace(/ Scholarship$/, '')} · ${d.status} · ${d.applicants} applicants`,
    nowLine,
    nextLine,
    title: d.title,
    sub: `${d.award ?? 'Scholarship'} · ${d.status} · ${d.applicants} applicants`,
    phases,
    nowLabel: now?.label ?? 'Not started',
    failed: false,
  };
}

// Loads the overview for the published cycle (as the signed-in person; staff may read every cycle row).
export async function loadCycle(opts: { forceError?: boolean } = {}): Promise<CycleOverview> {
  const empty: CycleOverview = { title: '', sub: '', phases: [], nowLabel: '', phoneSub: '', nowLine: '', nextLine: '', failed: true };
  if (opts.forceError) return empty;
  if (!hasSupabaseEnv()) {
    const c = MOCK_CYCLE;
    return build({
      title: c.title,
      award: c.awardName,
      status: c.status,
      applicants: c.applicants,
      open: c.applicationsOpen,
      close: c.applicationsClose,
      iStart: c.interviewStart,
      iEnd: c.interviewEnd,
      decision: c.decisionDate,
      today: MOCK_NOW.slice(0, 10),
    });
  }
  try {
    const client = await sessionClient();
    const { data: c, error } = await client
      .from('cycles')
      .select('id, term, status, award_name, opens_at, closes_at, interview_start, interview_end, decision_date')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!c) return { title: 'No open cycle', sub: 'Nothing is published yet', phases: [], nowLabel: '', phoneSub: 'Nothing is published yet', nowLine: '', nextLine: '', failed: false };
    // RLS: staff may count submitted applications (applications_select_staff).
    const { count, error: e2 } = await client.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', c.id).eq('status', 'submitted');
    if (e2) throw e2;
    return build({
      title: `${c.term} cycle`,
      award: c.award_name,
      status: c.status === 'published' ? 'open' : c.status,
      applicants: count ?? 0,
      open: c.opens_at ? easternIso(c.opens_at) : null,
      close: c.closes_at ? easternIso(c.closes_at) : null,
      iStart: c.interview_start,
      iEnd: c.interview_end,
      decision: c.decision_date,
      today: easternIso(new Date().toISOString()),
    });
  } catch {
    return empty;
  }
}
