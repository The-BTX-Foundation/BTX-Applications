// Server-side loaders shared by Today, Tasks and the sidebar counts (live mode only). Reads the real Ops Hub tables as the
// signed-in person, so row-level security applies.
import { readRows, type Row } from './daily-db';
import { buildTasks, easternDay, type LiveTasks } from './daily-tasks';

// Runs a read that may be forbidden for this role (or empty) and falls back to no rows.
export async function safe(p: Promise<Row[]>): Promise<Row[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

// The task tables as the Tasks and Today pages use them. Throws when the tasks themselves cannot be read.
export async function loadLiveTasks(me: string, now = new Date()): Promise<LiveTasks & { today: string; raw: { tasks: Row[]; checklists: Row[] } }> {
  const today = easternDay(now);
  const year = Number(today.slice(0, 4));
  const [tasks, assignees, comments, types, areas, checklists, people] = await Promise.all([
    readRows('tasks', 'id, title, type, area, status, due_on, checklist_id, cycle_id, assignee_group, position, archived, completed_at', { eq: { archived: false }, order: ['due_on', true] }),
    readRows('task_assignees', 'task_id, user_id, assigned_at'),
    readRows('task_comments', 'id, task_id, author_id, body, created_at'),
    readRows('task_types', 'code, label', { order: ['position', true] }),
    readRows('areas', 'slug, name', { order: ['position', true] }),
    readRows('checklists', 'id, title, budget_plan_id, cycle_id'),
    readRows('staff_profiles', 'user_id, display_name, initials'),
  ]);
  // Approval detail comes from the quarter plan a checklist is tied to; the money reads may be forbidden, so they fall back.
  const [plans, lines, cats, totals] = await Promise.all([
    safe(readRows('budget_quarter_plans', 'id, year, quarter, status, note')),
    safe(readRows('budget_quarter_plan_lines', 'plan_id, category_id, amount_cents')),
    safe(readRows('budget_categories', 'id, name', { eq: { year } })),
    safe(readRows('budget_category_totals', 'budget_cents, spent_cents', { eq: { year } })),
  ]);
  const catName = new Map(cats.map((c) => [String(c.id), String(c.name)]));
  const built = buildTasks({
    me,
    today,
    tasks,
    assignees,
    comments,
    types,
    areas,
    checklists,
    people,
    plans,
    planLines: lines.map((l) => ({ plan_id: String(l.plan_id), label: catName.get(String(l.category_id)) ?? 'Other', cents: Number(l.amount_cents) })),
    spentCents: totals.length ? totals.reduce((s, t) => s + Number(t.spent_cents ?? 0), 0) : undefined,
    budgetCents: totals.length ? totals.reduce((s, t) => s + Number(t.budget_cents ?? 0), 0) : undefined,
  });
  return { ...built, today, raw: { tasks, checklists } };
}
