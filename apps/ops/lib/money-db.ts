// A small loose wrapper for reading the draft Ops Hub tables from the server (live mode only). The generated types do not
// know these tables yet, so the client is used through a loose shape. NOT TESTED: needs the Ops Hub tables (draft schema,
// not applied). Used by the Money and People loaders.
import { sessionClient } from './supabase-server';
import type { Who, WideChecklist, WideStep } from './money-shared';

export type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  is: (c: string, v: null | boolean) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// Reads rows from a table or view; throws when the database says no (the loader turns that into the "didn't load" card).
export async function read(table: string, select: string, o: { eq?: Record<string, unknown>; order?: [string, boolean]; limit?: number } = {}): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as Loose;
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  if (o.order) q = q.order(o.order[0], { ascending: o.order[1] });
  if (o.limit) q = q.limit(o.limit);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// staff_profiles by user id, for owner names and initials.
export async function profiles(): Promise<Map<string, { name: string; initials: string }>> {
  const rows = await read('staff_profiles', 'user_id, display_name, initials');
  return new Map(rows.map((r) => [String(r.user_id), { name: String(r.display_name), initials: String(r.initials) }]));
}

const GROUPS: Record<string, string> = { bot: 'BTX', board: 'Board', all_board: 'All board members', interview_pairs: 'Interview pairs' };

// The steps of the checklist with this title (checklists + their tasks + task_assignees), as the wide table draws them.
// `current` is the first step that is not done. The step's small line is tasks.note.
export async function checklistByTitle(title: string): Promise<WideChecklist | null> {
  const lists = await read('checklists', 'id, title', { eq: { title }, limit: 1 });
  if (lists.length === 0) return null;
  const id = String(lists[0].id);
  const [tasks, assignees, people] = await Promise.all([
    read('tasks', 'id, title, note, due_on, status, assignee_group, position', { eq: { checklist_id: id, archived: false }, order: ['position', true] }),
    read('task_assignees', 'task_id, user_id'),
    profiles(),
  ]);
  const steps: WideStep[] = tasks.map((t) => {
    const a = assignees.find((x) => x.task_id === t.id);
    const p = a ? people.get(String(a.user_id)) : undefined;
    const owner: Who = a && p ? { kind: 'person', user_id: String(a.user_id), name: p.name, initials: p.initials } : t.assignee_group ? { kind: 'group', name: GROUPS[String(t.assignee_group)] ?? 'Board' } : { kind: 'none' };
    return { id: String(t.id), title: String(t.title), kind: String(t.note ?? ''), owner, due_on: (t.due_on as string | null) ?? null, done: t.status === 'done', current: false };
  });
  const next = steps.find((s) => !s.done);
  if (next) next.current = true;
  return { id, title, steps };
}
