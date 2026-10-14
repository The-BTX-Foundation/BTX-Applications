// The sidebar's live counts (what needs the signed-in person), read from the Ops Hub tables. Mock mode never calls this:
// the shell keeps mock/nav.ts. Zero counts are left out, so no pill is drawn.
//   today and each area: the person's open tasks (task_assignees + tasks), per area for the area pills;
//   chat: unread messages over every channel (the chat_unread_counts view);
//   scoring: applications the person interviews (interview_pairings + an active booking) without their published score.
import type { Counts } from '@/mock/nav';
import { looseClient, rows } from './team-db';

export async function loadNavCounts(me: string): Promise<Counts> {
  try {
    const client = await looseClient();
    const [mine, unread, pairs, scores] = await Promise.all([
      rows(client, 'task_assignees', 'task_id, tasks!inner(area, status, archived)', { eq: { user_id: me, 'tasks.archived': false }, in: { 'tasks.status': ['open', 'in_progress'] } }),
      rows(client, 'chat_unread_counts', 'unread'),
      rows(client, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b'),
      rows(client, 'scores', 'application_id, published', { eq: { scorer_id: me } }),
    ]);
    const counts: Counts = {};
    const add = (k: string, n = 1) => {
      counts[k] = Number(counts[k] ?? 0) + n;
    };
    for (const r of mine) {
      const t = (Array.isArray(r.tasks) ? r.tasks[0] : r.tasks) as { area?: string } | null;
      add('today');
      if (t?.area) add(t.area);
    }
    const chat = unread.reduce((n, r) => n + Number(r.unread ?? 0), 0);
    if (chat) counts.chat = chat > 99 ? '99+' : chat;
    const slots = pairs.filter((p) => p.interviewer_a === me || p.interviewer_b === me).map((p) => String(p.slot_id));
    if (slots.length) {
      const bookings = await rows(client, 'bookings', 'application_id', { eq: { status: 'active' }, in: { slot_id: slots } });
      const done = new Set(scores.filter((s) => s.published).map((s) => String(s.application_id)));
      const left = new Set(bookings.map((b) => String(b.application_id)).filter((id) => !done.has(id))).size;
      if (left) counts.scoring = left;
    }
    return counts;
  } catch {
    return {};
  }
}
