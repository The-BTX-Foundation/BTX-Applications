'use client';

// The Tasks page's write actions for LIVE mode. Mock mode never calls these (the board changes its own state instead).
// The generated types do not know the tables, so the browser client is used through a loose shape.
import { getBrowserClient } from '@btx/data';

type Result = { error: unknown; data?: { id?: string } | null };
type Loose = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<Result> };
    delete: () => { eq: (c: string, v: string) => Promise<Result> };
    insert: (v: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<Result> } } & Promise<Result>;
  };
};

const db = () => getBrowserClient() as unknown as Loose;

// Marks a task done, or declines an approval (tasks.status; `done` needs completed_at, `declined` must not have it).
export async function writeStatus(id: string, status: 'done' | 'declined'): Promise<boolean> {
  const { error } = await db()
    .from('tasks')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id);
  return !error;
}

// Adds a comment (task_comments.author_id defaults to auth.uid()).
export async function writeComment(taskId: string, body: string): Promise<boolean> {
  const { error } = await db().from('task_comments').insert({ task_id: taskId, body });
  return !error;
}

// Adds a task for the signed-in person (task_assignees row for them, created_by defaults to auth.uid()).
export async function writeTask(title: string, area: string, me: string): Promise<string | null> {
  const { data, error } = await db().from('tasks').insert({ title, area, type: 'task' }).select('id').single();
  if (error || !data?.id) return null;
  const { error: e2 } = await db().from('task_assignees').insert({ task_id: data.id, user_id: me }) as unknown as Result;
  if (e2) {
    // No owner row: take the half-made task back out rather than leave it ownerless.
    await db().from('tasks').delete().eq('id', data.id);
    return null;
  }
  return data.id;
}
