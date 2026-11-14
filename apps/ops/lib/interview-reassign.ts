// Contract shared by the interview page (Change interviewer) and the Availability save (auto cover).
// Do not change the exported signatures.
//
// SERVER ONLY. Callers check permission first (any admin or board member's "Change interviewer" on the interview page; a
// board member whose own Availability save took them off an interview). The work then runs with the service role, so a
// board member can move a seat without admin rights: interview_candidates(), conflicted_board_members() and the pairing
// write all need the service role (or admin).
// Without the service key nothing in the database changes; in mock mode (no Supabase env) nothing is read or written.
//
// Who may take over comes from interview_candidates(), the same rule pairing uses: admins and board members free for the
// whole time (board_free_ranges), under their own "Most N interviews" (board_interview_prefs), not someone who listed the
// student under "Students I know" (board_conflicts) and not on another interview then. The two already on it are left
// out, and the least loaded comes first. That is the only rule for the automatic cover (Availability save).
//
// The interview page's Change sheet (listReplacementOptions) lists every admin and board member who is not on it, does not
// know the student and is not on another interview then: the free ones first, the rest with a note ("Not marked free
// then", "At their limit of N"). Picking someone not marked free adds the interview time to their free hours first
// (board_free_ranges), so the interview does not show "Needs cover"; their limit is left as it is.
//
// Emails (lib/email/interviews.ts sendRebalanceEmails, the same emails "Rebalance" sends): the member added gets
// "You're now interviewing <student>, <when>" with the time, the Teams link (or "video later"), the scorecard link and a
// calendar invite; the member taken off gets "You're no longer interviewing <student>" with a calendar cancel. Each is
// sent once per change (email_log; the key carries this change's id, so a later change on the same interview emails again). Teams meetings are made from meetings@ with no attendees (lib/teams/graph.ts), so there are no
// attendees to update: the email and its calendar invite carry the change.
import 'server-only';
import { hasSupabaseEnv } from '@btx/data';
import type { MinuteRange } from './free-ranges';
import { initialsFrom, replacements } from './interview-cover';
import { sendRebalanceEmails } from './email/interviews';
import { coverRange, needsRange, NOT_FREE_NOTE, replacementOptions, type ReplacementOption } from './interview-replacement-options';
import { readCandidates, readLimits, readRanges, swapInterviewer, SWAP_TAKEN, type Db, type Staff } from './pairing-db';
import { MOCK_ME, MOCK_STAFF } from '@/mock/staff';

export type ReplacementCandidate = { id: string; name: string; initials: string };
export type { ReplacementOption } from './interview-replacement-options';

export type ReassignResult =
  | { ok: true; incomingId: string; incomingName: string }
  | { ok: false; reason: 'no_one_free' | 'not_paired' | 'taken' | 'error'; message: string };

const NO_KEY = "Ops Hub can't change interviewers right now. Try again later.";
const READ_FAILED = "Couldn't check who is free. Try again.";
const NOT_FREE = "That person can't take this interview.";
const SAVE_FAILED = "Couldn't change the interviewer. Try again.";
export const NO_ONE_FREE = 'Nobody else is free for the whole time.';
export const STARTED = "This interview has already started, so it can't be changed.";
export const NOT_CURRENT = "This interview can't be changed now.";
export const BUSY_NOW = 'That person just got another interview at that time.';

/** One reassign's id for the email keys: the time of the change plus a short random part, so two changes never share it. */
export function reassignChangeId(now: Date): string {
  return `${now.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Mock mode: three board members are free (the fixture's names), one more is not; nothing changes.
const MOCK_FREE = MOCK_STAFF.filter((s) => s.user_id !== MOCK_ME).slice(0, 3);
const MOCK_NOT_FREE = MOCK_STAFF.filter((s) => s.user_id !== MOCK_ME)[3];

async function serviceDb(): Promise<Db | null> {
  const { createServiceClient } = await import('@btx/data/server');
  return createServiceClient() as Db | null;
}

type SlotState = { cycleId: string; startsAt: string; endsAt: string; pair: [string, string] | null; applicationId: string | null };

// The interview's cycle, time, its two interviewers and the active booking's application. Null when the time is gone.
async function readSlot(db: Db, slotId: string): Promise<SlotState | null> {
  const [slot, pr, bk] = await Promise.all([
    db.from('interview_slots').select('cycle_id, starts_at, ends_at').eq('id', slotId).maybeSingle(),
    db.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', slotId).maybeSingle(),
    db.from('bookings').select('application_id').eq('slot_id', slotId).eq('status', 'active').maybeSingle(),
  ]);
  if (slot.error || pr.error || bk.error) throw new Error('read');
  if (!slot.data) return null;
  const p = pr.data as { interviewer_a: string; interviewer_b: string } | null;
  const sl = slot.data as { cycle_id: string; starts_at: string; ends_at: string };
  return {
    cycleId: sl.cycle_id,
    startsAt: sl.starts_at,
    endsAt: sl.ends_at,
    pair: p ? [p.interviewer_a, p.interviewer_b] : null,
    applicationId: (bk.data as { application_id: string } | null)?.application_id ?? null,
  };
}

async function freeOn(db: Db, slotId: string, s: SlotState) {
  return replacements(await readCandidates(db, slotId, s.applicationId), s.pair ?? []);
}

// Why the page may not change this interview, or null: it has started (or is over), or it belongs to a cycle other
// than the current one (the newest published cycle, as pairing-db currentCycle reads it).
async function blockedOn(db: Db, s: SlotState, now: Date): Promise<string | null> {
  if (Date.parse(s.startsAt) <= now.getTime()) return STARTED;
  const c = await db.from('cycles').select('id').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (c.error) throw c.error;
  return (c.data as { id: string } | null)?.id === s.cycleId ? null : NOT_CURRENT;
}

/**
 * Why the interview page's Change may not run on this interview, or null when it may. The same check runs inside
 * reassignInterviewer for 'changed_on_page'. Null in mock mode or when the time is gone (the list then says so itself).
 */
export async function changeBlocked(slotId: string, now: Date = new Date(), db?: Db): Promise<string | null> {
  if (!db && !hasSupabaseEnv()) return null;
  const client = db ?? (await serviceDb());
  if (!client) return NO_KEY;
  const s = await readSlot(client, slotId);
  return s ? blockedOn(client, s, now) : null;
}

// The people who know the student (conflicted_board_members(), service role only). PostgREST answers a set of uuids as
// plain strings or as one-field rows, so both are read.
async function readConflicted(db: Db, applicationId: string | null): Promise<string[]> {
  if (!applicationId) return [];
  const r = await db.rpc('conflicted_board_members', { p_application_id: applicationId });
  if (r.error) throw r.error;
  return ((r.data ?? []) as unknown[])
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x as Record<string, unknown>).find((v) => typeof v === 'string') : undefined))
    .filter((x): x is string => typeof x === 'string');
}

// Every other pairing in the cycle with its time, once per interviewer (this interview's own left out).
async function readHeld(db: Db, cycleId: string, slotId: string): Promise<{ userId: string; startsAt: string; endsAt: string }[]> {
  const r = await db.from('interview_pairings').select('slot_id, interviewer_a, interviewer_b, interview_slots!inner(cycle_id, starts_at, ends_at)').eq('interview_slots.cycle_id', cycleId);
  if (r.error) throw r.error;
  const out: { userId: string; startsAt: string; endsAt: string }[] = [];
  for (const p of (r.data ?? []) as { slot_id: string; interviewer_a: string; interviewer_b: string; interview_slots: unknown }[]) {
    if (p.slot_id === slotId) continue;
    const t = (Array.isArray(p.interview_slots) ? p.interview_slots[0] : p.interview_slots) as { starts_at: string; ends_at: string } | null;
    if (!t) continue;
    for (const u of [p.interviewer_a, p.interviewer_b]) if (u) out.push({ userId: u, startsAt: t.starts_at, endsAt: t.ends_at });
  }
  return out;
}

type Options = { options: ReplacementOption[]; ranges: Map<string, MinuteRange[]> };

async function optionsOn(db: Db, slotId: string, s: SlotState, staff: Staff[]): Promise<Options> {
  const [candidates, conflicted, held, rangeRows, limits] = await Promise.all([
    readCandidates(db, slotId, s.applicationId),
    readConflicted(db, s.applicationId),
    readHeld(db, s.cycleId, slotId),
    readRanges(db, s.cycleId),
    readLimits(db, s.cycleId),
  ]);
  const ranges = new Map<string, MinuteRange[]>();
  for (const r of rangeRows) ranges.set(r.userId, [...(ranges.get(r.userId) ?? []), { day: r.day, startMin: r.startMin, endMin: r.endMin }]);
  const options = replacementOptions({ staff, pair: s.pair ?? [], candidates, conflicted, held, ranges, limits, startsAt: s.startsAt, endsAt: s.endsAt });
  return { options, ranges };
}

/**
 * The Change sheet's list: every admin and board member who may take the interview (not on it, not someone who knows the
 * student, not on another interview then), the free ones first (least loaded first), then the rest by name with a note.
 * `staff` is the signed-in session's readStaff() (staff_directory() needs a staff session, not the service role). `db`
 * (optional) is a service-role or admin client; the default is the service role.
 */
export async function listReplacementOptions(slotId: string, staff: Staff[], db?: Db): Promise<ReplacementOption[]> {
  if (!db && !hasSupabaseEnv()) {
    const free = MOCK_FREE.map((s) => ({ id: s.user_id, name: s.display_name, initials: s.initials, free: true, note: null }));
    return MOCK_NOT_FREE ? [...free, { id: MOCK_NOT_FREE.user_id, name: MOCK_NOT_FREE.display_name, initials: MOCK_NOT_FREE.initials, free: false, note: NOT_FREE_NOTE }] : free;
  }
  const client = db ?? (await serviceDb());
  if (!client) return [];
  const s = await readSlot(client, slotId);
  if (!s) return [];
  return (await optionsOn(client, slotId, s, staff)).options;
}

// Makes `userId` free for the whole interview (one board_free_ranges row; the key is cycle, person, day and start). A row
// with the same start is widened, never narrowed. Returns how to put things back if the change then fails, or null when
// the write failed.
async function addCoverRange(db: Db, cycleId: string, userId: string, have: MinuteRange[], s: SlotState): Promise<(() => Promise<void>) | null> {
  const r = coverRange(s.startsAt, s.endsAt);
  const same = have.find((h) => h.day === r.day && h.startMin === r.startMin);
  if (same) {
    if (same.endMin >= r.endMin) return async () => {};
    const u = await db.from('board_free_ranges').update({ end_min: r.endMin }).eq('cycle_id', cycleId).eq('user_id', userId).eq('day', r.day).eq('start_min', r.startMin);
    if (u.error) return null;
    return async () => {
      const b = await db.from('board_free_ranges').update({ end_min: same.endMin }).eq('cycle_id', cycleId).eq('user_id', userId).eq('day', r.day).eq('start_min', r.startMin);
      if (b.error) console.error('[reassign] free range not put back', { cycleId, userId, day: r.day, startMin: r.startMin, code: b.error.code });
    };
  }
  const i = await db.from('board_free_ranges').insert({ cycle_id: cycleId, user_id: userId, day: r.day, start_min: r.startMin, end_min: r.endMin });
  if (i.error) return null;
  return async () => {
    const d = await db.from('board_free_ranges').delete().eq('cycle_id', cycleId).eq('user_id', userId).eq('day', r.day).eq('start_min', r.startMin);
    if (d.error) console.error('[reassign] added free range not removed', { cycleId, userId, day: r.day, startMin: r.startMin, code: d.error.code });
  };
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
 * Callers check permission first.
 *   - No `incomingId` (the Availability save's auto cover): free candidates only (interview_candidates()), as before.
 *   - With `incomingId` and `staff` (the interview page's Change): anyone listReplacementOptions lists. Someone not marked
 *     free then gets the interview time added to their free hours before the seat moves (taken back if the move fails).
 *     Anyone else (knows the student, on another interview then, not staff, already on it) is refused, vaguely on purpose.
 *   - With `incomingId` and no `staff`: free candidates only.
 * On success it tells the incoming member (email with the Teams link and a calendar invite) and the outgoing member (a
 * short note with a calendar cancel). Teams meetings carry no attendees, so there is nothing to update there. `db`
 * (optional) is a service-role or admin client; the default is the service role.
 */
export async function reassignInterviewer(
  input: {
    slotId: string;
    outgoingId: string;
    incomingId?: string | null;
    why: 'changed_on_page' | 'availability_removed';
    /** The signed-in session's staff list (readStaff); lets an explicit pick be someone not marked free. */
    staff?: Staff[];
    /** Who made the change (the session's user id), for the audit line. */
    actorId?: string | null;
    /** The clock (tests). */
    now?: Date;
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
  let chosen: { userId: string; name: string } | undefined;
  let addRange: MinuteRange[] | null = null;
  try {
    s = await readSlot(client, slotId);
    if (!s || !s.pair) return { ok: false, reason: 'not_paired', message: 'That interview has no pair yet.' };
    if (!s.pair.includes(outgoingId)) return { ok: false, reason: 'taken', message: 'That person is no longer on this interview.' };
    if (input.why === 'changed_on_page') {
      const blocked = await blockedOn(client, s, input.now ?? new Date());
      if (blocked) return { ok: false, reason: 'taken', message: blocked };
    }
    if (input.incomingId && input.staff) {
      const o = await optionsOn(client, slotId, s, input.staff);
      const pick = o.options.find((x) => x.id === input.incomingId);
      if (pick) {
        chosen = { userId: pick.id, name: pick.name };
        const have = o.ranges.get(pick.id) ?? [];
        if (needsRange(pick)) addRange = have;
      }
    } else {
      const cands = await freeOn(client, slotId, s);
      chosen = input.incomingId ? cands.find((c) => c.userId === input.incomingId) : cands[0];
    }
  } catch {
    return { ok: false, reason: 'error', message: READ_FAILED };
  }
  if (!chosen) return input.incomingId ? { ok: false, reason: 'taken', message: NOT_FREE } : { ok: false, reason: 'no_one_free', message: NO_ONE_FREE };

  // An explicit pick was checked above against the full list, so the swap skips its own free-candidate check (the
  // seat-still-held guard stays). The auto cover keeps the swap's own check.
  let undo: (() => Promise<void>) | null = null;
  if (addRange) {
    undo = await addCoverRange(client, s.cycleId, chosen.userId, addRange, s);
    if (!undo) return { ok: false, reason: 'error', message: SAVE_FAILED };
  }
  const explicit = Boolean(input.incomingId && input.staff);
  if (explicit) {
    // Just before the seat moves: the pick may have been given another interview at the same time since the list was read.
    let busy: boolean;
    try {
      const st = s;
      busy = (await readHeld(client, st.cycleId, slotId)).some((h) => h.userId === chosen.userId && h.startsAt < st.endsAt && st.startsAt < h.endsAt);
    } catch {
      if (undo) await undo().catch(() => {});
      return { ok: false, reason: 'error', message: READ_FAILED };
    }
    if (busy) {
      if (undo) await undo().catch(() => {});
      return { ok: false, reason: 'taken', message: BUSY_NOW };
    }
  }
  const r = await swapInterviewer(client, slotId, outgoingId, chosen.userId, explicit ? { trusted: true, checked: true } : { trusted: true });
  if (!r.ok) {
    if (undo) await undo().catch(() => {});
    return { ok: false, reason: r.message === SWAP_TAKEN ? 'taken' : 'error', message: r.message };
  }

  if (input.why === 'changed_on_page') {
    console.info('[reassign] changed on page', { actorId: input.actorId ?? null, slotId, outgoingId, incomingId: chosen.userId, rangeAdded: addRange !== null });
  }

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
