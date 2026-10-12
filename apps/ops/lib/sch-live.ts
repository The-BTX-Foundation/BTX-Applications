// Live-mode reads the four Scholarships pages share, made as the signed-in person (row-level security applies).
//
// Blind review (D2): board members and reviewers may not read `applications`; they read the view
// `application_reviews` (code, initials, year, credits, major, interests, the three short answers, submit time). Every
// page here reads that view, so each role sees exactly what the rule allows. Only an admin also reads names and contact
// details from `applications` (identityFor()).
import type { SupabaseClient } from '@supabase/supabase-js';
import { isStaffRole, type StaffRole } from './role';
import { sessionClient } from './supabase-server';

/** The session client without the generated types (the Ops Hub tables are not in them yet). */
export async function db(): Promise<SupabaseClient> {
  return (await sessionClient()) as unknown as SupabaseClient;
}

export type Me = { id: string; role: StaffRole };

/** The signed-in staff member, or null. */
export async function whoAmI(client: SupabaseClient): Promise<Me | null> {
  const { data } = await client.auth.getUser();
  const role = data.user?.app_metadata?.role;
  if (!data.user || !isStaffRole(role)) return null;
  return { id: data.user.id, role };
}

export type LiveCycle = {
  id: string;
  term: string;
  award_name: string | null;
  award_amount_cents: number | null;
  decision_date: string | null;
  decisions_released_at: string | null;
};

/** The published cycle (staff can also see drafts, so ask for published explicitly). */
export async function publishedCycle(client: SupabaseClient): Promise<LiveCycle | null> {
  const { data, error } = await client
    .from('cycles')
    .select('id, term, award_name, award_amount_cents, decision_date, decisions_released_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LiveCycle | null) ?? null;
}

export type BlindRow = {
  id: string;
  cycle_id: string;
  applicant_code: string | null;
  initials: string | null;
  year_in_school: string | null;
  credits_left: number | null;
  major: string | null;
  interest_certification: boolean;
  interest_mentoring: boolean;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  submitted_at: string;
};

const BLIND_COLS =
  'id, cycle_id, applicant_code, initials, year_in_school, credits_left, major, interest_certification, interest_mentoring, answer_1, answer_2, answer_3, submitted_at';

/** The submitted applications of a cycle, blind (every staff role). */
export async function blindRows(client: SupabaseClient, cycleId: string): Promise<BlindRow[]> {
  const { data, error } = await client.from('application_reviews').select(BLIND_COLS).eq('cycle_id', cycleId).order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BlindRow[];
}

/** One submitted application by its code, blind (every staff role), or null. */
export async function blindByCode(client: SupabaseClient, code: string): Promise<BlindRow | null> {
  const { data, error } = await client.from('application_reviews').select(BLIND_COLS).eq('applicant_code', code).maybeSingle();
  if (error) throw error;
  return (data as BlindRow | null) ?? null;
}

export type Identity = { id: string; full_name: string | null; terpmail: string | null; phone: string | null };

/** Names and contact details: admins only. Anyone else gets an empty map without asking. */
export async function identityFor(client: SupabaseClient, me: Me, ids: string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  if (me.role !== 'admin' || ids.length === 0) return out;
  const { data, error } = await client.from('applications').select('id, full_name, terpmail, phone').in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as Identity[]) out.set(r.id, r);
  return out;
}

export type StaffName = { user_id: string; display_name: string; initials: string };

/** Every staff member's name and initials, by user id (all staff may read staff_profiles). */
export async function staffNames(client: SupabaseClient): Promise<Map<string, StaffName>> {
  const { data, error } = await client.from('staff_profiles').select('user_id, display_name, initials');
  if (error) throw error;
  return new Map(((data ?? []) as StaffName[]).map((s) => [s.user_id, s]));
}

export type Interview = { applicationId: string; slotId: string; startsAt: string; a: string | null; b: string | null; videoUrl: string | null };

/**
 * Each application's active booking, its slot time and its interviewer pair. A reviewer only sees the pairs they are in
 * (interview_pairings rule); the others show as not paired for them.
 */
export async function interviewsFor(client: SupabaseClient, ids: string[]): Promise<Map<string, Interview>> {
  const out = new Map<string, Interview>();
  if (ids.length === 0) return out;
  const bookings = await client.from('bookings').select('application_id, slot_id, interview_slots(starts_at)').eq('status', 'active').in('application_id', ids);
  if (bookings.error) throw bookings.error;
  type B = { application_id: string; slot_id: string; interview_slots: { starts_at: string } | { starts_at: string }[] | null };
  const rows = (bookings.data ?? []) as B[];
  const slotIds = rows.map((b) => b.slot_id);
  const pairs = new Map<string, { a: string; b: string; video: string | null }>();
  if (slotIds.length > 0) {
    const p = await client.from('interview_pairings').select('slot_id, interviewer_a, interviewer_b, video_url').in('slot_id', slotIds);
    if (p.error) throw p.error;
    for (const r of (p.data ?? []) as { slot_id: string; interviewer_a: string; interviewer_b: string; video_url: string | null }[]) {
      pairs.set(r.slot_id, { a: r.interviewer_a, b: r.interviewer_b, video: r.video_url });
    }
  }
  for (const b of rows) {
    const slot = Array.isArray(b.interview_slots) ? b.interview_slots[0] : b.interview_slots;
    if (!slot?.starts_at) continue;
    const pr = pairs.get(b.slot_id);
    out.set(b.application_id, { applicationId: b.application_id, slotId: b.slot_id, startsAt: slot.starts_at, a: pr?.a ?? null, b: pr?.b ?? null, videoUrl: pr?.video ?? null });
  }
  return out;
}

export type SummaryRow = { application_id: string; summary: string | null; quotes: { criterion?: string; at?: string; text?: string }[]; duration_minutes: number | null };

/** The shared interview summaries the reader may see (admin and board all; a reviewer the ones they interview). */
export async function summariesFor(client: SupabaseClient, ids: string[]): Promise<Map<string, SummaryRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.from('interview_summaries').select('application_id, summary, quotes, duration_minutes').in('application_id', ids);
  if (error) throw error;
  return new Map(((data ?? []) as SummaryRow[]).map((s) => [s.application_id, s]));
}

export type ScoreRow = { application_id: string; scorer_id: string; criteria: Record<string, number>; criteria_count: number; weighted_score: number | null; published: boolean; updated_at: string };

/** Every score the reader may see: their own, plus both scores of applications where both interviewers published. */
export async function visibleScores(client: SupabaseClient, ids: string[]): Promise<ScoreRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from('scores').select('application_id, scorer_id, criteria, criteria_count, weighted_score, published, updated_at').in('application_id', ids);
  if (error) throw error;
  return ((data ?? []) as ScoreRow[]).map((s) => ({ ...s, weighted_score: s.weighted_score === null ? null : Number(s.weighted_score) }));
}

export type Progress = { application_id: string; scorer_id: string; criteria_count: number; published: boolean };

/** Who has scored what, without values: admin and board only. Null for a reviewer (the function refuses them). */
export async function scoreProgress(client: SupabaseClient, me: Me, cycleId: string): Promise<Progress[] | null> {
  if (me.role === 'reviewer') return null;
  const { data, error } = await client.rpc('score_progress', { p_cycle_id: cycleId });
  if (error) throw error;
  return (data ?? []) as Progress[];
}

export type Rubric = { key: string; name: string; weight: number; position: number }[];

/** A cycle's rubric, in order. */
export async function rubricFor(client: SupabaseClient, cycleId: string): Promise<Rubric> {
  const { data, error } = await client.from('rubric_criteria').select('key, name, weight, position').eq('cycle_id', cycleId).order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Rubric;
}

export type Meeting = { starts_at: string; video_url: string | null } | null;

/** The cycle's selection meeting from the calendar, if one is set. */
export async function selectionMeeting(client: SupabaseClient, cycleId: string): Promise<Meeting> {
  const { data, error } = await client
    .from('calendar_events')
    .select('starts_at, video_url')
    .eq('cycle_id', cycleId)
    .eq('kind', 'selection_meeting')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Meeting) ?? null;
}
