'use client';

// The Tasks page's write actions for LIVE mode. Mock mode never calls these (the board changes its own state, like the demo).
// Every function returns true/false (or the new id) so the board can put things back and show "Couldn't save. Try again."
// when the database says no. Row-level security decides what the signed-in person may change; nothing here widens it.
// An update that row-level security filters out matches zero rows and returns no error, so every update asks for the
// changed row back and counts anything but exactly one row as a failure. Every call gives up after 15 seconds (a hung
// request counts as a failed write, so the board rolls back and its re-seeding is never held up for long).
// Approvals are never written here: the writer itself refuses them (every update carries `type <> 'approval'`, so an
// approval matches zero rows and the write fails). They are decided on /finance/budget/approval.
// New tasks and comments carry an id made in the browser, and a retry of the same words within two minutes reuses it
// (lib/tasks-ids.ts), so a retry after a lost answer never makes a twin and finishes a half-made task (one whose owner row
// failed). A half-made task nobody retries stays without an owner; its id is logged to the console when that happens.
import { getBrowserClient } from '@btx/data';
import { commentKey, isDuplicate, retryIds, taskKey, type RetryIds } from '@/lib/tasks-ids';

type Rows = { data: { id: string }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => Promise<T> };
type Done = Abortable<{ error: unknown }>;
/** The slice of the Supabase client these writes use (tests pass a stand-in). */
export type TasksDb = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { neq: (c: string, v: string) => { select: (c: string) => Abortable<Rows> } } };
    insert: (v: Record<string, unknown>) => Done;
    upsert: (v: Record<string, unknown>, o: { onConflict: string; ignoreDuplicates: boolean }) => Done;
    delete: () => { eq: (c: string, v: string) => Done };
  };
};
const db = () => getBrowserClient() as unknown as TasksDb;
const LIMIT_MS = 15_000;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(LIMIT_MS);
// The retry memory for new tasks and comments (one per page load, shared with Today's add).
const ids: RetryIds = retryIds();

/** The board calls this with the ids a refresh listed: those tasks and comments are on screen, so they are no longer retried. */
export function forgetIds(listed: Iterable<string>): void {
  ids.forget(listed);
}

// Updates one task and reports whether exactly that row changed. A budget approval is never changed here (it is decided
// only on /finance/budget/approval, and row-level security lets any board member update any task), so the update refuses
// type 'approval' itself: the filter matches zero rows, which counts as a failed write.
async function updateOne(id: string, values: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await db().from('tasks').update(values).eq('id', id).neq('type', 'approval').select('id').abortSignal(limit());
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

/**
 * Ticks a task done. Only the status is sent: the tasks_stamp_done trigger stamps completed_at (the server's clock, never
 * the browser's) and completed_by on the change to done, and leaves them alone if the task was already done.
 */
export async function markDone(id: string): Promise<boolean> {
  return updateOne(id, { status: 'done' });
}

/**
 * Undo: puts a done task back to the status it had before the tick ('open' or 'in_progress'). Only the status is sent;
 * the same trigger clears completed_at / completed_by.
 */
export async function reopen(id: string, previous: 'open' | 'in_progress' = 'open'): Promise<boolean> {
  return updateOne(id, { status: previous });
}

/** Snooze: moves a task's due date (tasks.due_on, a plain date). */
export async function moveDue(id: string, dueOn: string): Promise<boolean> {
  return updateOne(id, { due_on: dueOn });
}

/**
 * Adds a task for the signed-in person with its due date in the same insert, then their task_assignees row. Returns the
 * task id, or null. The id is made here, so a retry of the same words within two minutes reuses it: "already exists"
 * (23505) on either insert counts as done, and a retry finishes a task whose owner row failed last time.
 */
export async function addTask(title: string, areaSlug: string, dueOn: string | null, me: string): Promise<string | null> {
  const key = taskKey(title, areaSlug, dueOn, me);
  const id = ids.take(key, Date.now());
  // Remembers the id for a retry and reports the failure.
  const fail = () => {
    ids.fail(key, id, Date.now());
    return null;
  };
  // True once this attempt made the task (not a retry finding it already there).
  let created = false;
  try {
    const { error } = await db().from('tasks').insert({ id, title, area: areaSlug, type: 'task', due_on: dueOn }).abortSignal(limit());
    if (error && !isDuplicate(error)) return fail();
    created = !error;
    const { error: e2 } = await db()
      .from('task_assignees')
      .upsert({ task_id: id, user_id: me }, { onConflict: 'task_id,user_id', ignoreDuplicates: true })
      .abortSignal(limit());
    if (e2 && !isDuplicate(e2)) {
      // No owner row: take a task this attempt made back out. If that fails too, the id stays remembered (fail below), so
      // a retry of the same words adds the missing owner row instead of leaving the task ownerless.
      if (created) {
        const { error: e3 } = await db().from('tasks').delete().eq('id', id).abortSignal(limit());
        if (e3) console.error('Tasks: a task was added without an owner; a retry of the same words will finish it', id);
      }
      return fail();
    }
    ids.done(key);
    return id;
  } catch {
    // A request gave up (or threw) after the task was made: it may now have no owner row. The id stays remembered for a
    // retry, and it is logged once, as the failed cleanup is.
    if (created) console.error('Tasks: a task was added without an owner; a retry of the same words will finish it', id);
    return fail();
  }
}

/**
 * Adds a comment (task_comments.author_id defaults to auth.uid()). Returns the comment's id, or null. The id is made here
 * and reused by a retry of the same words; "already exists" (23505) counts as saved.
 */
export async function writeComment(taskId: string, body: string, me: string): Promise<string | null> {
  const key = commentKey(taskId, body, me);
  const id = ids.take(key, Date.now());
  try {
    const { error } = await db().from('task_comments').insert({ id, task_id: taskId, body }).abortSignal(limit());
    if (error && !isDuplicate(error)) {
      ids.fail(key, id, Date.now());
      return null;
    }
    ids.done(key);
    return id;
  } catch {
    ids.fail(key, id, Date.now());
    return null;
  }
}
