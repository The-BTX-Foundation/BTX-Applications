// SERVER ONLY. Reads every table the Google Calendar feed is built from, with the service-role client (the caller is the
// Apps Script, which has no Supabase session, so row-level security cannot apply; the route checks the caller first).
// All or nothing: any failed read throws, because a partial list would make the Apps Script delete real events.
// Applicant fields are deliberately not read beyond id and applicant_code (see lib/calendar-sync/build-events.ts).
import { createServiceClient, type ServiceClient } from '@btx/data/server';
import type { SyncRows } from './build-events';

// Rows asked for per request. The server may cap a page lower than this (PostgREST max-rows), so a short page does NOT
// mean the end: paging stops only when a page comes back empty.
const PAGE = 1000;
// A table needing more pages than this is treated as a fault (a server answering the same page forever), not data.
const MAX_PAGES = 200;

/**
 * Reads every row of one table, page by page, ordered by the `order` columns (a unique key, so pages never overlap or
 * skip) and starting each page where the last one ended. Throws on any error, so a caller never sees part of a table.
 * Exported for tests (tests/calendar-sync-load.test.ts).
 */
export async function readAll(db: ServiceClient, table: string, columns: string, order: string[], eq?: Record<string, string>): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error(`calendar sync: too many pages in ${table}`);
    let q = db.from(table).select(columns);
    for (const [col, val] of Object.entries(eq ?? {})) q = q.eq(col, val);
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(rows.length, rows.length + PAGE - 1);
    // The message names the table only; the database's own error text stays out of logs and responses.
    if (error || !Array.isArray(data)) throw new Error(`calendar sync: could not read ${table}`);
    if (data.length === 0) return rows;
    rows.push(...(data as unknown as Record<string, unknown>[]));
  }
}

/** Reads all the feed's rows. Throws when the service key is missing or any read fails (never returns partial data). */
export async function loadSyncRows(): Promise<SyncRows> {
  const db = createServiceClient();
  if (!db) throw new Error('calendar sync: no service key');
  const [events, tasks, assignees, posts, milestones, cycles, bookings, slots, pairings, apps, people] = await Promise.all([
    readAll(db, 'calendar_events', 'id, title, starts_at, ends_at, all_day, location, video_url, owner_id', ['id']),
    readAll(db, 'tasks', 'id, title, status, due_on, archived', ['id']),
    readAll(db, 'task_assignees', 'task_id, user_id', ['task_id', 'user_id']),
    readAll(db, 'posts', 'id, title, post_on', ['id']),
    readAll(db, 'plan_milestones', 'id, name, due_on, done, archived', ['id']),
    readAll(db, 'cycles', 'id, status, opens_at, closes_at, interview_start, interview_end, decision_date', ['id']),
    readAll(db, 'bookings', 'id, application_id, slot_id, status', ['id'], { status: 'active' }),
    readAll(db, 'interview_slots', 'id, starts_at, ends_at', ['id']),
    readAll(db, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url', ['slot_id']),
    // Only the application number: no name, email or other applicant field is ever read for this feed.
    readAll(db, 'applications', 'id, applicant_code', ['id'], { status: 'submitted' }),
    readAll(db, 'staff_profiles', 'user_id, display_name', ['user_id']),
  ]);
  return { events, tasks, assignees, posts, milestones, cycles, bookings, slots, pairings, apps, people };
}
