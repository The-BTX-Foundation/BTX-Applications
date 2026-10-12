// The cycle overview as the page uses it. Live mode reads the published cycle row (`cycles`), the number of submitted
// applications through the blind `application_reviews` view (admins, board members and reviewers can all read it; only
// admins may read the `applications` table), and the cycle's checklists and tasks. The three schedule dates the table
// has no column for (scores due, selection meeting, funds sent) read "Not set". In mock mode every field comes from the
// Figma sample (mock/cycle.ts). The logic is in cycle-core.ts (pure, tested).
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { read, profiles } from './money-db';
import { build, buildChecklist, easternIso, type CycleOverview } from './cycle-core';
import { MOCK_CHECKLIST, MOCK_CYCLE, MOCK_SCHEDULE } from '@/mock/cycle';
import { MOCK_NOW } from '@/mock/applicants';

export type { CycleOverview, Phase, CycleChecklist } from './cycle-core';

const NO_SCHEDULE = { scoresDue: null, selectionMeeting: null, fundsSent: null };

// Loads the overview for the published cycle (as the signed-in person; staff may read every cycle row).
export async function loadCycle(opts: { forceError?: boolean } = {}): Promise<CycleOverview> {
  const empty: CycleOverview = { title: '', sub: '', phases: [], nowLabel: '', phoneSub: '', nowLine: '', nextLine: '', failed: true };
  if (opts.forceError) return empty;
  if (!hasSupabaseEnv()) {
    const c = MOCK_CYCLE;
    return {
      ...build({
        title: c.title,
        award: c.awardName,
        status: c.status,
        applicants: c.applicants,
        open: c.applicationsOpen,
        close: c.applicationsClose,
        iStart: c.interviewStart,
        iEnd: c.interviewEnd,
        decision: c.decisionDate,
        schedule: MOCK_SCHEDULE,
        today: MOCK_NOW.slice(0, 10),
      }),
      checklist: { done: MOCK_CHECKLIST.done, total: MOCK_CHECKLIST.total, groups: MOCK_CHECKLIST.groups },
    };
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
    if (!c) return { title: 'No open cycle', sub: 'Nothing is published yet', phases: [], nowLabel: '', phoneSub: 'Nothing is published yet', nowLine: '', nextLine: '', failed: false, checklist: { done: 0, total: 0, groups: [] } };
    // Blind review: board members and reviewers cannot read `applications`; the `application_reviews` view lists the
    // submitted ones for every staff role, so the count works for all of them.
    const reviews = client as unknown as { from: (t: string) => { select: (c: string, o: { count: 'exact'; head: true }) => { eq: (c: string, v: unknown) => PromiseLike<{ count: number | null; error: unknown }> } } };
    const { count, error: e2 } = await reviews.from('application_reviews').select('id', { count: 'exact', head: true }).eq('cycle_id', c.id);
    if (e2) throw e2;
    const today = easternIso(new Date().toISOString());
    const lists = await read('checklists', 'id, title', { eq: { cycle_id: c.id }, order: ['position', true] });
    const tasks = lists.length ? await read('tasks', 'id, title, type, note, due_on, status, assignee_group, checklist_id, position', { eq: { archived: false }, order: ['position', true] }) : [];
    const assignees = lists.length ? await read('task_assignees', 'task_id, user_id') : [];
    const people = lists.length ? await profiles() : new Map();
    return {
      ...build({
        title: `${c.term} cycle`,
        award: c.award_name,
        status: c.status === 'published' ? 'open' : c.status,
        applicants: count ?? 0,
        open: c.opens_at ? easternIso(c.opens_at) : null,
        close: c.closes_at ? easternIso(c.closes_at) : null,
        iStart: c.interview_start,
        iEnd: c.interview_end,
        decision: c.decision_date,
        schedule: NO_SCHEDULE,
        today,
      }),
      checklist: buildChecklist(lists, tasks, assignees, people, today),
    };
  } catch {
    return empty;
  }
}
