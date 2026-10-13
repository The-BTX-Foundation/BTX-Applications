// The Interviews database calls, written against any signed-in Supabase client so the server actions, the page loaders
// and the live tests all run the same code. Row-level security in the database is the real gate: pairings, slots and
// other people's availability can only be written by an admin, whatever this code says. The checks here give a clear
// message instead of a raw database error.
//
// Tables (migrations 20261013090000_ops_hub.sql and 20261013090300_interview_flow.sql): interview_slots, bookings,
// interview_pairings, board_free_ranges (the old Morning / Afternoon / Evening picks are stored as ranges),
// board_interview_prefs, staff_profiles, plus staff_directory(), interview_candidates() and `applications` (code and
// name: staff see names, D2).
//
// Since the interview flow, a booking pairs two people by itself (the bookings trigger). "Re-run pairing" here only
// pairs booked interviews that still have nobody, using the same rules (interview_candidates()).
import type { SupabaseClient } from '@supabase/supabase-js';
import { blocksToRanges, rangesToBlocks, windowDays as rangeWindowDays, type MinuteRange } from './free-ranges';
import { BLOCKS, type AvailabilityRow, type Block } from './pairing';
import { checkNewSlots, isVideoUrl, type NewSlotInput } from './pairing-slots';

export type Db = SupabaseClient;
export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

const SAVE_FAILED = "That didn't save. Try again.";

export type CycleInfo = { id: string; interviewStart: string | null; interviewEnd: string | null };
export type Staff = { userId: string; name: string; initials: string; role: string };
export type BookedInterview = { slotId: string; startsAt: string; endsAt: string; applicationId: string; code: string; /** The applicant's full name (D2: staff see names). */ applicant: string };
export type PairRow = { slotId: string; a: string; b: string; videoUrl: string | null };

/** The role in the session's token ("admin", "board", ...), the same field the database policies read. */
export async function sessionRole(client: Db): Promise<{ id: string | null; role: string | null }> {
  const { data } = await client.auth.getUser();
  const role = data.user?.app_metadata?.role;
  return { id: data.user?.id ?? null, role: typeof role === 'string' ? role : null };
}

/** The cycle people see now: the newest published one. */
export async function currentCycle(client: Db): Promise<CycleInfo | null> {
  const r = await client.from('cycles').select('id, interview_start, interview_end').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? { id: r.data.id, interviewStart: r.data.interview_start, interviewEnd: r.data.interview_end } : null;
}

/** Everyone on staff with a name, initials and role (names from staff_profiles, roles from staff_directory()). */
export async function readStaff(client: Db): Promise<Staff[]> {
  const [profiles, dir] = await Promise.all([client.from('staff_profiles').select('user_id, display_name, initials'), client.rpc('staff_directory')]);
  if (profiles.error) throw profiles.error;
  if (dir.error) throw dir.error;
  const roles = new Map<string, string>((dir.data ?? []).map((d: { user_id: string; role: string }) => [d.user_id, d.role]));
  const out: Staff[] = [];
  for (const p of profiles.data ?? []) {
    const role = roles.get(p.user_id);
    if (role) out.push({ userId: p.user_id, name: p.display_name, initials: p.initials, role });
  }
  return out;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** The cycle's booked interviews (active bookings) with the applicant's code and name, and the pairings so far. */
export async function readInterviews(client: Db, cycleId: string): Promise<{ booked: BookedInterview[]; pairs: Map<string, PairRow> }> {
  const [bk, pr] = await Promise.all([
    client.from('bookings').select('slot_id, application_id, interview_slots!inner(starts_at, ends_at, cycle_id)').eq('status', 'active').eq('interview_slots.cycle_id', cycleId),
    client.from('interview_pairings').select('slot_id, interviewer_a, interviewer_b, video_url, interview_slots!inner(cycle_id)').eq('interview_slots.cycle_id', cycleId),
  ]);
  if (bk.error) throw bk.error;
  if (pr.error) throw pr.error;
  const ids = [...new Set((bk.data ?? []).map((b: { application_id: string }) => b.application_id))];
  const apps = new Map<string, { code: string; applicant: string }>();
  if (ids.length > 0) {
    const a = await client.from('applications').select('id, applicant_code, full_name').in('id', ids);
    if (a.error) throw a.error;
    for (const r of a.data ?? []) apps.set(r.id, { code: r.applicant_code ?? '—', applicant: (r.full_name ?? '').trim() || (r.applicant_code ?? '—') });
  }
  const booked: BookedInterview[] = [];
  for (const b of bk.data ?? []) {
    const slot = one<{ starts_at: string; ends_at: string }>(b.interview_slots);
    const app = apps.get(b.application_id);
    if (!slot || !app) continue;
    booked.push({ slotId: b.slot_id, startsAt: slot.starts_at, endsAt: slot.ends_at, applicationId: b.application_id, code: app.code, applicant: app.applicant });
  }
  booked.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const pairs = new Map<string, PairRow>();
  for (const p of pr.data ?? []) pairs.set(p.slot_id, { slotId: p.slot_id, a: p.interviewer_a, b: p.interviewer_b, videoUrl: p.video_url });
  return { booked, pairs };
}

// ---- availability (D4) ---------------------------------------------------------------------------------------------

/** Every day of the interview window, "2026-10-15" ... (at most 31). */
export const windowDays = rangeWindowDays;

/** A person's free ranges for a cycle, in minutes (board_free_ranges). */
export async function readRanges(client: Db, cycleId: string, userId?: string): Promise<(MinuteRange & { userId: string })[]> {
  let q = client.from('board_free_ranges').select('user_id, day, start_min, end_min').eq('cycle_id', cycleId);
  if (userId) q = q.eq('user_id', userId);
  const r = await q;
  if (r.error) throw r.error;
  return (r.data ?? []).map((x: { user_id: string; day: string; start_min: number; end_min: number }) => ({ userId: x.user_id, day: x.day, startMin: x.start_min, endMin: x.end_min }));
}

// Replaces someone's free ranges for a cycle with `ranges` (already cleaned): removes the rows that are not wanted,
// then adds the new ones. The database lets a person write only their own rows (admins anyone's).
export async function replaceRanges(client: Db, cycleId: string, userId: string, ranges: MinuteRange[]): Promise<boolean> {
  let have: (MinuteRange & { userId: string })[];
  try {
    have = await readRanges(client, cycleId, userId);
  } catch {
    return false;
  }
  const key = (r: MinuteRange) => `${r.day}|${r.startMin}|${r.endMin}`;
  const want = new Map(ranges.map((r) => [key(r), r]));
  const haveKeys = new Set(have.map(key));
  for (const h of have.filter((x) => !want.has(key(x)))) {
    const d = await client.from('board_free_ranges').delete().eq('cycle_id', cycleId).eq('user_id', userId).eq('day', h.day).eq('start_min', h.startMin);
    if (d.error) return false;
  }
  const add = [...want.values()].filter((r) => !haveKeys.has(key(r))).map((r) => ({ cycle_id: cycleId, user_id: userId, day: r.day, start_min: r.startMin, end_min: r.endMin }));
  if (add.length > 0) {
    const i = await client.from('board_free_ranges').insert(add);
    if (i.error) return false;
  }
  return true;
}

export type AvailabilityData = {
  cycleId: string;
  /** The days a board member can answer for. */
  days: string[];
  /** The signed-in person's own picks. */
  mine: AvailabilityRow[];
  /** Everyone's picks (admins; board members see them too under the database rule). */
  everyone: AvailabilityRow[];
};

/** Own picks and everyone's picks for the cycle, as the blocks each person's free ranges fully cover. */
export async function readAvailability(client: Db, cycle: CycleInfo): Promise<AvailabilityData> {
  const me = await sessionRole(client);
  const rows = await readRanges(client, cycle.id);
  const byUser = new Map<string, MinuteRange[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  const everyone: AvailabilityRow[] = [];
  for (const [userId, list] of byUser) for (const b of rangesToBlocks(list)) everyone.push({ userId, day: b.day, block: b.block });
  return { cycleId: cycle.id, days: windowDays(cycle.interviewStart, cycle.interviewEnd), mine: everyone.filter((x) => x.userId === me.id), everyone };
}

// Replaces the signed-in person's own availability for the cycle with `picks` (only days inside the interview window).
// The picks are saved as free ranges (Morning 9-12, Afternoon 12-5, Evening 5-9); the new availability screen uses
// lib/interview-flow-db.ts instead.
export async function saveMyAvailability(client: Db, picks: { day: string; block: string }[]): Promise<Result<{ saved: number }>> {
  const me = await sessionRole(client);
  if (!me.id || (me.role !== 'board' && me.role !== 'admin')) return { ok: false, message: 'Only board members can give interview availability.' };
  const cycle = await currentCycle(client);
  if (!cycle) return { ok: false, message: 'There is no open cycle.' };
  const days = windowDays(cycle.interviewStart, cycle.interviewEnd);
  if (days.length === 0) return { ok: false, message: 'The interview dates are not set yet.' };
  const want = new Map<string, AvailabilityRow>();
  for (const p of picks) {
    if (!days.includes(p.day) || !(BLOCKS as readonly string[]).includes(p.block)) return { ok: false, message: 'Pick a part of the day inside the interview dates.' };
    want.set(`${p.day}|${p.block}`, { userId: me.id, day: p.day, block: p.block as Block });
  }
  if (!(await replaceRanges(client, cycle.id, me.id, blocksToRanges([...want.values()])))) return { ok: false, message: SAVE_FAILED };
  return { ok: true, saved: want.size };
}

// ---- pairing (O9) --------------------------------------------------------------------------------------------------

export type PairingPlan = {
  /** Booked interviews still ahead with nobody paired. */
  unpairedCount: number;
  /** What a run would set. */
  assignments: { slotId: string; a: string; b: string }[];
  /** Interviews nobody could cover (fewer than two people free). */
  uncovered: string[];
};

/** One row of interview_candidates(): someone who may take an interview, with the two numbers pairing orders by. */
export type Candidate = { userId: string; interviewsSoFar: number; freeMinutesLeft: number; name: string };

/** Who may take an interview (admins only; the database checks): free then, under their limit, not busy, not someone who knows the student. */
export async function readCandidates(client: Db, slotId: string, applicationId: string | null): Promise<Candidate[]> {
  const r = await client.rpc('interview_candidates', { p_slot_id: slotId, p_application_id: applicationId });
  if (r.error) throw r.error;
  return ((r.data ?? []) as { user_id: string; interviews_so_far: number; free_minutes_left: number; display_name: string }[]).map((c) => ({
    userId: c.user_id,
    interviewsSoFar: c.interviews_so_far,
    freeMinutesLeft: c.free_minutes_left,
    name: c.display_name,
  }));
}

/** Each person's "Most N interviews" for a cycle (missing = no limit). */
export async function readLimits(client: Db, cycleId: string): Promise<Map<string, number>> {
  const r = await client.from('board_interview_prefs').select('user_id, max_interviews').eq('cycle_id', cycleId);
  if (r.error) throw r.error;
  const out = new Map<string, number>();
  for (const p of r.data ?? []) if (p.max_interviews !== null) out.set(p.user_id, p.max_interviews);
  return out;
}

// Works out who would be paired to each booked, future interview that has no pair yet. Nothing already paired moves.
// Admins only (the candidate list is). For each interview, in time order, it takes the database's candidates and
// counts the pairs this run has already planned: fewest interviews so far, then fewer free minutes left, then name.
export async function planPairing(client: Db, now = new Date()): Promise<Result<{ plan: PairingPlan; cycleId: string }>> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can re-run pairing.' };
  const cycle = await currentCycle(client);
  if (!cycle) return { ok: false, message: 'There is no open cycle.' };
  const [{ booked, pairs }, limits] = await Promise.all([readInterviews(client, cycle.id), readLimits(client, cycle.id)]);
  const todo = booked.filter((b) => !pairs.has(b.slotId) && Date.parse(b.startsAt) > now.getTime());
  const planned = new Map<string, number>();
  const busy: { userId: string; startsAt: string; endsAt: string }[] = [];
  const assignments: PairingPlan['assignments'] = [];
  const uncovered: string[] = [];
  for (const b of todo) {
    const extra = (u: string) => planned.get(u) ?? 0;
    const cands = (await readCandidates(client, b.slotId, b.applicationId))
      .filter((c) => !busy.some((x) => x.userId === c.userId && x.startsAt < b.endsAt && b.startsAt < x.endsAt))
      .filter((c) => !limits.has(c.userId) || c.interviewsSoFar + extra(c.userId) < (limits.get(c.userId) as number))
      .sort((x, y) => x.interviewsSoFar + extra(x.userId) - (y.interviewsSoFar + extra(y.userId)) || x.freeMinutesLeft - y.freeMinutesLeft || x.name.localeCompare(y.name) || x.userId.localeCompare(y.userId));
    if (cands.length < 2) {
      uncovered.push(b.slotId);
      continue;
    }
    const [a, c] = cands;
    assignments.push({ slotId: b.slotId, a: a.userId, b: c.userId });
    for (const u of [a.userId, c.userId]) {
      planned.set(u, extra(u) + 1);
      busy.push({ userId: u, startsAt: b.startsAt, endsAt: b.endsAt });
    }
  }
  return { ok: true, cycleId: cycle.id, plan: { unpairedCount: todo.length, assignments, uncovered } };
}

/** Admin only: pairs every booked, future interview that has no pair yet. Pairs already set are never changed. */
export async function runPairing(client: Db, now = new Date()): Promise<Result<{ paired: number; uncovered: number }>> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can re-run pairing.' };
  const planned = await planPairing(client, now);
  if (!planned.ok) return planned;
  const rows = planned.plan.assignments.map((a) => ({ slot_id: a.slotId, interviewer_a: a.a, interviewer_b: a.b }));
  if (rows.length > 0) {
    // ignoreDuplicates: a pair someone else set a moment ago is left alone.
    const w = await client.from('interview_pairings').upsert(rows, { onConflict: 'slot_id', ignoreDuplicates: true });
    if (w.error) return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true, paired: rows.length, uncovered: planned.plan.uncovered.length };
}

/** Admin only: replaces one interviewer on a paired interview by hand. The new person must be someone the database
 * says may take it (free then, under their limit, not busy, not someone who knows the student). */
export async function swapInterviewer(client: Db, slotId: string, fromUserId: string, toUserId: string): Promise<Result> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can change interviewers.' };
  const cur = await client.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', slotId).maybeSingle();
  if (cur.error) return { ok: false, message: SAVE_FAILED };
  if (!cur.data) return { ok: false, message: 'That interview has no pair yet.' };
  const { interviewer_a: a, interviewer_b: b } = cur.data as { interviewer_a: string; interviewer_b: string };
  if (fromUserId !== a && fromUserId !== b) return { ok: false, message: 'That person is not one of the two interviewers.' };
  if (toUserId === a || toUserId === b) return { ok: false, message: 'That person is already interviewing.' };
  const staff = await readStaff(client);
  if (!staff.some((s) => s.userId === toUserId && (s.role === 'board' || s.role === 'admin'))) return { ok: false, message: 'Pick a board member.' };
  const bk = await client.from('bookings').select('application_id').eq('slot_id', slotId).eq('status', 'active').maybeSingle();
  if (bk.error) return { ok: false, message: SAVE_FAILED };
  let cands: Candidate[];
  try {
    cands = await readCandidates(client, slotId, bk.data?.application_id ?? null);
  } catch {
    return { ok: false, message: SAVE_FAILED };
  }
  // The reason stays vague on purpose: it may be a private "student I know".
  if (!cands.some((c) => c.userId === toUserId)) return { ok: false, message: "That person can't take this interview. Pick someone who is free then." };
  const upd = await client
    .from('interview_pairings')
    .update(fromUserId === a ? { interviewer_a: toUserId } : { interviewer_b: toUserId })
    .eq('slot_id', slotId)
    .select('slot_id');
  if (upd.error || (upd.data ?? []).length === 0) return { ok: false, message: SAVE_FAILED };
  return { ok: true };
}

// ---- video links (D7) ----------------------------------------------------------------------------------------------

/** Admin only: sets the one video link on each paired interview. Stops at the first problem and says which. */
export async function setVideoLinks(client: Db, links: { slotId: string; url: string }[]): Promise<Result<{ saved: number }>> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can add video links.' };
  const clean = links.map((l) => ({ slotId: l.slotId, url: l.url.trim() })).filter((l) => l.url !== '');
  if (clean.some((l) => !isVideoUrl(l.url))) return { ok: false, message: 'Each link must start with https:// and be a full web address.' };
  let saved = 0;
  for (const l of clean) {
    const u = await client.from('interview_pairings').update({ video_url: l.url }).eq('slot_id', l.slotId).select('slot_id');
    if (u.error) return { ok: false, message: SAVE_FAILED };
    if ((u.data ?? []).length === 0) return { ok: false, message: 'One of those interviews has no pair yet. Pair it first.' };
    saved += 1;
  }
  return { ok: true, saved };
}

// ---- interview times (admin) ---------------------------------------------------------------------------------------

/** Admin only: adds 30-minute slots inside the cycle's interview window, open to students at once. Nothing is added if
 * any entry is wrong. (The review flow adds proposed times with lib/interview-flow-db.ts addTime instead.) */
export async function addInterviewSlots(client: Db, entries: NewSlotInput[], now = new Date()): Promise<Result<{ added: number }>> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can add interview times.' };
  const cycle = await currentCycle(client);
  if (!cycle) return { ok: false, message: 'There is no open cycle.' };
  const ex = await client.from('interview_slots').select('starts_at, ends_at').eq('cycle_id', cycle.id);
  if (ex.error) return { ok: false, message: SAVE_FAILED };
  const existing = (ex.data ?? []).map((s: { starts_at: string; ends_at: string }) => ({ startsAt: s.starts_at, endsAt: s.ends_at }));
  const check = checkNewSlots({ entries, windowStart: cycle.interviewStart, windowEnd: cycle.interviewEnd, existing, now });
  if (check.errors.length > 0) return { ok: false, message: check.errors[0] };
  // These times are offered to students right away (opened_at), as before the review step existed.
  const openedAt = new Date().toISOString();
  const ins = await client.from('interview_slots').insert(check.rows.map((r) => ({ cycle_id: cycle.id, starts_at: r.startsAt, ends_at: r.endsAt, opened_at: openedAt })));
  if (ins.error) return { ok: false, message: SAVE_FAILED };
  return { ok: true, added: check.rows.length };
}

/** Admin only: removes an interview time nobody has booked. A time with a booking (or booking history) stays. */
export async function removeInterviewSlot(client: Db, slotId: string): Promise<Result> {
  const me = await sessionRole(client);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can remove interview times.' };
  const b = await client.from('bookings').select('id', { count: 'exact', head: true }).eq('slot_id', slotId).eq('status', 'active');
  if (b.error) return { ok: false, message: SAVE_FAILED };
  if ((b.count ?? 0) > 0) return { ok: false, message: 'Someone has booked that time, so it stays.' };
  const d = await client.from('interview_slots').delete().eq('id', slotId).select('id');
  if (d.error) return { ok: false, message: 'That time has booking history, so it stays.' };
  if ((d.data ?? []).length === 0) return { ok: false, message: 'That time is already gone.' };
  return { ok: true };
}
