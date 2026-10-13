// Live reads the Programs and Outreach pages share (server side, as the signed-in person; RLS applies).
import { read } from './money-db';
import { mapChat, staffMap, taskOwner, type Row, type StaffMap } from './area-map';
import type { AreaChat, Owner } from '@/mock/area';
import { sessionClient } from './supabase-server';

export const loadStaff = async (): Promise<StaffMap> => staffMap(await read('staff_profiles', 'user_id, display_name, initials', { order: ['display_name', true] }));

/** The area's chat thread (the last 40 messages). channelId and canPost let the composer post. */
export async function loadAreaChat(area: string, title: string, staff: StaffMap): Promise<AreaChat> {
  const channels = await read('chat_channels', 'id', { eq: { kind: 'area', area }, limit: 1 });
  const { data } = await (await sessionClient()).auth.getUser();
  const me = data.user?.id ?? '';
  const role = data.user?.app_metadata?.role;
  const canPost = channels.length > 0 && (role === 'admin' || role === 'board');
  if (channels.length === 0) return { title, people: staff.size, messages: [], channelId: null, canPost: false };
  const rows = await read('chat_messages', 'id, author_id, is_bot, body, created_at', { eq: { channel_id: channels[0].id }, order: ['created_at', false], limit: 40 });
  return { ...mapChat(title, rows.reverse(), staff, me, new Date()), channelId: String(channels[0].id), canPost };
}

export type LiveStep = { id: string; title: string; note: string | null; due_on: string | null; done: boolean; owner: Owner };

/** The steps of a checklist (tasks + task_assignees), in order. */
export async function checklistSteps(checklistId: string, staff: StaffMap): Promise<LiveStep[]> {
  const [tasks, assignees] = await Promise.all([
    read('tasks', 'id, title, note, due_on, status, assignee_group, position', { eq: { checklist_id: checklistId, archived: false }, order: ['position', true] }),
    read('task_assignees', 'task_id, user_id'),
  ]);
  return tasks.map((t: Row) => ({
    id: String(t.id),
    title: String(t.title),
    note: (t.note as string | null) ?? null,
    due_on: (t.due_on as string | null) ?? null,
    done: t.status === 'done',
    owner: taskOwner(
      assignees.filter((a) => a.task_id === t.id).map((a) => String(a.user_id)),
      t.assignee_group,
      staff,
    ),
  }));
}
