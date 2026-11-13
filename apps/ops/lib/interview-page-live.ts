// Live mode: builds the page for one interview (lib/interview-page-view.ts) as the signed-in person. The reads go through a
// reader (lib/applicants-db.ts sessionReader: the session client, so row-level security applies), passed in so tests stand
// in for the database (tests/interview-page-live.test.ts). Every read is paged in a unique order. Read-only.
//
// Core reads (the interview time, its active booking and application, the pairing, the cycle, the staff names) fail the
// page with the load-error card; a time or booking that is not there is "no such interview" (a 404). The questions and the
// notes are optional reads: when one fails only that part says so. Notes are read only when the viewer may read them.
import type { ApReader } from './applicants-live';
import { canReadNotes, mapInterviewPage, UUID, type Row } from './interview-page-map';
import type { InterviewPageResult } from './interview-page-view';

const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' ? e.code : 'unknown');

// A failed read remembers its table and the database's error code, for the server log only.
class ReadFail extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super('read failed');
  }
}

// One server line with the table and the error code only (never a name or a note).
function logFail(e: unknown): void {
  console.error('[interview-page] read failed', { table: e instanceof ReadFail ? e.table : 'unknown', code: e instanceof ReadFail ? e.code : codeOf(e) });
}

/** Reads the interview at `slotId` for the viewer `me` (admin rights from the auth server). */
export async function loadLiveInterviewPage(reader: ApReader, slotId: string, me: string | null, isAdmin: boolean): Promise<InterviewPageResult> {
  if (!UUID.test(slotId)) return { state: 'missing' };
  const all = (table: string, select: string, o: Parameters<ApReader['all']>[2]) =>
    reader.all(table, select, o).catch((e: unknown) => {
      throw new ReadFail(table, codeOf(e));
    });
  const optional = async (p: Promise<Row[]>): Promise<Row[] | null> => {
    try {
      return await p;
    } catch (e) {
      logFail(e);
      return null;
    }
  };
  try {
    const [slots, bookings, pairings] = await Promise.all([
      all('interview_slots', 'id, cycle_id, starts_at, ends_at', { eq: { id: slotId }, order: ['id'] }),
      all('bookings', 'id, application_id', { eq: { slot_id: slotId, status: 'active' }, order: ['id'] }),
      all('interview_pairings', 'slot_id, interviewer_a, interviewer_b, video_url', { eq: { slot_id: slotId }, order: ['slot_id'] }),
    ]);
    const slot = slots[0];
    const booking = bookings[0];
    if (!slot || !booking) return { state: 'missing' };
    const cycleId = String(slot.cycle_id ?? '');
    const [apps, cycles, staff] = await Promise.all([
      all('applications', 'id, applicant_code, full_name', { eq: { id: String(booking.application_id) }, order: ['id'] }),
      all('cycles', 'id, term, award_name', { eq: { id: cycleId }, order: ['id'] }),
      all('staff_profiles', 'user_id, display_name, initials', { order: ['user_id'] }),
    ]);
    const application = apps[0];
    if (!application) return { state: 'missing' };
    const pairing = pairings[0] ?? null;
    const pairIds = pairing ? [String(pairing.interviewer_a), String(pairing.interviewer_b)] : [];
    const readable = canReadNotes(me, isAdmin, pairIds);

    // The questions (the rubric gives the areas' order) and, for those who may read them, the notes.
    const [rubric, questions, notes] = await Promise.all([
      optional(all('rubric_criteria', 'key, name, weight, position', { eq: { cycle_id: cycleId }, order: ['position', 'key'] })),
      optional(all('interview_questions', 'id, criterion_key, position, text, created_at', { eq: { cycle_id: cycleId }, order: ['position', 'created_at', 'id'] })),
      readable ? optional(all('interview_notes', 'id, question_id, author_id, body', { eq: { slot_id: slotId }, order: ['id'] })) : Promise.resolve([] as Row[]),
    ]);
    const view = mapInterviewPage(
      { slot, application, pairing, cycle: cycles[0] ?? null, staff, rubric: rubric ?? [], questions: rubric === null ? null : questions, notes },
      me,
      isAdmin,
    );
    return { state: 'ok', view };
  } catch (e) {
    logFail(e);
    return { state: 'failed' };
  }
}
