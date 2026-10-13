// The gold counts beside sidebar entries, from real data (live mode). Mock mode returns undefined and the shell keeps its
// sample counts (mock/nav.ts). Never throws: a failed read just means no pill.
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI } from './daily-db';
import { safe } from './daily-load';
import { easternDay, scoringTodo, sidebarCounts } from './daily-tasks';
import { availabilityRow } from './availability-today';

export async function loadNavCounts(): Promise<Record<string, number | string> | undefined> {
  if (!hasSupabaseEnv()) return undefined;
  try {
    const who = await whoAmI();
    if (!who) return {};
    const [mine, assignees, unread, bookings, pairings, scores, cycles, prefs] = await Promise.all([
      safe(readRows('tasks', 'id, area, status, assignee_group', { eq: { archived: false } })),
      safe(readRows('task_assignees', 'task_id', { eq: { user_id: who.id } })),
      safe(readRows('chat_unread_counts', 'unread')),
      safe(readRows('bookings', 'application_id, slot_id, status', { eq: { status: 'active' } })),
      safe(readRows('interview_pairings', 'slot_id, interviewer_a, interviewer_b')),
      safe(readRows('scores', 'application_id, scorer_id, published', { eq: { scorer_id: who.id } })),
      safe(readRows('cycles', 'id, status, interview_start, interview_end, closes_at, created_at', { order: ['created_at', false] })),
      safe(readRows('board_interview_prefs', 'cycle_id, availability_sent_at', { eq: { user_id: who.id } })),
    ]);
    const mineIds = new Set(assignees.map((a) => String(a.task_id)));
    const open = mine.filter((t) => (t.status === 'open' || t.status === 'in_progress') && (mineIds.has(String(t.id)) || t.assignee_group === 'all_board'));
    const mineByArea: Record<string, number> = {};
    for (const t of open) mineByArea[String(t.area)] = (mineByArea[String(t.area)] ?? 0) + 1;
    // The Today page's "Give your interview availability" item counts too, so the pill matches the page.
    const cycle = cycles.find((c) => c.status === 'published') ?? cycles[0];
    const sent = cycle ? prefs.find((p) => String(p.cycle_id) === String(cycle.id)) : undefined;
    const ask = cycle
      ? availabilityRow({
          cycle: { id: String(cycle.id), closesAt: (cycle.closes_at as string | null) ?? null, interviewStart: (cycle.interview_start as string | null) ?? null, interviewEnd: (cycle.interview_end as string | null) ?? null },
          sentAt: sent ? ((sent.availability_sent_at as string | null) ?? null) : null,
          today: easternDay(new Date()),
        })
      : null;
    return sidebarCounts({
      mineOpen: open.length + (ask ? 1 : 0),
      unread: unread.reduce((s, u) => s + Number(u.unread ?? 0), 0),
      mineByArea,
      scoringTodo: scoringTodo(who.id, bookings, pairings, scores),
    });
  } catch {
    return {};
  }
}
