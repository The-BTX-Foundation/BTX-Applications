// Contract shared by the interview page (Change interviewer) and the Availability save (auto cover).
// Do not change the exported signatures.
//
// SERVER ONLY. Callers check permission first (an admin's "Change interviewer"; a board member whose own Availability
// save took them off an interview). The work then runs with the service role, so a board member's save can move their
// own seat without admin rights: interview_candidates() and the pairing write both need admin or the service role.
// Without the service key nothing in the database changes; in mock mode (no Supabase env) nothing is read or written.
//
// Who may take over comes from interview_candidates(), the same rule pairing uses: admins and board members free for the
// whole time (board_free_ranges), under their own "Most N interviews" (board_interview_prefs), not someone who listed the
// student under "Students I know" (board_conflicts) and not on another interview then. The two already on it are left
// out, and the least loaded comes first.
//
// Emails (lib/email/interviews.ts sendRebalanceEmails, the same emails "Rebalance" sends): the member added gets
// "You're now interviewing <student>, <when>" with the time, the Teams link (or "video later"), the scorecard link and a
// calendar invite; the member taken off gets "You're no longer interviewing <student>" with a calendar cancel. Each is
// sent once per change (email_log; the key carries this change's id, so a later change on the same interview emails again). Teams meetings are made from meetings@ with no attendees (lib/teams/graph.ts), so there are no
// attendees to update: the email and its calendar invite carry the change.
import 'server-only';
import { hasSupabaseEnv } from '@btx/data';
import { initialsFrom, replacements } from './interview-cover';
import { sendRebalanceEmails } from './email/interviews';
import { readCandidates, swapInterviewer, SWAP_TAKEN, type Db } from './pairing-db';
import { MOCK_ME, MOCK_STAFF } from '@/mock/staff';

export type ReplacementCandidate = { id: string; name: string; initials: string };

export type ReassignResult =
  | { ok: true; incomingId: string; incomingName: string }
  | { ok: false; reason: 'no_one_free' | 'not_paired' | 'taken' | 'error'; message: string };

const NO_KEY = "Ops Hub can't change interviewers right now. Try again later.";
const READ_FAILED = "Couldn't check who is free. Try again.";
const NOT_FREE = "That person can't take this interview. Pick someone who is free then.";
export const NO_ONE_FREE = 'Nobody else is free for the whole time.';

/** One reassign's id for the email keys: the time of the change plus a short random part, so two changes never share it. */
export function reassignChangeId(now: Date): string {
  return `${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Mock mode: three board members are free (the fixture's names); nothing changes.
const MOCK_FREE = MOCK_STAFF.filter((s) => s.user_id !== MOCK_ME).slice(0, 3);

async function serviceDb(): Promise<Db | null> {
  const { createServiceClient } = await import('@btx/data/server');
  return createServiceClient() as Db | null;
}

type SlotState = { cycleId: string; pair: [string, string] | null; applicationId: string | null };

// The interview's cycle, its two interviewers and the active booking's application. Null when the time is gone.
async function readSlot(db: Db, slotId: string): Promise<SlotState | null> {
  const [slot, pr, bk] = await Promise.all([
    db.from('interview_slots').select('cycle_id').eq('id', slotId).maybeSingle(),
    db.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', slotId).maybeSingle(),
    db.from('bookings').select('application_id').eq('slot_id', slotId).eq('status', 'active').maybeSingle(),
  ]);
  if (slot.error || pr.error || bk.error) throw new Error('read');
  if (!slot.data) return null;
  const p = pr.data as { interviewer_a: string; interviewer_b: string } | null;
  return {
    cycleId: (slot.data as { cycle_id: string }).cycle_id,
    pair: p ? [p.interviewer_a, p.interviewer_b] : null,
    applicationId: (bk.data as { application_id: string } | null)?.application_id ?? null,
  };
}

async function freeOn(db: Db, slotId: string, s: SlotState) {
  return replacements(await readCandidates(db, slotId, s.applicationId), s.pair ?? []);
}

/**
 * Board members free for the whole interview time and not already on it, least-loaded first. `db` (optional) is a
 * service-role or admin client; the default is the service role.
 */
export async function listFreeReplacements(slotId: string, db?: Db): Promise<ReplacementCandidate[]> {
  if (!db && !hasSupabaseEnv()) return MOCK_FREE.map((s) => ({ id: s.user_id, name: s.display_name, initials: s.initials }));
  const client = db ?? (await serviceDb());
  if (!client) return [];
  const s = await readSlot(client, slotId);
  if (!s) return [];
  return (await freeOn(client, slotId, s)).map((c) => ({ id: c.userId, name: c.name, initials: initialsFrom(c.name) }));
}

/**
 * Take `outgoingId` off the interview at `slotId` and put `incomingId` on it (or the best free member when omitted).
 * Callers check permission first. On success it tells the incoming member (email with the Teams link and a calendar
 * invite) and the outgoing member (a short note with a calendar cancel). Teams meetings carry no attendees, so there is
 * nothing to update there. `db` (optional) is a service-role or admin client; the default is the service role.
 */
export async function reassignInterviewer(
  input: {
    slotId: string;
    outgoingId: string;
    incomingId?: string | null;
    why: 'covered_by_admin' | 'availability_removed';
  },
  db?: Db,
): Promise<ReassignResult> {
  const { slotId, outgoingId } = input;
  if (!db && !hasSupabaseEnv()) {
    const pick = input.incomingId ? MOCK_STAFF.find((s) => s.user_id === input.incomingId) : MOCK_FREE[0];
    if (!pick) return { ok: false, reason: 'taken', message: NOT_FREE };
    return { ok: true, incomingId: pick.user_id, incomingName: pick.display_name };
  }
  const client = db ?? (await serviceDb());
  if (!client) return { ok: false, reason: 'error', message: NO_KEY };
  let s: SlotState | null;
  let cands: Awaited<ReturnType<typeof freeOn>>;
  try {
    s = await readSlot(client, slotId);
    if (!s || !s.pair) return { ok: false, reason: 'not_paired', message: 'That interview has no pair yet.' };
    if (!s.pair.includes(outgoingId)) return { ok: false, reason: 'taken', message: 'That person is no longer on this interview.' };
    cands = await freeOn(client, slotId, s);
  } catch {
    return { ok: false, reason: 'error', message: READ_FAILED };
  }
  const chosen = input.incomingId ? cands.find((c) => c.userId === input.incomingId) : cands[0];
  if (!chosen) return input.incomingId ? { ok: false, reason: 'taken', message: NOT_FREE } : { ok: false, reason: 'no_one_free', message: NO_ONE_FREE };
  const r = await swapInterviewer(client, slotId, outgoingId, chosen.userId, { trusted: true });
  if (!r.ok) return { ok: false, reason: r.message === SWAP_TAKEN ? 'taken' : 'error', message: r.message };

  // The emails never undo the change: a problem sending is logged (no names), and the seat stays moved.
  try {
    const out = await client.from('staff_profiles').select('display_name').eq('user_id', outgoingId).maybeSingle();
    const fromName = (out.data as { display_name: string } | null)?.display_name ?? 'there';
    const changeId = reassignChangeId(new Date());
    const mail = await sendRebalanceEmails(s.cycleId, [{ slotId, from: outgoingId, to: chosen.userId, fromName, changeId }], { isAdmin: async () => true });
    if (!mail.ok) console.error('[reassign] emails not sent', { reason: mail.reason, why: input.why });
    else if (mail.failed > 0) console.error('[reassign] some emails failed', { failed: mail.failed, why: input.why });
  } catch (err) {
    console.error('[reassign] emails failed', err instanceof Error ? err.message : 'unknown');
  }
  return { ok: true, incomingId: chosen.userId, incomingName: chosen.name };
}
