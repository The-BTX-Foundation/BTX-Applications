'use client';

// The Calendar's write actions for LIVE mode. Mock mode never calls these (the board changes its own state, like the demo).
// Row-level security (calendar_events_team_all: admin and board) decides what the signed-in person may change; nothing here
// widens it. The page makes the event's id itself (crypto.randomUUID), so an insert sends `id` and a retry of the same add
// sends the same id: a duplicate-key error (23505) then means the row is already there (lib/calendar-add-flow.ts). A
// delete reports how many rows went (RLS filters a refused delete to zero rows without an error). Every call gives up after
// 15 seconds (a hung request counts as a failed write).
import { getBrowserClient } from '@btx/data';
import { checkEvent, eventTimes } from '@/lib/calendar-event';
import { insertSaved } from '@/lib/calendar-add-flow';

type Abortable<T> = { abortSignal: (s: AbortSignal) => Promise<T> };
type Loose = {
  from: (t: string) => {
    insert: (v: Record<string, unknown>) => Abortable<{ error: unknown }>;
    delete: () => { eq: (c: string, v: string) => { select: (c: string) => Abortable<{ data: { id: string }[] | null; error: unknown }> } };
  };
};
const db = () => getBrowserClient() as unknown as Loose;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(15_000);

/** What the add field saves: the page-made id, the day, "19:00" or "all-day", the area slug and the owner (the signed-in person). */
export type NewEvent = { id: string; title: string; date: string; time: string; area: string; ownerId: string };

// Adds one calendar_events row with the given id (kind 'event', the person as owner; created_by fills itself in).
// True when the row is in the table afterwards (saved now, or by an earlier try of the same add).
export async function insertEvent(e: NewEvent): Promise<boolean> {
  const check = checkEvent(e);
  if (!check.ok) return false;
  try {
    const row = { id: e.id, title: check.title, kind: 'event', area: check.area, owner_id: e.ownerId, ...eventTimes(check.date, check.time) };
    const { error } = await db().from('calendar_events').insert(row).abortSignal(limit());
    return insertSaved(error);
  } catch {
    return false;
  }
}

// Undo of an add: deletes that row. Returns how many rows went (0 or 1), or null when the delete itself failed.
export async function deleteEvent(id: string): Promise<number | null> {
  try {
    const { data, error } = await db().from('calendar_events').delete().eq('id', id).select('id').abortSignal(limit());
    return error || !Array.isArray(data) ? null : data.length;
  } catch {
    return null;
  }
}
