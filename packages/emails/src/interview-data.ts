// Reads what the interview emails need, with the SERVICE ROLE client (server only): who holds a slot, who interviews
// it, the video link, the applicant's name, address and short answers, the interviewers' names and addresses, and the
// cycle's interview questions. Shared by the Ops Hub senders and the Portal's booking route. Throws on a database error.
import { groupQuestions, type QuestionGroup } from './interviews';

// Any Supabase client (kept structural so this package needs no Supabase dependency).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ReadDb = { from: (table: string) => any; auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string | null } | null }; error: unknown }> } } };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type InterviewPerson = { userId: string; name: string; email: string | null };

export type InterviewRow = {
  slotId: string;
  cycleId: string;
  startsAt: string;
  endsAt: string;
  videoUrl: string | null;
  applicationId: string;
  applicantName: string;
  applicantEmail: string;
  code: string;
  /** answer_1..answer_3 */
  answers: (string | null)[];
  /** Empty when nobody is paired yet. */
  interviewers: InterviewPerson[];
};

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`interview data: ${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

type BookingRow = { application_id: string; slot_id: string; interview_slots: { id: string; cycle_id: string; starts_at: string; ends_at: string } };

/** Active bookings of the given slots, or of slots starting in [from, to), with everything the emails need. */
export async function readInterviews(db: ReadDb, q: { slotIds: string[] } | { from: string; to: string }): Promise<InterviewRow[]> {
  if ('slotIds' in q && q.slotIds.length === 0) return [];
  let query = db.from('bookings').select('application_id, slot_id, interview_slots!inner(id, cycle_id, starts_at, ends_at)').eq('status', 'active');
  query = 'slotIds' in q ? query.in('slot_id', q.slotIds) : query.gte('interview_slots.starts_at', q.from).lt('interview_slots.starts_at', q.to);
  const bookings = must<BookingRow[]>('bookings', await query);
  if (bookings.length === 0) return [];
  const slotIds = bookings.map((b) => b.slot_id);
  const appIds = bookings.map((b) => b.application_id);
  const pairings = must<{ slot_id: string; interviewer_a: string; interviewer_b: string; video_url: string | null }[]>('pairings', await db.from('interview_pairings').select('slot_id, interviewer_a, interviewer_b, video_url').in('slot_id', slotIds));
  const apps = must<{ id: string; full_name: string | null; terpmail: string; applicant_code: string | null; answer_1: string | null; answer_2: string | null; answer_3: string | null }[]>(
    'applications',
    await db.from('applications').select('id, full_name, terpmail, applicant_code, answer_1, answer_2, answer_3').in('id', appIds),
  );
  const staffIds = [...new Set(pairings.flatMap((p) => [p.interviewer_a, p.interviewer_b]))];
  const staff = staffIds.length ? must<{ user_id: string; display_name: string }[]>('staff', await db.from('staff_profiles').select('user_id, display_name').in('user_id', staffIds)) : [];
  const names = new Map(staff.map((s) => [s.user_id, s.display_name]));
  const emails = new Map<string, string | null>();
  for (const id of staffIds) {
    const r = await db.auth.admin.getUserById(id);
    emails.set(id, r.data?.user?.email ?? null);
  }
  const appById = new Map(apps.map((a) => [a.id, a]));
  const pairBySlot = new Map(pairings.map((p) => [p.slot_id, p]));
  const rows: InterviewRow[] = [];
  for (const b of bookings) {
    const a = appById.get(b.application_id);
    if (!a) continue;
    const p = pairBySlot.get(b.slot_id);
    const person = (id: string): InterviewPerson => ({ userId: id, name: names.get(id) ?? 'A board member', email: emails.get(id) ?? null });
    rows.push({
      slotId: b.slot_id,
      cycleId: b.interview_slots.cycle_id,
      startsAt: b.interview_slots.starts_at,
      endsAt: b.interview_slots.ends_at,
      videoUrl: p?.video_url ?? null,
      applicationId: a.id,
      applicantName: (a.full_name ?? '').trim() || a.applicant_code || 'The applicant',
      applicantEmail: a.terpmail,
      code: a.applicant_code ?? '',
      answers: [a.answer_1, a.answer_2, a.answer_3],
      interviewers: p ? [person(p.interviewer_a), person(p.interviewer_b)] : [],
    });
  }
  return rows.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

/** The cycle's term and award name for the email footers. */
export async function readCycleInfo(db: ReadDb, cycleId: string): Promise<{ term: string; award: string }> {
  const r = await db.from('cycles').select('term, award_name').eq('id', cycleId).maybeSingle();
  const row = must<{ term: string; award_name: string | null } | null>('cycle', r);
  return { term: row?.term ?? '', award: row?.award_name ?? 'scholarship' };
}

/** The cycle's interview questions grouped by rubric criterion name ("To close" last). */
export async function readQuestionGroups(db: ReadDb, cycleId: string): Promise<QuestionGroup[]> {
  const qs = must<{ criterion_key: string | null; position: number; text: string }[]>('questions', await db.from('interview_questions').select('criterion_key, position, text').eq('cycle_id', cycleId));
  const cs = must<{ key: string; name: string; position: number }[]>('rubric', await db.from('rubric_criteria').select('key, name, position').eq('cycle_id', cycleId));
  return groupQuestions(
    qs.map((q) => ({ criterionKey: q.criterion_key, position: q.position, text: q.text })),
    cs,
  );
}
