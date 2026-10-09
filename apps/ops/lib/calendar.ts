// The Calendar page's data. MOCK today (mock/calendar.ts). Live mode merges what the draft schema keeps in separate
// tables into one list of CalItems: `calendar_events` (events entered in the app), interviews (`interview_pairings` /
// `bookings`), task due dates (`tasks.due_on`), posts (`posts`) and the cycle's dates (`cycles`). Going live is a swap
// inside loadCalendar; the page and components only see CalendarData.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from './supabase-server';
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

// An Eastern-time calendar date ("2026-10-05") and clock time ("10:00 AM") from a timestamp.
const ny = (ts: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...o }).format(new Date(ts));

export async function loadCalendar(opts: { demo?: string } = {}): Promise<CalendarData> {
  const failed: CalendarData = { today: '', me: '', people: [], items: [], failed: true };
  if (opts.demo === 'error') return failed;
  if (!hasSupabaseEnv()) return { ...(opts.demo === 'stress' ? MOCK_CALENDAR_STRESS : MOCK_CALENDAR), failed: false };
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    // The generated DB types do not know the draft tables yet, so the query builder is used untyped.
    type Q = { select: (c: string) => Q & PromiseLike<{ data: unknown[] | null; error: unknown }>; order: (c: string) => PromiseLike<{ data: unknown[] | null; error: unknown }> };
    const client = (await sessionClient()) as unknown as { from: (t: string) => Q };
    const { data, error } = await client.from('calendar_events').select('id, title, kind, area, starts_at, ends_at, all_day, location, video_url, cycle_id, program_id, owner_id').order('starts_at');
    if (error) throw error;
    const events = ((data ?? []) as CalendarEventRow[]).map((e) => ({
      id: e.id,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(e.starts_at)),
      source: 'event' as const,
      area: e.area ?? 'scholarships',
      chip: e.all_day ? e.title : `${ny(e.starts_at, { hour: 'numeric', minute: '2-digit' }).replace(' PM', '').replace(' AM', '')} ${e.title}`,
      title: e.title,
      start: e.all_day ? null : ny(e.starts_at, { hour: 'numeric', minute: '2-digit' }),
      people: e.owner_id ? [e.owner_id] : [],
      video: Boolean(e.video_url),
    }));
    // TODO: merge interviews, task due dates, posts and the cycle's dates, the signed-in person's id (`me`) and the
    // staff list (`staff_directory()`); until then those parts return the mock shape.
    return { ...MOCK_CALENDAR, items: [...MOCK_CALENDAR.items.filter((i) => i.source !== 'event'), ...events], failed: false };
  } catch {
    return failed;
  }
}
