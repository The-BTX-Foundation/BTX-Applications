// The two daily push jobs, run from the same crons as the interview emails (app/api/cron/interview-emails):
//   prep      the evening before: each interviewer with interviews tomorrow gets "Interviews tomorrow"
//   reminder  the morning before: each person with an open task due tomorrow gets "Due tomorrow"
// "Tomorrow" is the next calendar day in Eastern time, whatever the server's zone. Each push goes out once (ops_push_log).
import { readInterviews } from '@btx/emails';
import { createServiceClient } from '@btx/data/server';
import { easternDay, planDueTomorrowPushes, planPrepPushes, tomorrowEastern, type PushInterview, type PushItem, type PushSummary, emptySummary } from '@btx/push';
import { sendPushes, staffUserIds, type ServiceDb } from './server';

export type CronPushDeps = {
  db?: ServiceDb | null;
  interviews?: (q: { from: string; to: string }) => Promise<PushInterview[]>;
  /** Open tasks due on `day` with who they are for. */
  tasks?: (day: string) => Promise<{ id: string; title: string; userIds: string[] }[]>;
  deliver?: (items: PushItem[]) => Promise<PushSummary>;
};

/** Cron: "Interviews tomorrow" to each interviewer. */
export async function sendPrepPushes(now: Date = new Date(), deps: CronPushDeps = {}): Promise<PushSummary> {
  const db = deps.db === undefined ? createServiceClient() : deps.db;
  if (!db && !deps.interviews) return emptySummary(false);
  const day = tomorrowEastern(now);
  // A wide query window (now to 50 hours on); the Eastern date does the exact choosing, so a 23 or 25 hour day changes nothing.
  const read = deps.interviews ?? ((q) => readInterviews(db!, q));
  const rows = (await read({ from: now.toISOString(), to: new Date(now.getTime() + 50 * 3_600_000).toISOString() })).filter((r) => r.interviewers.length > 0 && easternDay(new Date(r.startsAt)) === day);
  return (deps.deliver ?? ((items) => sendPushes(items, db)))(planPrepPushes(rows, day));
}

/** Open tasks due on `day`: for each, the people it is assigned to, or every board member for an all-board task. */
async function readDueTasks(db: ServiceDb, day: string): Promise<{ id: string; title: string; userIds: string[] }[]> {
  const tasks = await db.from('tasks').select('id, title, assignee_group').eq('due_on', day).eq('archived', false).in('status', ['open', 'in_progress']);
  if (tasks.error) throw new Error('tasks due');
  const rows = (tasks.data ?? []) as { id: string; title: string; assignee_group: string | null }[];
  if (rows.length === 0) return [];
  const assigned = await db.from('task_assignees').select('task_id, user_id').in('task_id', rows.map((t) => t.id));
  if (assigned.error) throw new Error('task assignees');
  const byTask = new Map<string, string[]>();
  for (const a of (assigned.data ?? []) as { task_id: string; user_id: string }[]) byTask.set(a.task_id, [...(byTask.get(a.task_id) ?? []), a.user_id]);
  const everyone = rows.some((t) => t.assignee_group === 'all_board') ? await staffUserIds(db) : [];
  return rows
    .map((t) => ({ id: t.id, title: t.title, userIds: [...new Set([...(byTask.get(t.id) ?? []), ...(t.assignee_group === 'all_board' ? everyone : [])])] }))
    .filter((t) => t.userIds.length > 0);
}

/** Cron: "Due tomorrow" to the assignees of each open task due tomorrow. */
export async function sendDueTomorrowPushes(now: Date = new Date(), deps: CronPushDeps = {}): Promise<PushSummary> {
  const db = deps.db === undefined ? createServiceClient() : deps.db;
  if (!db && !deps.tasks) return emptySummary(false);
  const day = tomorrowEastern(now);
  const read = deps.tasks ?? ((d) => readDueTasks(db!, d));
  return (deps.deliver ?? ((items) => sendPushes(items, db)))(planDueTomorrowPushes(await read(day), day));
}
