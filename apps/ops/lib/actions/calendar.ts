'use client';

// The Calendar's "Add event" write, called from the page component in the browser. Mock mode (no Supabase env): it
// succeeds in memory and the page keeps the new event in its own state. Live mode inserts a `calendar_events` row as the
// signed-in person (title, kind 'event', area, starts_at, all_day, owner_id); created_by fills itself in.
import { eventTimes, type EventInput, checkEvent } from '../calendar-event';
import { failure, isMock, localId, loose, type ActionResult } from './common';

export async function addCalendarEvent(input: EventInput & { ownerId?: string }): Promise<ActionResult<{ id: string }>> {
  const check = checkEvent(input);
  if (!check.ok) return { ok: false, message: check.message };
  if (isMock()) return { ok: true, id: localId('event') };
  try {
    const row: Record<string, unknown> = { title: check.title, kind: 'event', area: check.area, ...eventTimes(check.date, check.time) };
    if (input.ownerId) row.owner_id = input.ownerId;
    const { data, error } = await loose().from('calendar_events').insert(row).select('id').single();
    if (error || !data) throw error ?? new Error('not saved');
    return { ok: true, id: String(data.id) };
  } catch (e) {
    return failure(e);
  }
}
