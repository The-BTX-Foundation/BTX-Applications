// The refreshed Tasks page's loader (shape in lib/tasks-view.ts). Mock mode (no Supabase env) returns the demo's sample day
// from mock/tasks-view.ts; live mode reads the real tables (lib/daily-load.ts) and maps them in lib/tasks-map.ts.
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI, type Row } from './daily-db';
import { easternDay } from './daily-tasks';
import { loadLiveTasks } from './daily-load';
import { loadAvailabilityItem } from './availability-load';
import { availabilityRow } from './availability-today';
import { mapRequest, mapTasksView } from './tasks-map';
import type { TasksResult } from './tasks-view';
import { TASKS_VIEW, TASKS_VIEW_EMPTY, TASKS_VIEW_STRESS } from '@/mock/tasks-view';

/**
 * Loads what the Tasks page draws. Mock mode only (live mode ignores `demo`): `?demo=stress` adds the longest title and 120
 * comments, `?demo=empty` the quiet day, `?demo=error` the list's "didn't load" line (the rest of the page draws),
 * `?demo=failed` the whole-page "didn't load" card, `?demo=request` adds the availability request to Mine.
 * (`?demo=loading` is handled by the page itself: it draws the skeleton.)
 */
export async function loadTasksView({ demo }: { demo?: string } = {}): Promise<TasksResult> {
  if (!hasSupabaseEnv()) {
    if (demo === 'failed') return { failed: true };
    const view = demo === 'stress' ? TASKS_VIEW_STRESS : demo === 'empty' ? TASKS_VIEW_EMPTY : TASKS_VIEW;
    if (demo === 'request') {
      // A board member who has not sent their interview times yet (closes Thursday, interviews the week after).
      const item = availabilityRow({ cycle: { id: 'mock', closesAt: '2026-11-13T04:59:00Z', interviewStart: '2026-11-16', interviewEnd: '2026-11-27' }, sentAt: null, today: view.today });
      return { ...view, tasks: item ? [mapRequest(item, view.me), ...view.tasks] : view.tasks, failed: false, tasksFailed: false };
    }
    return { ...view, tasksFailed: demo === 'error', failed: false };
  }
  // No signed-in staff member: the whole page says it didn't load.
  const who = await whoAmI().catch(() => null);
  if (!who) return { failed: true };
  const today = easternDay(new Date());
  // The request is read alongside the tasks; a failed read only drops it.
  const [live, item] = await Promise.all([loadLiveTasks(who.id).catch(() => null), loadAvailabilityItem(who.id, today).catch(() => null)]);
  if (!live) {
    // The list failed: the page draws with the "didn't load" line and Try again (nothing invented in its place).
    const view = mapTasksView({ today, me: who.id, people: [], areas: [], tasks: [], comments: {}, done: [] }, null);
    return { ...view, failed: false, tasksFailed: true };
  }
  // Every owner of the loaded tasks (for the Person filter); a failed read only drops it (the filter then matches the first
  // owner, as the task data carries it).
  const owners = await loadOwners(live.tasks.map((t) => String(t.id))).catch(() => ({}));
  return { ...mapTasksView({ ...live, me: who.id }, item, owners), failed: false, tasksFailed: false };
}

/** Task ids per owner read: 200 per request keeps each request small and its answer far under the row limit. */
export const OWNER_CHUNK = 200;

// The task_assignees rows of just these tasks, in chunks of 200 ids, each ordered by task id; then sorted by (task, person).
async function loadOwners(taskIds: string[]): Promise<Record<string, string[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += OWNER_CHUNK) chunks.push(taskIds.slice(i, i + OWNER_CHUNK));
  const parts = await Promise.all(chunks.map((ids) => readRows('task_assignees', 'task_id, user_id', { in: { task_id: ids }, order: ['task_id', true] })));
  const rows = parts.flat().sort((a, b) => String(a.task_id).localeCompare(String(b.task_id)) || String(a.user_id).localeCompare(String(b.user_id)));
  return ownersByTask(rows);
}

// Every owner of each task, from task_assignees rows.
function ownersByTask(rows: Row[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[String(r.task_id)] ??= []).push(String(r.user_id));
  return out;
}
