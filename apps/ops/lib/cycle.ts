// The cycle overview as the page uses it. REAL (live mode): the published cycle row (`cycles`: opens_at, closes_at,
// interview_start, interview_end, decision_date, award_name, status), the number of submitted applications (counted
// through the blind view `application_reviews`, which admins and board members can both read), the selection meeting
// (a `calendar_events` row of kind selection_meeting for the cycle, when there is one) and the cycle checklist
// (`checklists` tied to the cycle, their steps are `tasks`). Scores due and funds sent have no column yet, so live mode
// shows "Not set" for them (O3). In mock mode every field comes from the Figma sample (mock/cycle.ts). The pure parts
// live in lib/cycle-build.ts.
import { hasSupabaseEnv } from '@btx/data';
import { buildChecklist, buildCycle, type ChecklistIn, type CycleOverview, type TaskIn } from './cycle-build';
import { sessionClient } from './supabase-server';
import { MOCK_CHECKLIST, MOCK_CYCLE, MOCK_SCHEDULE } from '@/mock/cycle';
import { MOCK_NOW } from '@/mock/applicants';

export type { CycleOverview, Phase } from './cycle-build';

// An Eastern-time calendar date ("2026-08-17") from a timestamp.
function easternIso(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ts));
}

// The Ops Hub tables are not in the generated database types, so those reads use this loose shape.
type Q = PromiseLike<{ data: unknown; error: unknown; count?: number | null }> & {
  select: (c: string, o?: { count?: 'exact'; head?: boolean }) => Q;
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  order: (c: string, o?: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Untyped = { from: (t: string) => Q };
type Row = Record<string, unknown>;

// The cycle's checklists and their steps (with owners), as the pure builder takes them.
async function checklistOf(c: Untyped, cycleId: string, today: string) {
  const l = await c.from('checklists').select('id, title, position').eq('cycle_id', cycleId).order('position');
  if (l.error) throw l.error;
  const lists: ChecklistIn[] = ((l.data ?? []) as Row[]).map((x) => ({ id: String(x.id), title: String(x.title), position: Number(x.position ?? 0) }));
  if (lists.length === 0) return buildChecklist([], [], today);
  const t = await c
    .from('tasks')
    .select('id, checklist_id, title, type, status, due_on, note, assignee_group, position, archived, task_assignees(staff_profiles!task_assignees_user_id_fkey(display_name, initials))')
    .in('checklist_id', lists.map((x) => x.id))
    .order('position');
  if (t.error) throw t.error;
  const tasks: TaskIn[] = ((t.data ?? []) as Row[])
    .filter((x) => !x.archived)
    .map((x) => ({
      id: String(x.id),
      checklistId: x.checklist_id ? String(x.checklist_id) : null,
      title: String(x.title),
      type: String(x.type ?? 'task'),
      status: String(x.status ?? 'open'),
      dueOn: (x.due_on as string | null) ?? null,
      note: (x.note as string | null) ?? null,
      group: (x.assignee_group as string | null) ?? null,
      position: Number(x.position ?? 0),
      people: ((x.task_assignees ?? []) as { staff_profiles: { display_name: string; initials: string } | null }[])
        .map((a) => a.staff_profiles)
        .filter((p): p is { display_name: string; initials: string } => !!p)
        .map((p) => ({ name: p.display_name, initials: p.initials })),
    }));
  return buildChecklist(lists, tasks, today);
}

// Loads the overview for the published cycle (as the signed-in person; staff may read every cycle row).
export async function loadCycle(opts: { forceError?: boolean } = {}): Promise<CycleOverview> {
  const emptyList = { done: 0, total: 0, groups: [] };
  const empty: CycleOverview = { title: '', sub: '', phases: [], nowLabel: '', phoneSub: '', nowLine: '', nextLine: '', checklist: emptyList, failed: true };
  if (opts.forceError) return empty;
  if (!hasSupabaseEnv()) {
    const c = MOCK_CYCLE;
    return buildCycle(
      {
        title: c.title,
        award: c.awardName,
        status: c.status,
        applicants: c.applicants,
        open: c.applicationsOpen,
        close: c.applicationsClose,
        iStart: c.interviewStart,
        iEnd: c.interviewEnd,
        scoresDue: MOCK_SCHEDULE.scoresDue,
        selection: MOCK_SCHEDULE.selectionMeeting,
        decision: c.decisionDate,
        fundsSent: MOCK_SCHEDULE.fundsSent,
        today: MOCK_NOW.slice(0, 10),
      },
      MOCK_CHECKLIST,
    );
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
    if (!c)
      return { title: 'No open cycle', sub: 'Nothing is published yet', phases: [], nowLabel: '', phoneSub: 'Nothing is published yet', nowLine: '', nextLine: '', checklist: emptyList, failed: false };
    const loose = client as unknown as Untyped;
    const today = easternIso(new Date().toISOString());
    // Blind review (D2): only admins read `applications`; the view returns submitted applications to all staff.
    const apps = await loose.from('application_reviews').select('id', { count: 'exact', head: true }).eq('cycle_id', c.id);
    if (apps.error) throw apps.error;
    // The selection meeting, when it is on the calendar.
    const ev = await loose.from('calendar_events').select('starts_at').eq('cycle_id', c.id).eq('kind', 'selection_meeting').order('starts_at').limit(1);
    if (ev.error) throw ev.error;
    const meeting = ((ev.data ?? []) as Row[])[0]?.starts_at as string | undefined;
    const checklist = await checklistOf(loose, c.id, today);
    return buildCycle(
      {
        title: /cycle$/i.test(c.term) ? c.term : `${c.term} cycle`,
        award: c.award_name,
        status: c.status === 'published' ? 'open' : c.status,
        applicants: apps.count ?? 0,
        open: c.opens_at ? easternIso(c.opens_at) : null,
        close: c.closes_at ? easternIso(c.closes_at) : null,
        iStart: c.interview_start,
        iEnd: c.interview_end,
        // O3: no column for these two yet.
        scoresDue: null,
        selection: meeting ? easternIso(meeting) : null,
        decision: c.decision_date,
        fundsSent: null,
        today,
      },
      checklist,
    );
  } catch {
    return empty;
  }
}
