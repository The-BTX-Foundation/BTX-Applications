// The Calendar page's data. Mock mode returns the Figma sample (mock/calendar.ts). Live mode merges what the schema keeps
// in separate tables into one list of CalItems: `calendar_events` (events entered in the app), interviews (`bookings` /
// `interview_slots` / `interview_pairings`), task due dates (`tasks.due_on`), posts (`posts`), plan milestones and the
// cycle's dates (`cycles`); the merging is pure code in lib/daily-calendar.ts. The page only sees CalendarData.
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI } from './daily-db';
import { safe } from './daily-load';
import { cycleItems, eventItems, interviewItems, milestoneItems, postItems, taskItems } from './daily-calendar';
import { easternDay } from './daily-tasks';
import { MOCK_CALENDAR, MOCK_CALENDAR_STRESS } from '@/mock/calendar';
import type { CalendarData } from '@/components/calendar/types';

/** A row of the draft `calendar_events` table (column names and types as in the migration). */
export type CalendarEventRow = {
  id: string;
  title: string;
  kind: 'event' | 'meeting' | 'selection_meeting' | 'planning_call' | 'deadline';
  area: 'scholarships' | 'money' | 'programs' | 'outreach' | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  video_url: string | null;
  cycle_id: string | null;
  program_id: string | null;
  owner_id: string | null;
};

export async function loadCalendar(opts: { demo?: string } = {}): Promise<CalendarData> {
  const failed: CalendarData = { today: '', me: '', people: [], items: [], failed: true };
  if (opts.demo === 'error') return failed;
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CALENDAR_STRESS : MOCK_CALENDAR), failed: false };
  try {
    const who = await whoAmI();
    if (!who) return failed;
    const [events, tasks, assignees, posts, cycles, milestones, bookings, slots, pairings, apps, people] = await Promise.all([
      readRows('calendar_events', 'id, title, kind, area, starts_at, ends_at, all_day, location, video_url, owner_id', { order: ['starts_at', true] }),
      readRows('tasks', 'id, title, area, status, due_on, archived'),
      readRows('task_assignees', 'task_id, user_id'),
      safe(readRows('posts', 'id, title, post_on, owner_id')),
      safe(readRows('cycles', 'id, status, opens_at, closes_at, interview_start, interview_end, decision_date')),
      safe(readRows('plan_milestones', 'id, name, area, due_on, done, archived')),
      safe(readRows('bookings', 'id, application_id, slot_id, status', { eq: { status: 'active' } })),
      safe(readRows('interview_slots', 'id, starts_at')),
      safe(readRows('interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url')),
      safe(readRows('application_reviews', 'id, applicant_code')),
      readRows('staff_profiles', 'user_id, display_name'),
    ]);
    const today = easternDay(new Date());
    return {
      today,
      me: who.id,
      people: people.map((p) => ({ id: String(p.user_id), name: String(p.display_name) })),
      items: [
        ...eventItems(events),
        ...interviewItems(bookings, slots, pairings, apps),
        ...taskItems(tasks, assignees, today),
        ...postItems(posts),
        ...cycleItems(cycles),
        ...milestoneItems(milestones),
      ],
      failed: false,
    };
  } catch {
    return failed;
  }
}
