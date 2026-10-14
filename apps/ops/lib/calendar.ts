// The Calendar page's data. MOCK (mock/calendar.ts) when there is no Supabase env. LIVE: merges calendar_events,
// booked interviews (bookings + interview_slots + interview_pairings, codes from application_reviews), open tasks' due
// dates (tasks + task_assignees), posts, the cycles' dates and plan milestones into one list of CalItems
// (lib/calendar-build.ts, tested). `me` is the signed-in person's user id and the people come from staff_profiles.
import { hasSupabaseEnv } from '@btx/data';
import { MOCK_CALENDAR, MOCK_CALENDAR_STRESS } from '@/mock/calendar';
import type { CalendarData } from '@/components/calendar/types';
import { buildCalendarItems } from './calendar-build';
import { looseClient, rows, whoAmI } from './team-db';
import { easternToday } from './team-dates';

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

export async function loadCalendar(opts: { demo?: string } = {}): Promise<CalendarData> {
  const failed: CalendarData = { today: '', me: '', people: [], items: [], failed: true };
  if (opts.demo === 'error') return failed;
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CALENDAR_STRESS : MOCK_CALENDAR), failed: false };
  try {
    const client = await looseClient();
    const { id: me, role } = await whoAmI(client);
    if (!me) return failed;
    const [events, bookings, slots, pairings, apps, tasks, assignees, posts, channels, cycles, milestones, people] = await Promise.all([
      rows(client, 'calendar_events', 'id, title, area, starts_at, all_day, video_url, owner_id', { order: ['starts_at', true] }),
      rows(client, 'bookings', 'slot_id, application_id', { eq: { status: 'active' } }),
      rows(client, 'interview_slots', 'id, starts_at'),
      rows(client, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url'),
      rows(client, 'application_reviews', 'id, applicant_code'),
      rows(client, 'tasks', 'id, title, area, due_on, status', { eq: { archived: false }, in: { status: ['open', 'in_progress'] } }),
      rows(client, 'task_assignees', 'task_id, user_id'),
      rows(client, 'posts', 'id, title, post_on, owner_id, channel_id'),
      rows(client, 'outreach_channels', 'id, name'),
      rows(client, 'cycles', 'id, status, opens_at, closes_at, interview_start, interview_end, decision_date'),
      rows(client, 'plan_milestones', 'id, name, area, due_on, done', { eq: { archived: false, done: false } }),
      rows(client, 'staff_profiles', 'user_id, display_name', { order: ['display_name', true] }),
    ]);
    const slotAt = new Map(slots.map((x) => [String(x.id), String(x.starts_at)]));
    const code = new Map(apps.map((a) => [String(a.id), String(a.applicant_code ?? '—')]));
    const pair = new Map(pairings.map((p) => [String(p.slot_id), p]));
    const owners = new Map<string, string[]>();
    for (const a of assignees) owners.set(String(a.task_id), [...(owners.get(String(a.task_id)) ?? []), String(a.user_id)]);
    const channel = new Map(channels.map((c) => [String(c.id), String(c.name)]));
    const items = buildCalendarItems(
      {
        events: events.map((e) => ({ id: String(e.id), title: String(e.title), area: s(e.area), starts_at: String(e.starts_at), all_day: Boolean(e.all_day), video_url: s(e.video_url), owner_id: s(e.owner_id) })),
        interviews: bookings
          .filter((b) => slotAt.has(String(b.slot_id)))
          .map((b) => {
            const p = pair.get(String(b.slot_id));
            return {
              slot_id: String(b.slot_id),
              starts_at: slotAt.get(String(b.slot_id)) as string,
              code: code.get(String(b.application_id)) ?? '—',
              people: p ? [String(p.interviewer_a), String(p.interviewer_b)] : [],
              video_url: p ? s(p.video_url) : null,
            };
          }),
        tasks: tasks.filter((t) => t.due_on).map((t) => ({ id: String(t.id), title: String(t.title), area: String(t.area), due_on: String(t.due_on), people: owners.get(String(t.id)) ?? [] })),
        posts: posts.filter((p) => p.post_on).map((p) => ({ id: String(p.id), title: String(p.title), post_on: String(p.post_on), channel: channel.get(String(p.channel_id)) ?? 'Post', owner_id: s(p.owner_id) })),
        cycles: cycles
          .filter((c) => c.status !== 'draft')
          .map((c) => ({ id: String(c.id), opens_at: s(c.opens_at), closes_at: s(c.closes_at), interview_start: s(c.interview_start), interview_end: s(c.interview_end), decision_date: s(c.decision_date) })),
        milestones: milestones.filter((m) => m.due_on).map((m) => ({ id: String(m.id), name: String(m.name), area: String(m.area), due_on: String(m.due_on) })),
      },
      easternToday(),
    );
    return {
      today: easternToday(),
      me,
      people: people.map((p) => ({ id: String(p.user_id), name: String(p.display_name) })),
      items,
      canAdd: role === 'admin' || role === 'board',
      failed: false,
    };
  } catch {
    return failed;
  }
}
