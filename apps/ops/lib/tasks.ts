// The Tasks page's data. Types mirror the draft Ops Hub schema (tasks, task_types, task_assignees, task_comments,
// checklists, staff_profiles; see supabase/migrations/20261010120000_ops_hub.sql in the ops-schema worktree).
// MOCK (mock/tasks.ts): everything, until those tables exist. LIVE (below): the core `tasks` query is written but NOT
// TESTED; the derived parts (counts, comment lists, approval detail) fall back to the mock shape and are marked TODO.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
import { MOCK_NOW } from '@/mock/applicants';
import { PEOPLE, SEEDS, STRESS_SEEDS, DONE, COUNTS, STRESS_COUNTS, COMMENTS, STRESS_COMMENTS } from '@/mock/tasks';

export * from './tasks-shared';
import { daysBetween, decorate, type TaskSeed, type TaskStatus, type TasksData } from './tasks-shared';

const AREAS = [
  { slug: 'scholarships', name: 'Scholarships' },
  { slug: 'money', name: 'Money' },
  { slug: 'programs', name: 'Programs' },
  { slug: 'outreach', name: 'Outreach' },
];

const empty: TasksData = {
  failed: true,
  mode: 'mock',
  today: '',
  me: '',
  people: [],
  areas: [],
  tasks: [],
  comments: {},
  counts: { mine: 0, team: 0, approvals: 0, open: 0, done_week: 0 },
  done: [],
};

// Loads the page's data. `demo` is the ?demo= value: "error" returns the failed shape, "stress" the long-text sample.
export async function loadTasks({ demo }: { demo?: string } = {}): Promise<TasksData> {
  if (demo === 'error') return empty;
  const today = MOCK_NOW.slice(0, 10);
  const stress = demo === 'stress';
  const mock: TasksData = {
    failed: false,
    mode: 'mock',
    today,
    me: 'dm',
    people: PEOPLE,
    areas: AREAS,
    tasks: (stress ? STRESS_SEEDS : SEEDS).map((s) => decorate(s, today)),
    comments: stress ? STRESS_COMMENTS : COMMENTS,
    counts: stress ? STRESS_COUNTS : COUNTS,
    done: DONE,
  };
  if (!hasSupabaseEnv()) return mock;
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    // The generated types do not know these tables yet, so the client is used through a loose shape.
    const client = (await sessionClient()) as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: unknown) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
        };
      };
    };
    const { data, error } = await client
      .from('tasks')
      .select('id, title, type, area, status, due_on, checklist_id')
      .eq('archived', false)
      .order('due_on', { ascending: true });
    if (error) throw error;
    // TODO (live): join task_assignees, task_types.label, areas.name, checklists.title and task_comments counts, derive
    // `bucket`, `mine`/`team` and the Counts; until then the people, comments, counts and approval detail are the mock's.
    const rows = (data ?? []).map((r): TaskSeed => {
      const area = AREAS.find((a) => a.slug === r.area);
      const due = (r.due_on as string | null) ?? null;
      const diff = due ? daysBetween(today, due) : 99;
      return {
        id: String(r.id),
        title: String(r.title),
        type: String(r.type),
        type_label: String(r.type).replace(/^./, (c) => c.toUpperCase()),
        area: String(r.area),
        area_name: area?.name ?? String(r.area),
        status: r.status as TaskStatus,
        due_on: due,
        bucket: diff < 0 ? 'late' : diff <= 6 ? 'this_week' : diff <= 13 ? 'next_week' : 'later',
        owner_id: null,
        context: null,
        mine: false,
        team: true,
        comment_count: 0,
      };
    });
    return { ...mock, mode: 'live', tasks: rows.filter((r) => r.status === 'open' || r.status === 'in_progress').map((s) => decorate(s, today)) };
  } catch {
    return empty;
  }
}
