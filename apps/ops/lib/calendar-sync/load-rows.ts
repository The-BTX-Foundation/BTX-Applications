// SERVER ONLY. Reads every table the Google Calendar feed is built from, with the service-role client (the caller is the
// Apps Script, which has no Supabase session, so row-level security cannot apply; the route checks the caller first).
// All or nothing: any failed read throws, because a partial list would make the Apps Script delete real events.
// Applicant fields are deliberately not read beyond id and applicant_code (see lib/calendar-sync/build-events.ts).
import { createServiceClient, type ServiceClient } from '@btx/data/server';
import type { SyncRows } from './build-events';

// PostgREST returns at most this many rows per request, so each table is read in pages of this size.
const PAGE = 1000;

// Reads every row of one table, page by page, ordered by `order` so pages never overlap. Throws on any error.
async function readAll(db: ServiceClient, table: string, columns: string, order: string, eq?: Record<string, string>): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(columns).order(order, { ascending: true }).range(from, from + PAGE - 1);
    for (const [col, val] of Object.entries(eq ?? {})) q = q.eq(col, val);
    const { data, error } = await q;
    // The message names the table only; the database's own error text stays out of logs and responses.
    if (error || !Array.isArray(data)) throw new Error(`calendar sync: could not read ${table}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE) return rows;
  }
}

/** Reads all the feed's rows. Throws when the service key is missing or any read fails (never returns partial data). */
export async function loadSyncRows(): Promise<SyncRows> {
  const db = createServiceClient();
  if (!db) throw new Error('calendar sync: no service key');
  const [events, tasks, assignees, posts, milestones, cycles, bookings, slots, pairings, apps, people] = await Promise.all([
    readAll(db, 'calendar_events', 'id, title, starts_at, ends_at, all_day, location, video_url, owner_id', 'id'),
    readAll(db, 'tasks', 'id, title, status, due_on, archived', 'id'),
    readAll(db, 'task_assignees', 'task_id, user_id', 'task_id'),
    readAll(db, 'posts', 'id, title, post_on', 'id'),
    readAll(db, 'plan_milestones', 'id, name, due_on, done, archived', 'id'),
    readAll(db, 'cycles', 'id, status, opens_at, closes_at, interview_start, interview_end, decision_date', 'id'),
    readAll(db, 'bookings', 'id, application_id, slot_id, status', 'id', { status: 'active' }),
    readAll(db, 'interview_slots', 'id, starts_at, ends_at', 'id'),
    readAll(db, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url', 'slot_id'),
    // Only the application number: no name, email or other applicant field is ever read for this feed.
    readAll(db, 'applications', 'id, applicant_code', 'id', { status: 'submitted' }),
    readAll(db, 'staff_profiles', 'user_id, display_name', 'user_id'),
  ]);
  return { events, tasks, assignees, posts, milestones, cycles, bookings, slots, pairings, apps, people };
}
