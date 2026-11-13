// Live mode: builds the Board members view (lib/people-view.ts) from the real tables as the signed-in person. Every read goes
// through the session client, so row-level security applies exactly as on the other pages; nothing here uses the service
// key. The mapping is pure (lib/people-map.ts).
// Core reads (fail the page's card): staff_profiles and staff_directory() (role and last sign-in). Optional reads (fail only
// the work cells, which then say "Couldn't count"): open tasks, their assignees, and the booked interviews still ahead.
// Every read that can grow is paged (lib/calendar-paging.ts readAllPages: .range(), a unique order, an empty page ends it, a
// ceiling throws) and `in (...)` id lists go in chunks of 100.
import { chunks, readAllPages } from './calendar-paging';
import { whoAmI } from './daily-db';
import { dateLabel, joinBooked } from './today-map';
import { easternDay } from './refresh-time';
import { mapPeople, mapWork, type Row } from './people-map';
import { sessionClient } from './supabase-server';
import type { PeopleResult, PeopleView } from './people-view';

type Res = { data: Row[] | null; error: unknown };
type Q = PromiseLike<Res> & {
  eq: (c: string, v: unknown) => Q;
  in: (c: string, v: unknown[]) => Q;
  gte: (c: string, v: string) => Q;
  order: (c: string, o: { ascending: boolean }) => Q;
  range: (from: number, to: number) => Q;
  limit: (n: number) => Q;
};
type Loose = { from: (t: string) => { select: (cols: string) => Q }; rpc: (fn: string) => PromiseLike<Res> };

/** A filtered, paged read: the filters, then the unique order columns. */
type Read = { eq?: Record<string, unknown>; in?: [string, unknown[]]; gte?: Record<string, string>; order: string[] };

/** The most rows staff_directory() may return before the read counts as cut short (the API's per-request cap). */
export const DIRECTORY_CAP = 1000;

/** A failed read, tagged with its table and the database's error code (never any row data). */
class ReadFailed extends Error {
  constructor(public readonly table: string, public readonly code: string) {
    super(`${table} read failed`);
  }
}

// Logs a failed read with the table and error code only: never names, emails or roles.
function logRead(e: unknown, fallback: string): void {
  const table = e instanceof ReadFailed ? e.table : typeof (e as { table?: unknown })?.table === 'string' ? String((e as { table: string }).table) : fallback;
  const raw = (e as { code?: unknown })?.code;
  const code = e instanceof ReadFailed ? e.code : typeof raw === 'string' ? raw : e instanceof Error ? e.name : 'unknown';
  console.error('[people] read failed', { table, code });
}

// The error code of a Supabase error, or 'error'.
const codeOf = (error: unknown) => (typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code) : 'error');

// Every row of `table` matching `o`, in pages ordered by `o.order` (unique together, so no row is skipped or read twice).
async function readAll(client: Loose, table: string, select: string, o: Read): Promise<Row[]> {
  return readAllPages(table, async (from, to) => {
    let q = client.from(table).select(select);
    for (const [c, v] of Object.entries(o.eq ?? {})) q = q.eq(c, v);
    if (o.in) q = q.in(o.in[0], o.in[1]);
    for (const [c, v] of Object.entries(o.gte ?? {})) q = q.gte(c, v);
    for (const c of o.order) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, to);
    if (error) throw new ReadFailed(table, codeOf(error));
    return data ?? [];
  });
}

// The rows whose `column` is one of `ids`, 100 ids per request, each request paged. No ids = no read.
async function readIn(client: Loose, table: string, select: string, column: string, ids: string[], o: Omit<Read, 'in'>): Promise<Row[]> {
  const out: Row[] = [];
  for (const part of chunks([...new Set(ids)])) out.push(...(await readAll(client, table, select, { ...o, in: [column, part] })));
  return out;
}

/** The open work of every board member, or null when any of its reads failed (the cells then say "Couldn't count"). */
async function readWork(client: Loose, now: Date): Promise<{ tasks: Row[]; assignees: Row[]; booked: ReturnType<typeof joinBooked> } | null> {
  try {
    // Open tasks only (not archived, open or in progress), then only their assignees.
    const tasks = await readAll(client, 'tasks', 'id, title, area, status, due_on, archived', { eq: { archived: false }, in: ['status', ['open', 'in_progress']], order: ['id'] });
    const assignees = await readIn(client, 'task_assignees', 'task_id, user_id', 'task_id', tasks.map((t) => String(t.id)), { order: ['task_id', 'user_id'] });
    // Interviews still ahead: slots not ended yet, their active bookings, pairs and applicants (names: all staff, D2).
    const slots = await readAll(client, 'interview_slots', 'id, starts_at, ends_at', { gte: { ends_at: now.toISOString() }, order: ['id'] });
    const slotIds = slots.map((s) => String(s.id));
    const [bookings, pairings] = await Promise.all([
      readIn(client, 'bookings', 'application_id, slot_id, status', 'slot_id', slotIds, { eq: { status: 'active' }, order: ['slot_id', 'application_id'] }),
      readIn(client, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b', 'slot_id', slotIds, { order: ['slot_id'] }),
    ]);
    const apps = await readIn(client, 'applications', 'id, applicant_code, full_name', 'id', bookings.map((b) => String(b.application_id)), { order: ['id'] });
    return { tasks, assignees, booked: joinBooked(bookings, slots, apps, pairings) };
  } catch (e) {
    logRead(e, 'work');
    return null;
  }
}

/**
 * The day the newest published cycle's interviews start, or null (no cycle, no date, or a failed read). The column is a
 * `date` ("2026-11-16"): the day is read as written, never through a time zone (as an instant it would be midnight UTC,
 * the evening before in Eastern time).
 */
async function readInterviewsStart(client: Loose): Promise<string | null> {
  try {
    const { data, error } = await client.from('cycles').select('interview_start, created_at').eq('status', 'published').order('created_at', { ascending: false }).limit(1);
    if (error) throw new ReadFailed('cycles', codeOf(error));
    if (!data?.[0]?.interview_start) return null;
    return String(data[0].interview_start).slice(0, 10);
  } catch (e) {
    logRead(e, 'cycles');
    return null;
  }
}

/**
 * Reads the real tables and returns the Board members view. Not signed in = the whole-page failure; a failed core read =
 * the view with `loadFailed` (the title and the "didn't load" card with Try again).
 */
export async function loadLivePeopleView(): Promise<PeopleResult> {
  const who = await whoAmI().catch((e: unknown) => {
    logRead(e, 'auth');
    return null;
  });
  if (!who) return { failed: true };
  const now = new Date();
  const today = easternDay(now.toISOString());
  const base: Omit<PeopleView, 'people' | 'work' | 'workFailed' | 'interviewsStart' | 'loadFailed'> = {
    today,
    dateLabel: dateLabel(today),
    me: who.id,
    // Live writes that exist: the role change (server action, double-checked there) and a direct message in Board chat.
    // There is no chat unsend (no nudge Undo) and no link that opens one direct conversation (no "Message" link).
    caps: { changeRole: true, nudge: true, nudgeUndo: false, message: false, mock: false },
  };
  try {
    const client = (await sessionClient()) as unknown as Loose;
    const [profiles, dir] = await Promise.all([
      readAll(client, 'staff_profiles', 'user_id, display_name, initials, title, created_at', { order: ['created_at', 'user_id'] }),
      client.rpc('staff_directory'),
    ]);
    if (dir.error) throw new ReadFailed('staff_directory', codeOf(dir.error));
    // staff_directory() is not paged: a full page means more may exist, so it counts as a failed read, never a short list.
    if ((dir.data ?? []).length >= DIRECTORY_CAP) throw new ReadFailed('staff_directory', 'row_cap');
    const people = mapPeople(profiles, dir.data ?? []);
    const [work, interviewsStart] = await Promise.all([readWork(client, now), readInterviewsStart(client)]);
    return {
      ...base,
      people,
      work: work ? mapWork(people, work.tasks, work.assignees, work.booked, now.toISOString()) : {},
      workFailed: work === null,
      interviewsStart,
      loadFailed: false,
      failed: false,
    };
  } catch (e) {
    logRead(e, 'staff');
    return { ...base, people: [], work: {}, workFailed: true, interviewsStart: null, loadFailed: true, failed: false };
  }
}
