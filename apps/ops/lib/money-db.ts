// A small loose wrapper for reading the Ops Hub tables from the server as the signed-in person (live mode only). The
// generated types do not know these tables yet, so the client is used through a loose shape. Used by the Money and People
// loaders (tested live against the local stack, 2026-10-12).
import { timeLabel } from './format';
import { sessionClient } from './supabase-server';
import type { Who, WideChecklist, WideStep } from './money-shared';

export type Row = Record<string, unknown>;
type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  is: (c: string, v: null | boolean) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  limit: (n: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q } };

// Reads rows from a table or view; throws when the database says no (the loader turns that into the "didn't load" card).
export async function read(table: string, select: string, o: { eq?: Record<string, unknown>; in?: [string, unknown[]]; order?: [string, boolean]; limit?: number } = {}): Promise<Row[]> {
  if (o.in && o.in[1].length === 0) return [];
  const client = (await sessionClient()) as unknown as Loose;
  let q = client.from(table).select(select);
  for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
  if (o.in) q = q.in(o.in[0], o.in[1]);
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

/** A checklist step as the loaders read it: the WideStep plus the task's type (an 'approval' step is the plan's approval). */
export type StepRow = WideStep & { type: string };

// The steps (tasks with this checklist_id, in order) with their owners (task_assignees, or the group, or nobody).
// `current` is the first step that is not done. The step's small line is tasks.note.
export async function checklistSteps(checklistId: string): Promise<StepRow[]> {
  const [tasks, people] = await Promise.all([
    read('tasks', 'id, title, type, note, due_on, status, assignee_group, position', { eq: { checklist_id: checklistId, archived: false }, order: ['position', true] }),
    profiles(),
  ]);
  const assignees = await read('task_assignees', 'task_id, user_id', { in: ['task_id', tasks.map((t) => t.id)] });
  const steps: StepRow[] = tasks.map((t) => {
    const a = assignees.find((x) => x.task_id === t.id);
    const p = a ? people.get(String(a.user_id)) : undefined;
    const owner: Who = a && p ? { kind: 'person', user_id: String(a.user_id), name: p.name, initials: p.initials } : t.assignee_group ? { kind: 'group', name: GROUPS[String(t.assignee_group)] ?? 'Board' } : { kind: 'none' };
    return { id: String(t.id), title: String(t.title), kind: String(t.note ?? ''), owner, due_on: (t.due_on as string | null) ?? null, done: t.status === 'done', current: false, type: String(t.type) };
  });
  const next = steps.find((s) => !s.done);
  if (next) next.current = true;
  return steps;
}

// The checklist with this title, as the wide table draws it; null when there is none (the page then leaves it out).
export async function checklistByTitle(title: string): Promise<WideChecklist | null> {
  const lists = await read('checklists', 'id, title', { eq: { title }, order: ['created_at', true], limit: 1 });
  if (lists.length === 0) return null;
  const id = String(lists[0].id);
  const steps = await checklistSteps(id);
  return { id, title, steps: steps.map((s) => ({ id: s.id, title: s.title, kind: s.kind, owner: s.owner, due_on: s.due_on, done: s.done, current: s.current })) };
}

// The latest message in an area's channel (the Money chat card on Budget), or null when there is none.
export async function latestAreaMessage(area: string): Promise<{ name: string; initials: string; time: string; body: string } | null> {
  const ch = await read('chat_channels', 'id', { eq: { area }, limit: 1 });
  if (ch.length === 0) return null;
  const [msgs, people] = await Promise.all([read('chat_messages', 'author_id, is_bot, body, created_at', { eq: { channel_id: ch[0].id }, order: ['created_at', false], limit: 1 }), profiles()]);
  const m = msgs[0];
  if (!m) return null;
  const p = m.author_id ? people.get(String(m.author_id)) : undefined;
  return { name: m.is_bot ? 'BTX' : (p?.name ?? 'Former member'), initials: m.is_bot ? 'BTX' : (p?.initials ?? '?'), time: timeLabel(String(m.created_at)), body: String(m.body) };
}
