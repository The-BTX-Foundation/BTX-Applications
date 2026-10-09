// Booking and changing an interview time: the database function switch_booking does both (switching is instant, there
// is no approval step). It returns 'booked' (first booking), 'switched' (moved, old time released), 'unchanged' (she
// already holds that time) or 'taken' (someone else holds it; nothing changed). Its errors are plain words in the
// message, mapped here to what the screen should say.
//
// NOT TESTED AGAINST LIVE DATA: written from the migration (20261009130000_portal_fresh_start.sql) and unit-tested
// with a stand-in client only.
import type { BtxClient } from './client';

export type BookResult =
  | { ok: true; result: 'booked' | 'switched' | 'unchanged' }
  | { ok: false; kind: 'taken' | 'slot_gone' | 'not_submitted' | 'network' | 'unknown' };

export async function bookSlot(client: BtxClient, slotId: string): Promise<BookResult> {
  const { data, error } = await client.rpc('switch_booking', { p_new_slot: slotId });
  if (!error) {
    if (data === 'taken') return { ok: false, kind: 'taken' };
    if (data === 'booked' || data === 'switched' || data === 'unchanged') return { ok: true, result: data };
    return { ok: false, kind: 'unknown' };
  }
  const msg = error.message ?? '';
  // slot_not_found and slot_in_past both mean the time can no longer be booked
  if (msg.includes('slot_not_found') || msg.includes('slot_in_past')) return { ok: false, kind: 'slot_gone' };
  if (msg.includes('no_submitted_application')) return { ok: false, kind: 'not_submitted' };
  return { ok: false, kind: error.code ? 'unknown' : 'network' };
}
