// The gold counts beside sidebar entries, from real data (live mode). Mock mode returns undefined and the shell keeps its
// sample counts (mock/nav.ts). Never throws: a failed read just means no pill.
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI } from './daily-db';
import { safe } from './daily-load';
import { scoringTodo, sidebarCounts } from './daily-tasks';

export async function loadNavCounts(): Promise<Record<string, number | string> | undefined> {
  if (!hasSupabaseEnv()) return undefined;
  try {
    const who = await whoAmI();
    if (!who) return {};
    const [mine, assignees, unread, bookings, pairings, scores] = await Promise.all([
      safe(readRows('tasks', 'id, area, status, assignee_group', { eq: { archived: false } })),
      safe(readRows('task_assignees', 'task_id', { eq: { user_id: who.id } })),
      safe(readRows('chat_unread_counts', 'unread')),
      safe(readRows('bookings', 'application_id, slot_id, status', { eq: { status: 'active' } })),
      safe(readRows('interview_pairings', 'slot_id, interviewer_a, interviewer_b')),
      safe(readRows('scores', 'application_id, scorer_id, published', { eq: { scorer_id: who.id } })),
    ]);
    const mineIds = new Set(assignees.map((a) => String(a.task_id)));
    const open = mine.filter((t) => (t.status === 'open' || t.status === 'in_progress') && (mineIds.has(String(t.id)) || t.assignee_group === 'all_board'));
    const mineByArea: Record<string, number> = {};
    for (const t of open) mineByArea[String(t.area)] = (mineByArea[String(t.area)] ?? 0) + 1;
    return sidebarCounts({
      mineOpen: open.length,
      unread: unread.reduce((s, u) => s + Number(u.unread ?? 0), 0),
      mineByArea,
      scoringTodo: scoringTodo(who.id, bookings, pairings, scores),
    });
  } catch {
    return {};
  }
}
