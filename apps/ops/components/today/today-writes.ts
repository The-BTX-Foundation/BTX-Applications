'use client';

// Today's write actions for LIVE mode. Mock mode never calls these (the board changes its own state, like the demo).
// Every function returns true/false (or the new id) so the board can put a row back and show "Couldn't save. Try again."
// when the database says no. Row-level security decides what the signed-in person may change; nothing here widens it.
// An update that row-level security filters out matches zero rows and returns no error, so every update asks for the
// changed row back and counts zero rows as a failure. Every call gives up after 15 seconds (a hung request counts as a
// failed write, so the board rolls back and its re-seeding is never held up for long).
import { getBrowserClient } from '@btx/data';
import { postMessage } from '@/lib/chat-actions';
import { addTask as addTaskShared } from '@/components/tasks/tasks-writes';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => Promise<T> };
/** The slice of the Supabase client these writes use (tests pass a stand-in). */
export type TodayDb = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { neq: (c: string, v: string) => { select: (c: string) => Abortable<Rows> } } };
    select: (c: string) => { eq: (c: string, v: string) => Abortable<{ data: { status?: unknown }[] | null; error: unknown }> };
  };
};
type Loose = TodayDb;
const db = () => getBrowserClient() as unknown as Loose;
const LIMIT_MS = 15_000;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(LIMIT_MS);

/** The areas table's slug for an area's shown name ("Finance" is stored as `money`). */
export const AREA_SLUG: Record<string, string> = { Scholarships: 'scholarships', Finance: 'money', Programs: 'programs', Outreach: 'outreach' };

// Updates one task and reports whether exactly that row changed. A budget approval is never changed here: it is decided
// only on /finance/budget/approval, and row-level security lets any board member update any task, so this write refuses
// type 'approval' itself (the filter matches zero rows, which counts as a failed write and the board rolls back).
async function updateOne(id: string, values: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await db().from('tasks').update(values).eq('id', id).neq('type', 'approval').select('id').abortSignal(limit());
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

// The status each ticked task had before the tick ('open' or 'in_progress'), so Undo can put it back. Today's rows do not
// carry the status, so the tick reads it first.
const before = new Map<string, 'open' | 'in_progress'>();

// Ticks a task done. Only the status is sent: the tasks_stamp_done trigger fills completed_at (the server's clock, never
// the browser's) and completed_by on the change to done, and leaves them alone if the task was already done. The status
// it had is read first and remembered for Undo (a failed read only means Undo puts it back to open).
export async function markDone(id: string): Promise<boolean> {
  try {
    const { data } = await db().from('tasks').select('status').eq('id', id).abortSignal(limit());
    const s = data?.[0]?.status;
    if (s === 'open' || s === 'in_progress') before.set(id, s);
  } catch {
    // Undo falls back to 'open'.
  }
  return updateOne(id, { status: 'done' });
}

// The status a ticked task had before the tick (read by Undo when it runs, after the tick's write has settled).
export function statusBefore(id: string): 'open' | 'in_progress' {
  return before.get(id) ?? 'open';
}

// Undo: puts a done task back to the status it had before the tick ('open' or 'in_progress'). Only the status is sent; the
// same trigger clears completed_at / completed_by, so tasks_done_has_time holds.
export async function reopen(id: string, previous: 'open' | 'in_progress' = 'open'): Promise<boolean> {
  const ok = await updateOne(id, { status: previous });
  if (ok) before.delete(id);
  return ok;
}

// Snooze: moves a task's due date (tasks.due_on, a plain date).
export async function moveDue(id: string, dueOn: string): Promise<boolean> {
  return updateOne(id, { due_on: dueOn });
}

// Adds a task for the signed-in person (task row with its due date, then their task_assignees row). Returns the new id,
// or null. One writer serves Today and the Tasks page (components/tasks/tasks-writes.ts): the id is made in the browser
// and a retry of the same words within two minutes reuses it, so a retry never makes a twin and finishes a half-made task.
export async function addTask(title: string, areaSlug: string, dueOn: string | null, me: string): Promise<string | null> {
  return addTaskShared(title, areaSlug, dueOn, me);
}

// Posts a message in a chat channel (a reply, or a nudge drafted on a task). Throws nothing: false when it did not save.
export async function sendChat(channelId: string, body: string): Promise<boolean> {
  try {
    // postMessage has its own 15-second abort; this race is a second guard so a hung call can never leave the board waiting
    // (the board treats a late send as failed).
    let t: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, no) => (t = setTimeout(() => no(new Error('timeout')), LIMIT_MS)));
    await Promise.race([postMessage(channelId, body), late]).finally(() => clearTimeout(t));
    return true;
  } catch {
    return false;
  }
}
