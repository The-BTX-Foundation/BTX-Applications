// The new interview flow's database calls (migration 20261013090300_interview_flow.sql), written against any
// signed-in Supabase client like lib/pairing-db.ts, so server actions, page loaders and live tests run the same code.
// Row-level security is the real gate; the checks here only turn a refusal into a plain message.
//
//   availability     board_free_ranges, board_interview_prefs, board_conflicts (private: the owner only)
//   proposed times   interview_slots.opened_at (null = proposed, not offered to students yet)
//   fairness         interview_pairings, interview_candidates() (admins), lib/rebalance.ts
//   questions        interview_questions, seed_starter_questions()
import { easternDayMinutes, freeMinutes, mergeRanges, toMinuteRange, toRange, type MinuteRange, type Range } from './free-ranges';
import { freeCountAt, proposeTimes } from './propose-times';
import { planRebalance, rebalanceTargets, type Move, type RebalanceInterview } from './rebalance';
import { easternToUtc, slotFor } from './pairing-slots';
import { readCandidates, readInterviews, readRanges, readStaff, replaceRanges, sessionRole, type Db, type Result } from './pairing-db';

export type { Range } from './free-ranges';

const SAVE_FAILED = "That didn't save. Try again.";
const READ_FAILED = "Couldn't load this. Try again.";
const ADMIN_ONLY = 'Only board members with admin rights can do this.';
const STAFF_ONLY = 'Only board members can do this.';

const isStaff = (role: string | null) => role === 'admin' || role === 'board';

type CycleWindow = { id: string; interviewStart: string | null; interviewEnd: string | null };

async function cycleWindow(db: Db, cycleId: string): Promise<CycleWindow | null> {
  const r = await db.from('cycles').select('id, interview_start, interview_end').eq('id', cycleId).maybeSingle();
  if (r.error || !r.data) return null;
  return { id: r.data.id, interviewStart: r.data.interview_start, interviewEnd: r.data.interview_end };
}

// ---- availability ---------------------------------------------------------------------------------------------------

export type MyAvailability = {
  ranges: Range[];
  /** "Most N interviews"; null = no limit. */
  maxInterviews: number | null;
  /** What they typed in the availability box. */
  text: string;
  /** When they pressed Send; null = not sent yet. */
  sentAt: string | null;
  /** "Students I know". Only the owner can read these. */
  conflicts: string[];
};

/** The signed-in board member's own availability, limit, text, sent time and private "students I know". */
export async function readMyAvailability(db: Db, cycleId: string): Promise<Result<{ availability: MyAvailability }>> {
  const me = await sessionRole(db);
  if (!me.id || !isStaff(me.role)) return { ok: false, message: STAFF_ONLY };
  try {
    const [ranges, prefs, conflicts] = await Promise.all([
      readRanges(db, cycleId, me.id),
      db.from('board_interview_prefs').select('max_interviews, availability_text, availability_sent_at').eq('cycle_id', cycleId).eq('user_id', me.id).maybeSingle(),
      // The rules return only the caller's own names, whatever the filter says.
      db.from('board_conflicts').select('name, created_at').eq('cycle_id', cycleId).eq('user_id', me.id).order('created_at', { ascending: true }),
    ]);
    if (prefs.error || conflicts.error) return { ok: false, message: READ_FAILED };
    return {
      ok: true,
      availability: {
        ranges: mergeRanges(ranges).map(toRange),
        maxInterviews: prefs.data?.max_interviews ?? null,
        text: prefs.data?.availability_text ?? '',
        sentAt: prefs.data?.availability_sent_at ?? null,
        conflicts: (conflicts.data ?? []).map((c: { name: string }) => c.name),
      },
    };
  } catch {
    return { ok: false, message: READ_FAILED };
  }
}

export type SaveAvailabilityInput = {
  ranges: Range[];
  maxInterviews: number | null;
  text: string;
  conflicts: string[];
  /** true = "Send": records the time it was sent. */
  send: boolean;
};

// Saves the signed-in board member's availability: replaces their free ranges (cleaned: whole half hours, inside the
// interview dates, overlaps merged) and their "students I know", saves the limit and the text, and records the sent
// time when `send` is true.
export async function saveMyAvailability(db: Db, cycleId: string, input: SaveAvailabilityInput): Promise<Result<{ ranges: Range[]; sentAt: string | null }>> {
  const me = await sessionRole(db);
  if (!me.id || !isStaff(me.role)) return { ok: false, message: 'Only board members can give interview availability.' };
  const cycle = await cycleWindow(db, cycleId);
  if (!cycle) return { ok: false, message: 'That cycle was not found.' };
  if (!cycle.interviewStart || !cycle.interviewEnd) return { ok: false, message: 'The interview dates are not set yet.' };
  if (input.ranges.some((r) => !toMinuteRange(r) || toMinuteRange(r)!.endMin <= toMinuteRange(r)!.startMin)) return { ok: false, message: 'Each time needs a start before its end.' };
  const max = input.maxInterviews;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 50)) return { ok: false, message: 'The most interviews must be a whole number from 1 to 50.' };
  const text = input.text.trim();
  if (text.length > 2000) return { ok: false, message: 'Keep the note under 2,000 characters.' };
  // One of each name (the first spelling wins), spaces tidied.
  const names: string[] = [];
  for (const n of input.conflicts.map((x) => x.replace(/\s+/g, ' ').trim())) if (n !== '' && !names.some((m) => m.toLowerCase() === n.toLowerCase())) names.push(n);
  if (names.some((n) => n.length > 120)) return { ok: false, message: 'Keep each name under 120 characters.' };
  if (names.length > 200) return { ok: false, message: 'List up to 200 names.' };

  const window = { start: cycle.interviewStart, end: cycle.interviewEnd };
  const clean = mergeRanges(input.ranges.map(toMinuteRange).filter((r): r is MinuteRange => r !== null), window);
  if (!(await replaceRanges(db, cycleId, me.id, clean))) return { ok: false, message: SAVE_FAILED };

  // "Students I know": remove the names no longer listed, add the new ones.
  const have = await db.from('board_conflicts').select('id, name').eq('cycle_id', cycleId).eq('user_id', me.id);
  if (have.error) return { ok: false, message: SAVE_FAILED };
  const want = new Set(names.map((n) => n.toLowerCase()));
  const haveRows = (have.data ?? []) as { id: string; name: string }[];
  const drop = haveRows.filter((h) => !want.has(h.name.replace(/\s+/g, ' ').trim().toLowerCase())).map((h) => h.id);
  if (drop.length > 0) {
    const d = await db.from('board_conflicts').delete().in('id', drop);
    if (d.error) return { ok: false, message: SAVE_FAILED };
  }
  const haveNames = new Set(haveRows.map((h) => h.name.replace(/\s+/g, ' ').trim().toLowerCase()));
  const add = names.filter((n) => !haveNames.has(n.toLowerCase())).map((name) => ({ cycle_id: cycleId, user_id: me.id, name }));
  if (add.length > 0) {
    const i = await db.from('board_conflicts').insert(add);
    if (i.error) return { ok: false, message: SAVE_FAILED };
  }

  const sentAt = input.send ? new Date().toISOString() : undefined;
  const row: Record<string, unknown> = { cycle_id: cycleId, user_id: me.id, max_interviews: max, availability_text: text || null };
  if (sentAt) row.availability_sent_at = sentAt;
  const p = await db.from('board_interview_prefs').upsert(row, { onConflict: 'cycle_id,user_id' }).select('availability_sent_at').single();
  if (p.error) return { ok: false, message: SAVE_FAILED };
  return { ok: true, ranges: clean.map(toRange), sentAt: p.data?.availability_sent_at ?? null };
}

export type BoardAvailabilityRow = {
  userId: string;
  name: string;
  initials: string;
  /** 'admin' or 'board'. */
  role: string;
  ranges: Range[];
  /** Free hours in the cycle (0.5 steps). */
  freeHours: number;
  maxInterviews: number | null;
  sentAt: string | null;
};

/** Every board member with their free hours, limit and sent time (names of "students I know" are never included). */
export async function readBoardAvailability(db: Db, cycleId: string): Promise<Result<{ people: BoardAvailabilityRow[] }>> {
  const me = await sessionRole(db);
  if (!isStaff(me.role)) return { ok: false, message: STAFF_ONLY };
  try {
    const [staff, ranges, prefs] = await Promise.all([
      readStaff(db),
      readRanges(db, cycleId),
      db.from('board_interview_prefs').select('user_id, max_interviews, availability_sent_at').eq('cycle_id', cycleId),
    ]);
    if (prefs.error) return { ok: false, message: READ_FAILED };
    const pref = new Map(((prefs.data ?? []) as { user_id: string; max_interviews: number | null; availability_sent_at: string | null }[]).map((p) => [p.user_id, p]));
    const people = staff
      .filter((s) => isStaff(s.role))
      .map((s) => {
        const mine = mergeRanges(ranges.filter((r) => r.userId === s.userId));
        return {
          userId: s.userId,
          name: s.name,
          initials: s.initials,
          role: s.role,
          ranges: mine.map(toRange),
          freeHours: freeMinutes(mine) / 60,
          maxInterviews: pref.get(s.userId)?.max_interviews ?? null,
          sentAt: pref.get(s.userId)?.availability_sent_at ?? null,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name));
    return { ok: true, people };
  } catch {
    return { ok: false, message: READ_FAILED };
  }
}

// ---- proposed times ------------------------------------------------------------------------------------------------

export type ProposedTimeRow = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  /** null = proposed, not offered to students yet. */
  openedAt: string | null;
  /** Board members free for the whole time. */
  freeCount: number;
  /** A student holds it now. */
  booked: boolean;
};

/** Every interview time of the cycle (proposed and opened), with how many board members are free for it. */
export async function readProposedTimes(db: Db, cycleId: string): Promise<Result<{ times: ProposedTimeRow[] }>> {
  const me = await sessionRole(db);
  if (!isStaff(me.role)) return { ok: false, message: STAFF_ONLY };
  try {
    const [slots, ranges, bookings] = await Promise.all([
      db.from('interview_slots').select('id, starts_at, ends_at, opened_at').eq('cycle_id', cycleId).order('starts_at', { ascending: true }),
      readRanges(db, cycleId),
      db.from('bookings').select('slot_id, interview_slots!inner(cycle_id)').eq('status', 'active').eq('interview_slots.cycle_id', cycleId),
    ]);
    if (slots.error || bookings.error) return { ok: false, message: READ_FAILED };
    const held = new Set((bookings.data ?? []).map((b: { slot_id: string }) => b.slot_id));
    const times = ((slots.data ?? []) as { id: string; starts_at: string; ends_at: string; opened_at: string | null }[]).map((s) => {
      const { day, min } = easternDayMinutes(s.starts_at);
      const len = Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60_000);
      return { slotId: s.id, startsAt: s.starts_at, endsAt: s.ends_at, openedAt: s.opened_at, freeCount: freeCountAt(ranges, day, min, min + len), booked: held.has(s.id) };
    });
    return { ok: true, times };
  } catch {
    return { ok: false, message: READ_FAILED };
  }
}

// Admin only: makes the proposed times again. Proposed times nobody ever booked are removed; opened times and any
// time with a booking stay. New times are added where 2 or more board members are free, about 1.3 per submitted
// applicant still without a kept time (lib/propose-times.ts). Returns how many were removed and added.
export async function rebuildProposedTimes(db: Db, cycleId: string, now = new Date()): Promise<Result<{ removed: number; added: number }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can propose interview times.' };
  const cycle = await cycleWindow(db, cycleId);
  if (!cycle) return { ok: false, message: 'That cycle was not found.' };
  if (!cycle.interviewStart || !cycle.interviewEnd) return { ok: false, message: 'Set the interview dates on the cycle first.' };
  const slots = await db.from('interview_slots').select('id, opened_at').eq('cycle_id', cycleId);
  if (slots.error) return { ok: false, message: SAVE_FAILED };
  const rows = (slots.data ?? []) as { id: string; opened_at: string | null }[];
  const proposed = rows.filter((s) => s.opened_at === null).map((s) => s.id);
  let removed = 0;
  if (proposed.length > 0) {
    const bk = await db.from('bookings').select('slot_id').in('slot_id', proposed);
    if (bk.error) return { ok: false, message: SAVE_FAILED };
    const hasHistory = new Set((bk.data ?? []).map((b: { slot_id: string }) => b.slot_id));
    const drop = proposed.filter((id) => !hasHistory.has(id));
    if (drop.length > 0) {
      const d = await db.from('interview_slots').delete().in('id', drop).select('id');
      if (d.error) return { ok: false, message: SAVE_FAILED };
      removed = (d.data ?? []).length;
    }
  }
  const [ranges, apps] = await Promise.all([
    readRanges(db, cycleId).catch(() => null),
    db.from('applications').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId).eq('status', 'submitted'),
  ]);
  if (!ranges || apps.error) return { ok: false, message: SAVE_FAILED };
  const left = await db.from('interview_slots').select('starts_at').eq('cycle_id', cycleId);
  if (left.error) return { ok: false, message: SAVE_FAILED };
  const existing = (left.data ?? []).map((s: { starts_at: string }) => ({ startsAt: s.starts_at }));
  const applicants = Math.max(0, (apps.count ?? 0) - existing.length);
  const times = proposeTimes({ windowStart: cycle.interviewStart, windowEnd: cycle.interviewEnd, ranges, applicants, existing, now });
  if (times.length > 0) {
    const ins = await db.from('interview_slots').insert(times.map((t) => ({ cycle_id: cycleId, starts_at: t.startsAt, ends_at: t.endsAt, opened_at: null })));
    if (ins.error) return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true, removed, added: times.length };
}

/** Admin only: adds one proposed 30-minute time ("2026-10-15", "14:30" Eastern) inside the interview dates. Students
 * see it once the times are opened. */
export async function addTime(db: Db, cycleId: string, date: string, time: string, now = new Date()): Promise<Result<{ slotId: string }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can add interview times.' };
  const cycle = await cycleWindow(db, cycleId);
  if (!cycle) return { ok: false, message: 'That cycle was not found.' };
  if (!cycle.interviewStart || !cycle.interviewEnd) return { ok: false, message: 'Set the interview dates on the cycle first.' };
  const slot = slotFor(date, time);
  if (!slot || !easternToUtc(date, time)) return { ok: false, message: `${date} ${time} is not a valid date and time.` };
  if (date < cycle.interviewStart || date > cycle.interviewEnd) return { ok: false, message: `${date} is outside the interview dates (${cycle.interviewStart} to ${cycle.interviewEnd}).` };
  if (Date.parse(slot.startsAt) <= now.getTime()) return { ok: false, message: `${date} ${time} has already passed.` };
  const ex = await db.from('interview_slots').select('starts_at, ends_at').eq('cycle_id', cycleId);
  if (ex.error) return { ok: false, message: SAVE_FAILED };
  if ((ex.data ?? []).some((s: { starts_at: string; ends_at: string }) => Date.parse(s.starts_at) < Date.parse(slot.endsAt) && Date.parse(slot.startsAt) < Date.parse(s.ends_at))) {
    return { ok: false, message: `${date} ${time} overlaps another interview time.` };
  }
  const ins = await db.from('interview_slots').insert({ cycle_id: cycleId, starts_at: slot.startsAt, ends_at: slot.endsAt, opened_at: null }).select('id').single();
  if (ins.error) return { ok: false, message: SAVE_FAILED };
  return { ok: true, slotId: ins.data.id };
}

/** Admin only: removes an interview time nobody holds. A time with booking history stays. */
export async function removeTime(db: Db, slotId: string): Promise<Result> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can remove interview times.' };
  const b = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('slot_id', slotId).eq('status', 'active');
  if (b.error) return { ok: false, message: SAVE_FAILED };
  if ((b.count ?? 0) > 0) return { ok: false, message: 'A student has booked that time, so it stays.' };
  const d = await db.from('interview_slots').delete().eq('id', slotId).select('id');
  if (d.error) return { ok: false, message: 'That time has booking history, so it stays.' };
  if ((d.data ?? []).length === 0) return { ok: false, message: 'That time is already gone.' };
  return { ok: true };
}

/** Admin only: offers every proposed time of the cycle to students. Returns how many were opened. */
export async function openProposedTimes(db: Db, cycleId: string): Promise<Result<{ opened: number }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can open interview times.' };
  const u = await db.from('interview_slots').update({ opened_at: new Date().toISOString() }).eq('cycle_id', cycleId).is('opened_at', null).select('id');
  if (u.error) return { ok: false, message: SAVE_FAILED };
  return { ok: true, opened: (u.data ?? []).length };
}

// ---- fairness ------------------------------------------------------------------------------------------------------

export type FairnessRow = {
  userId: string;
  name: string;
  /** Interviews this cycle (pairs held). */
  interviews: number;
  /** The even share; null for someone who has not sent availability. */
  target: number | null;
  maxInterviews: number | null;
  /** interviews - target: above 0 is over, below 0 is under. 0 when there is no target. */
  overBy: number;
  sentAt: string | null;
};

export type NeedsTwo = { slotId: string; startsAt: string; code: string; applicant: string };

type FairnessData = { people: FairnessRow[]; needsTwo: NeedsTwo[]; seats: number };

async function fairnessData(db: Db, cycleId: string): Promise<FairnessData & { booked: Awaited<ReturnType<typeof readInterviews>>['booked']; pairs: Awaited<ReturnType<typeof readInterviews>>['pairs'] }> {
  const [{ booked, pairs }, staff, prefs] = await Promise.all([
    readInterviews(db, cycleId),
    readStaff(db),
    db.from('board_interview_prefs').select('user_id, max_interviews, availability_sent_at').eq('cycle_id', cycleId),
  ]);
  if (prefs.error) throw prefs.error;
  const pref = new Map(((prefs.data ?? []) as { user_id: string; max_interviews: number | null; availability_sent_at: string | null }[]).map((p) => [p.user_id, p]));
  const count: Record<string, number> = {};
  for (const p of pairs.values()) for (const u of [p.a, p.b]) count[u] = (count[u] ?? 0) + 1;
  const senders = staff.filter((s) => isStaff(s.role) && pref.get(s.userId)?.availability_sent_at);
  const senderIds = new Set(senders.map((s) => s.userId));
  const seats = [...pairs.values()].reduce((n, p) => n + Number(senderIds.has(p.a)) + Number(senderIds.has(p.b)), 0);
  const targets = rebalanceTargets(senders.map((s) => ({ userId: s.userId, name: s.name, maxInterviews: pref.get(s.userId)?.max_interviews ?? null })), seats, count);
  const people = staff
    .filter((s) => isStaff(s.role))
    .map((s) => {
      const target = senderIds.has(s.userId) ? (targets[s.userId] ?? 0) : null;
      const interviews = count[s.userId] ?? 0;
      return { userId: s.userId, name: s.name, interviews, target, maxInterviews: pref.get(s.userId)?.max_interviews ?? null, overBy: target === null ? 0 : interviews - target, sentAt: pref.get(s.userId)?.availability_sent_at ?? null };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
  const needsTwo = booked.filter((b) => !pairs.has(b.slotId)).map((b) => ({ slotId: b.slotId, startsAt: b.startsAt, code: b.code, applicant: b.applicant }));
  return { people, needsTwo, seats, booked, pairs };
}

/** Per board member: interviews, the even target, limit and how far over or under; plus booked interviews that still need two interviewers. */
export async function readFairness(db: Db, cycleId: string): Promise<Result<{ people: FairnessRow[]; needsTwo: NeedsTwo[] }>> {
  const me = await sessionRole(db);
  if (!isStaff(me.role)) return { ok: false, message: STAFF_ONLY };
  try {
    const d = await fairnessData(db, cycleId);
    return { ok: true, people: d.people, needsTwo: d.needsTwo };
  } catch {
    return { ok: false, message: READ_FAILED };
  }
}

export type RebalanceMove = Move & {
  startsAt: string;
  code: string;
  applicant: string;
  fromName: string;
  toName: string;
};

// Admin only: moves future interviews (never one starting within 48 hours) from people over the even target to
// people under it who may take them (free then, under their limit, not busy, not someone who knows the student).
// Every interview keeps two people. Returns the moves (with names and times, for the emails) and the counts.
export async function rebalanceInterviews(db: Db, cycleId: string, now = new Date()): Promise<Result<{ moves: RebalanceMove[]; before: Record<string, number>; after: Record<string, number> }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can rebalance interviews.' };
  let d: Awaited<ReturnType<typeof fairnessData>>;
  try {
    d = await fairnessData(db, cycleId);
  } catch {
    return { ok: false, message: READ_FAILED };
  }
  const cutoff = now.getTime() + 48 * 3_600_000;
  const interviews: RebalanceInterview[] = [];
  try {
    for (const b of d.booked) {
      const p = d.pairs.get(b.slotId);
      if (!p) continue;
      const future = Date.parse(b.startsAt) > cutoff;
      const candidates = future ? (await readCandidates(db, b.slotId, b.applicationId)).map((c) => c.userId) : [];
      interviews.push({ slotId: b.slotId, startsAt: b.startsAt, endsAt: b.endsAt, a: p.a, b: p.b, candidates });
    }
  } catch {
    return { ok: false, message: READ_FAILED };
  }
  const senders = d.people.filter((p) => p.target !== null).map((p) => ({ userId: p.userId, name: p.name, maxInterviews: p.maxInterviews }));
  const plan = planRebalance({ people: senders, interviews, now });
  const names = new Map(d.people.map((p) => [p.userId, p.name]));
  const byslot = new Map(d.booked.map((b) => [b.slotId, b]));
  const moves: RebalanceMove[] = [];
  for (const m of plan.moves) {
    // Each move replaces one person; the column is whichever one holds `from` right now.
    const cur = await db.from('interview_pairings').select('interviewer_a, interviewer_b').eq('slot_id', m.slotId).maybeSingle();
    if (cur.error || !cur.data) return { ok: false, message: SAVE_FAILED };
    const col = cur.data.interviewer_a === m.from ? 'interviewer_a' : cur.data.interviewer_b === m.from ? 'interviewer_b' : null;
    if (!col) return { ok: false, message: 'The interviews changed while rebalancing. Try again.' };
    const u = await db.from('interview_pairings').update({ [col]: m.to }).eq('slot_id', m.slotId).eq(col, m.from).select('slot_id');
    if (u.error || (u.data ?? []).length === 0) return { ok: false, message: SAVE_FAILED };
    const b = byslot.get(m.slotId)!;
    moves.push({ ...m, startsAt: b.startsAt, code: b.code, applicant: b.applicant, fromName: names.get(m.from) ?? 'Unknown', toName: names.get(m.to) ?? 'Unknown' });
  }
  return { ok: true, moves, before: plan.before, after: plan.after };
}

// ---- interview questions -------------------------------------------------------------------------------------------

export type InterviewQuestion = {
  id: string;
  /** The rubric key, or null for "To close" (not scored). */
  criterionKey: string | null;
  position: number;
  text: string;
};

/** The cycle's interview questions in order. Every board member reads them. */
export async function readQuestions(db: Db, cycleId: string): Promise<Result<{ questions: InterviewQuestion[] }>> {
  const r = await db.from('interview_questions').select('id, criterion_key, position, text, created_at').eq('cycle_id', cycleId).order('position', { ascending: true }).order('created_at', { ascending: true });
  if (r.error) return { ok: false, message: READ_FAILED };
  return { ok: true, questions: (r.data ?? []).map((q: { id: string; criterion_key: string | null; position: number; text: string }) => ({ id: q.id, criterionKey: q.criterion_key, position: q.position, text: q.text })) };
}

/** Admin only: adds a question (no id) at the end of its group, or changes one (text and group). */
export async function saveQuestion(db: Db, cycleId: string, q: { id?: string; criterionKey: string | null; text: string }): Promise<Result<{ id: string }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: ADMIN_ONLY };
  const text = q.text.trim();
  if (text === '') return { ok: false, message: 'Write the question first.' };
  if (text.length > 500) return { ok: false, message: 'Keep the question under 500 characters.' };
  if (q.criterionKey !== null) {
    const k = await db.from('rubric_criteria').select('key').eq('cycle_id', cycleId).eq('key', q.criterionKey).maybeSingle();
    if (k.error) return { ok: false, message: SAVE_FAILED };
    if (!k.data) return { ok: false, message: 'Pick one of the scoring criteria.' };
  }
  if (q.id) {
    const u = await db.from('interview_questions').update({ text, criterion_key: q.criterionKey }).eq('id', q.id).eq('cycle_id', cycleId).select('id');
    if (u.error) return { ok: false, message: SAVE_FAILED };
    if ((u.data ?? []).length === 0) return { ok: false, message: 'That question is gone.' };
    return { ok: true, id: q.id };
  }
  const last = await db.from('interview_questions').select('position').eq('cycle_id', cycleId).order('position', { ascending: false }).limit(1).maybeSingle();
  if (last.error) return { ok: false, message: SAVE_FAILED };
  const ins = await db.from('interview_questions').insert({ cycle_id: cycleId, criterion_key: q.criterionKey, text, position: (last.data?.position ?? 0) + 1 }).select('id').single();
  if (ins.error) return { ok: false, message: SAVE_FAILED };
  return { ok: true, id: ins.data.id };
}

/** Admin only: removes a question. */
export async function deleteQuestion(db: Db, id: string): Promise<Result> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: ADMIN_ONLY };
  const d = await db.from('interview_questions').delete().eq('id', id).select('id');
  if (d.error) return { ok: false, message: SAVE_FAILED };
  if ((d.data ?? []).length === 0) return { ok: false, message: 'That question is already gone.' };
  return { ok: true };
}

// Admin only: moves a question one place up or down inside its group (same criterion). The group's positions are
// handed out again in the new order, so other groups keep their places.
export async function moveQuestion(db: Db, id: string, direction: 'up' | 'down'): Promise<Result> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: ADMIN_ONLY };
  const q = await db.from('interview_questions').select('id, cycle_id, criterion_key').eq('id', id).maybeSingle();
  if (q.error) return { ok: false, message: SAVE_FAILED };
  if (!q.data) return { ok: false, message: 'That question is gone.' };
  let g = db.from('interview_questions').select('id, position, created_at').eq('cycle_id', q.data.cycle_id);
  g = q.data.criterion_key === null ? g.is('criterion_key', null) : g.eq('criterion_key', q.data.criterion_key);
  const group = await g.order('position', { ascending: true }).order('created_at', { ascending: true });
  if (group.error) return { ok: false, message: SAVE_FAILED };
  const list = (group.data ?? []) as { id: string; position: number }[];
  const i = list.findIndex((x) => x.id === id);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const slots = list.map((x) => x.position);
  // Positions may repeat; make them distinct while keeping the group's place among the others.
  for (let k = 1; k < slots.length; k += 1) if (slots[k] <= slots[k - 1]) slots[k] = slots[k - 1] + 1;
  const order = [...list];
  [order[i], order[j]] = [order[j], order[i]];
  for (let k = 0; k < order.length; k += 1) {
    if (order[k].position === slots[k]) continue;
    const u = await db.from('interview_questions').update({ position: slots[k] }).eq('id', order[k].id);
    if (u.error) return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true };
}

/** Admin only: adds the 12 starter questions when the cycle has none. */
export async function seedStarterQuestions(db: Db, cycleId: string): Promise<Result<{ added: number }>> {
  const me = await sessionRole(db);
  if (me.role !== 'admin') return { ok: false, message: ADMIN_ONLY };
  const r = await db.rpc('seed_starter_questions', { p_cycle_id: cycleId });
  if (r.error) return { ok: false, message: r.error.message.includes('rubric_missing') ? 'Set up the scoring rubric first.' : SAVE_FAILED };
  return { ok: true, added: Number(r.data ?? 0) };
}
