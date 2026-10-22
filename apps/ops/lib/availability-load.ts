// Reads what the "Give your interview availability" request needs for the signed-in person (live mode): the cycle in play
// (the published one, else the newest, the same choice Today and the sidebar count make) and whether they sent their times.
// The rule itself is availabilityRow (lib/availability-today.ts). A failed read adds nothing.
import { readRows } from './daily-db';
import { safe } from './daily-load';
import { availabilityRow } from './availability-today';

export async function loadAvailabilityItem(userId: string, today: string) {
  const [cycles, prefs] = await Promise.all([
    safe(readRows('cycles', 'id, status, interview_start, interview_end, closes_at, created_at', { order: ['created_at', false] })),
    safe(readRows('board_interview_prefs', 'cycle_id, availability_sent_at', { eq: { user_id: userId } })),
  ]);
  const cycle = cycles.find((c) => c.status === 'published') ?? cycles[0];
  if (!cycle) return null;
  const sent = prefs.find((p) => String(p.cycle_id) === String(cycle.id));
  return availabilityRow({
    cycle: { id: String(cycle.id), closesAt: (cycle.closes_at as string | null) ?? null, interviewStart: (cycle.interview_start as string | null) ?? null, interviewEnd: (cycle.interview_end as string | null) ?? null },
    sentAt: sent ? ((sent.availability_sent_at as string | null) ?? null) : null,
    today,
  });
}
