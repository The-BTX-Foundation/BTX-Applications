// The application cycle and the applicant's own application: reads and writes through the browser client.
// Row-level security does the real checking (see supabase/migrations/20261009130000_portal_fresh_start.sql):
// anyone can read the published cycle, an applicant can read and edit only her own draft, and she can start a draft
// only while the cycle is published and open.
import type { BtxClient } from './client';
import type { Row } from './database.types';

export type Cycle = Row<'cycles'>;
export type Application = Row<'applications'>;

/** Which landing the cycle's dates call for. */
export type CycleVariant = 'before-open' | 'open' | 'closed';

// Works out the landing from the dates: before opens_at, between, or after closes_at. No cycle means closed.
export function cycleVariant(cycle: Pick<Cycle, 'opens_at' | 'closes_at'> | null, now: Date = new Date()): CycleVariant {
  if (!cycle || !cycle.opens_at) return 'closed';
  if (now < new Date(cycle.opens_at)) return 'before-open';
  if (cycle.closes_at && now >= new Date(cycle.closes_at)) return 'closed';
  return 'open';
}

// The one published cycle, or null. The signed-out visitor can read it (the cycles_select_public policy).
export async function getPublishedCycle(client: BtxClient): Promise<Cycle | null> {
  const { data } = await client.from('cycles').select('*').eq('status', 'published').maybeSingle();
  return data;
}

export type EnsureResult =
  | { kind: 'ok'; cycle: Cycle; application: Application }
  | { kind: 'closed' }
  | { kind: 'error'; message: string };

// Finds the signed-in student's application for the published cycle, or starts one. The insert sends only cycle_id:
// user_id and terpmail default from her token, and status stays "draft" (she has no column privilege to set it).
export async function ensureApplication(client: BtxClient): Promise<EnsureResult> {
  const cycle = await getPublishedCycle(client);
  if (!cycle) return { kind: 'closed' };
  const found = await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle();
  if (found.error) return { kind: 'error', message: found.error.message };
  // a submitted application stays reachable after the deadline (the status page)
  if (found.data?.status === 'submitted') return { kind: 'ok', cycle, application: found.data };
  if (cycleVariant(cycle) !== 'open') return { kind: 'closed' };
  if (found.data) return { kind: 'ok', cycle, application: found.data };
  const made = await client.from('applications').insert({ cycle_id: cycle.id }).select('*').single();
  if (made.error) return { kind: 'error', message: made.error.message };
  return { kind: 'ok', cycle, application: made.data };
}

// Saves some answers on an application and returns the time of the save (the table's own updated_at).
export async function saveApplication(
  client: BtxClient,
  id: string,
  patch: Partial<
    Pick<
      Application,
      | 'full_name'
      | 'secondary_email'
      | 'phone'
      | 'gender'
      | 'race'
      | 'heard_from'
      | 'year_in_school'
      | 'credits_left'
      | 'major'
      | 'interest_certification'
      | 'interest_mentoring'
      | 'essay'
      | 'stay_in_touch'
      | 'agreed_true'
      | 'current_step'
    >
  >,
): Promise<{ ok: true; savedAt: string } | { ok: false; message: string }> {
  const { data, error } = await client.from('applications').update(patch).eq('id', id).select('updated_at').single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, savedAt: data.updated_at };
}

export type NotifyKind = 'applications_open' | 'next_cycle';

// "Email me when ...": saves a visitor's address through the request_cycle_email function (the only way in).
export async function requestCycleEmail(client: BtxClient, email: string, kind: NotifyKind): Promise<{ ok: boolean }> {
  const { error } = await client.rpc('request_cycle_email', { p_email: email, p_kind: kind });
  return { ok: !error };
}
