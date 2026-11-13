// The Calendar page's data. Mock mode returns the Figma sample (mock/calendar.ts). Live mode merges what the schema keeps
// in separate tables into one list of CalItems: `calendar_events` (events entered in the app), interviews (`bookings` /
// `interview_slots` / `interview_pairings`), task due dates (`tasks.due_on`), posts (`posts`), plan milestones and the
// cycle's dates (`cycles`); the merging is pure code in lib/daily-calendar.ts. The page only sees CalendarData.
import { hasSupabaseEnv } from '@btx/data';
import { readRows, whoAmI, type Row } from './daily-db';
import { CalendarReadTruncated, chunks, readAllPages } from './calendar-paging';
import { sessionClient } from './supabase-server';
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
    // Paged reads (lib/calendar-paging.ts): the API caps a request at 1,000 rows, so every table that grows with use is read
    // in pages of up to 1,000 ordered by a unique key until an empty page, up to 20 pages; past that the page fails (never cut short).
    // The small tables (cycles, milestones, people) stay single reads.
    const [events, tasks, posts, cycles, milestones, bookings, slots, pairings, apps, people] = await Promise.all([
      paged('calendar_events', 'id, title, kind, area, starts_at, ends_at, all_day, location, video_url, owner_id', ['starts_at', 'id']),
      // Only open tasks can show (taskItems skips the rest), so only those are read.
      paged('tasks', 'id, title, area, status, due_on, archived', ['id'], { in: { status: ['open', 'in_progress'] } }),
      soft(paged('posts', 'id, title, post_on, owner_id', ['id'])),
      soft(readRows('cycles', 'id, status, opens_at, closes_at, interview_start, interview_end, decision_date')),
      soft(readRows('plan_milestones', 'id, name, area, due_on, done, archived')),
      soft(paged('bookings', 'id, application_id, slot_id, status', ['id'], { eq: { status: 'active' } })),
      soft(paged('interview_slots', 'id, starts_at', ['starts_at', 'id'])),
      soft(paged('interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url', ['slot_id'])),
      soft(paged('applications', 'id, applicant_code, full_name', ['id'], { eq: { status: 'submitted' } })),
      readRows('staff_profiles', 'user_id, display_name'),
    ]);
    // Assignees of the open tasks only, 100 task ids per read, each read paged by the table's key (task_id, user_id).
    const taskIds = tasks.map((t) => String(t.id));
    const assignees = (await Promise.all(chunks(taskIds).map((ids) => paged('task_assignees', 'task_id, user_id', ['task_id', 'user_id'], { in: { task_id: ids } })))).flat();
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

type Res = { data: Row[] | null; error: unknown };
type PageQ = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => PageQ;
  in: (c: string, v: unknown[]) => PageQ;
  order: (c: string, o: { ascending: boolean }) => PageQ;
  range: (from: number, to: number) => PageQ;
};
type PageClient = { from: (t: string) => { select: (cols: string) => PageQ } };

// Reads every matching row of a table in pages of up to 1,000 (`.range()`, until an empty page), ordered by `order` (ascending; the last column must
// make the order unique so no row is skipped or repeated between pages). Throws on a refused read or past the 20-page ceiling.
async function paged(table: string, select: string, order: string[], o: { eq?: Record<string, unknown>; in?: Record<string, unknown[]> } = {}): Promise<Row[]> {
  const client = (await sessionClient()) as unknown as PageClient;
  return readAllPages(table, async (from, to) => {
    let q = client.from(table).select(select);
    for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
    for (const [c, v] of Object.entries(o.in ?? {})) q = q.in(c, v);
    for (const c of order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw error;
    return data ?? [];
  });
}

// A read that may be forbidden for this role falls back to no rows, but a read cut off at the page ceiling still fails
// the page (a calendar silently missing rows would look complete).
async function soft(p: Promise<Row[]>): Promise<Row[]> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof CalendarReadTruncated) throw e;
    return [];
  }
}
