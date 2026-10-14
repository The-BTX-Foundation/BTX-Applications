// The Tasks page's data. MOCK (mock/tasks.ts) when there is no Supabase env. LIVE: tasks, task_assignees, task_types,
// areas, checklists, task_comments, staff_profiles and, for approval tasks on a quarter plan's checklist,
// budget_quarter_plans / budget_quarter_plan_lines / budget_categories. Row-level security decides what comes back: a
// reviewer sees only the tasks assigned to them and no comments or checklists (those reads return no rows).
import { hasSupabaseEnv } from '@btx/data';
import { MOCK_NOW } from '@/mock/applicants';
import { PEOPLE, SEEDS, STRESS_SEEDS, DONE, COUNTS, STRESS_COUNTS, COMMENTS, STRESS_COMMENTS } from '@/mock/tasks';
import { looseClient, rows, whoAmI, type Loose } from './team-db';
import { easternToday } from './team-dates';

export * from './tasks-shared';
import { buildTasks, decorate, type TasksData, type TasksRaw } from './tasks-shared';

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
    const client = await looseClient();
    const { id: me, role } = await whoAmI(client);
    if (!me) return empty;
    const raw = await readTasksRaw(client);
    return { ...buildTasks(raw, me, easternToday()), failed: false, mode: 'live', canEdit: role === 'admin' || role === 'board' };
  } catch {
    return empty;
  }
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

// Reads every table the Tasks page (and Today) needs, as the signed-in person.
export async function readTasksRaw(client: Loose): Promise<TasksRaw> {
  const [tasks, assignees, types, areas, checklists, comments, people, plans, planLines, categories] = await Promise.all([
    rows(client, 'tasks', 'id, title, type, area, status, due_on, checklist_id, position, note, details, assignee_group, completed_at', { eq: { archived: false } }),
    rows(client, 'task_assignees', 'task_id, user_id'),
    rows(client, 'task_types', 'code, label'),
    rows(client, 'areas', 'slug, name, position', { order: ['position', true] }),
    rows(client, 'checklists', 'id, title, budget_plan_id'),
    rows(client, 'task_comments', 'id, task_id, author_id, body, created_at'),
    rows(client, 'staff_profiles', 'user_id, display_name, initials', { order: ['display_name', true] }),
    rows(client, 'budget_quarter_plans', 'id, year, quarter'),
    rows(client, 'budget_quarter_plan_lines', 'plan_id, category_id, amount_cents'),
    rows(client, 'budget_category_totals', 'category_id, name, year, budget_cents, spent_cents'),
  ]);
  return {
    tasks: tasks.map((t) => ({
      id: String(t.id),
      title: String(t.title),
      type: String(t.type),
      area: String(t.area),
      status: t.status as TasksRaw['tasks'][number]['status'],
      due_on: str(t.due_on),
      checklist_id: str(t.checklist_id),
      position: Number(t.position ?? 0),
      note: str(t.note),
      details: str(t.details),
      assignee_group: str(t.assignee_group),
      completed_at: str(t.completed_at),
    })),
    assignees: assignees.map((a) => ({ task_id: String(a.task_id), user_id: String(a.user_id) })),
    types: types.map((t) => ({ code: String(t.code), label: String(t.label) })),
    areas: areas.map((a) => ({ slug: String(a.slug), name: String(a.name) })),
    checklists: checklists.map((c) => ({ id: String(c.id), title: String(c.title), budget_plan_id: str(c.budget_plan_id) })),
    comments: comments.map((c) => ({ id: String(c.id), task_id: String(c.task_id), author_id: str(c.author_id), body: String(c.body), created_at: String(c.created_at) })),
    people: people.map((p) => ({ user_id: String(p.user_id), display_name: String(p.display_name), initials: String(p.initials) })),
    plans: plans.map((p) => ({ id: String(p.id), year: Number(p.year), quarter: Number(p.quarter) })),
    planLines: planLines.map((l) => ({ plan_id: String(l.plan_id), category_id: String(l.category_id), amount_cents: Number(l.amount_cents) })),
    categories: categories.map((c) => ({ id: String(c.category_id), name: String(c.name), year: Number(c.year), budget_cents: Number(c.budget_cents ?? 0), spent_cents: Number(c.spent_cents ?? 0) })),
  };
}
