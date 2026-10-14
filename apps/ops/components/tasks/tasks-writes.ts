'use client';

// The Tasks page's write actions for LIVE mode. Mock mode never calls these (the board changes its own state instead).
// Tested live against the local database as admin, board and reviewer (2026-10-12). The generated types do not know the
// Ops Hub tables, so the browser client is used through a loose shape.
import { getBrowserClient } from '@btx/data';

type Result = { error: unknown; data?: { id?: string } | null };
type Filterable = PromiseLike<Result> & { eq: (c: string, v: string) => Filterable };
type Loose = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => Filterable;
    insert: (v: Record<string, unknown>) => { select: (c: string) => { single: () => PromiseLike<Result> } } & PromiseLike<Result>;
  };
};

const db = () => getBrowserClient() as unknown as Loose;

// Marks a task done, or declines an approval (tasks.status; the database stamps completed_at / completed_by). When the
// approval belongs to a quarter plan that is waiting, the plan is approved or declined too (the database stamps who and
// when). Works for admin and board on any task, for a reviewer on tasks assigned to them.
export async function writeStatus(id: string, status: 'done' | 'declined', planId?: string): Promise<boolean> {
  if (planId) {
    const plan = await db()
      .from('budget_quarter_plans')
      .update({ status: status === 'done' ? 'approved' : 'declined' })
      .eq('id', planId)
      .eq('status', 'awaiting_approval');
    if (plan.error) return false;
  }
  const { error } = await db().from('tasks').update({ status }).eq('id', id);
  return !error;
}

// Adds a comment (task_comments.author_id defaults to auth.uid(); admin and board only). Returns the new id.
export async function writeComment(taskId: string, body: string): Promise<string | null> {
  const { data, error } = await db().from('task_comments').insert({ task_id: taskId, body }).select('id').single();
  return error || !data?.id ? null : data.id;
}

// Adds a task for the signed-in person (a task_assignees row for them; created_by defaults to auth.uid()). Returns the
// new task's id. Admin and board only (reviewers cannot add tasks).
export async function writeTask(title: string, area: string, me: string): Promise<string | null> {
  const { data, error } = await db().from('tasks').insert({ title, area, type: 'task' }).select('id').single();
  if (error || !data?.id) return null;
  const { error: e2 } = await db().from('task_assignees').insert({ task_id: data.id, user_id: me });
  return e2 ? null : data.id;
}
