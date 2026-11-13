// Live mode: builds the Applicants views (lib/applicants-view.ts) from the real tables as the signed-in person. The reads
// go through a reader (lib/applicants-db.ts: the session client, so row-level security applies), passed in so tests can
// stand in for the database (tests/applicants-live.test.ts). Every read is paged (lib/applicants-map.ts pageAll) in a
// unique order, and every `in()` filter is sent in chunks of 100 ids, so no list is ever cut short.
//
// Read-only: nothing here writes, emails or sends. A failed read is a load error (the whole-page "didn't load" card),
// never an empty list or a zero. Scores: only the columns needed for progress and the released average are read (never
// the criteria values), and row-level security shows other people's scores only once both interviewers published.
import { chunk, interviewers, liveCaps, mapApplicants, mapPeople, type ApLiveRows, type Row } from './applicants-map';
import type { ApApplicant, ApCycle, ApFact, ApplicantDetailResult, ApplicantsResult } from './applicants-view';

/** One paged read: filters and a stable order (the last column must make the order unique). */
export type ApReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order: string[] };

/** How live mode reads: `all` pages a table until every row is in; `rpc` pages a set-returning function the same way. */
export type ApReader = {
  all: (table: string, select: string, o: ApReadOpts) => Promise<Row[]>;
  rpc: (fn: string, args: Record<string, unknown>, order: string[]) => Promise<Row[]>;
};

/** Who is looking (from requireStaff): their id and whether they hold admin rights (export, O1). */
export type ApViewer = { id: string; admin: boolean };

// A failed read remembers which table (or function) said no and the database's error code, for the server log only.
class ReadFail extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super('read failed');
  }
}
const codeOf = (e: unknown) => (e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' ? e.code : 'unknown');

// The reader, with each failure tagged by its table.
function guard(read: ApReader): ApReader {
  return {
    all: (t, s, o) =>
      read.all(t, s, o).catch((e: unknown) => {
        throw new ReadFail(t, codeOf(e));
      }),
    rpc: (fn, a, o) =>
      read.rpc(fn, a, o).catch((e: unknown) => {
        throw new ReadFail(fn, codeOf(e));
      }),
  };
}

// Server log of a failed read: the table and error code only (never a name, email or applicant code).
function logFail(e: unknown) {
  console.error('[applicants] read failed', { table: e instanceof ReadFail ? e.table : 'unknown', code: e instanceof ReadFail ? e.code : codeOf(e) });
}

const APP_COLS = 'id, cycle_id, applicant_code, full_name, terpmail, phone, submitted_at';
const DETAIL_COLS =
  'id, cycle_id, applicant_code, full_name, terpmail, phone, submitted_at, year_in_school, credits_left, major, interest_certification, interest_mentoring, answer_1, answer_2, answer_3, secondary_email, gender, race, heard_from, stay_in_touch, agreed_true';
const CYCLE_COLS = 'id, term, award_name, opens_at, decision_date, interview_end, created_at';
const SCORE_COLS = 'id, application_id, scorer_id, criteria_count, weighted_score, published';

// Every row of `table` whose `col` is one of `ids`, in chunks of 100 ids.
async function readIn(read: ApReader, table: string, select: string, col: string, ids: string[], o: Omit<ApReadOpts, 'in'>): Promise<Row[]> {
  const parts = await Promise.all(chunk(ids, 100).map((c) => read.all(table, select, { ...o, in: { [col]: c } })));
  return parts.flat();
}

/** The published cycle (the newest one), or null. */
export async function readCycle(read: ApReader): Promise<Row | null> {
  const rows = await read.all('cycles', CYCLE_COLS, { eq: { status: 'published' }, order: ['created_at', 'id'] });
  return rows.length ? rows[rows.length - 1] : null;
}

// The cycle facts both pages draw.
async function cycleFacts(read: ApReader, c: Row): Promise<ApCycle> {
  const cid = String(c.id);
  const [rubric, meetings] = await Promise.all([
    read.all('rubric_criteria', 'id', { eq: { cycle_id: cid }, order: ['id'] }),
    read.all('calendar_events', 'id, starts_at', { eq: { cycle_id: cid, kind: 'selection_meeting' }, order: ['starts_at', 'id'] }),
  ]);
  return {
    term: typeof c.term === 'string' ? c.term : '',
    awardName: typeof c.award_name === 'string' && c.award_name.trim() ? c.award_name.trim() : 'Scholarship',
    opensAt: typeof c.opens_at === 'string' ? c.opens_at : null,
    criteriaTotal: rubric.length || 6,
    // The scores' due day is not stored anywhere, so live mode draws no "Due" line.
    scoresDue: null,
    interviewEnd: typeof c.interview_end === 'string' ? c.interview_end : null,
    selectionAt: typeof meetings[0]?.starts_at === 'string' ? (meetings[0].starts_at as string) : null,
    awardOn: typeof c.decision_date === 'string' ? c.decision_date : null,
  };
}

// Everything the applicants' stages need, for these application rows.
async function stageRows(read: ApReader, cycleId: string, apps: Row[]): Promise<Omit<ApLiveRows, 'apps'>> {
  const ids = apps.map((a) => String(a.id));
  const [bookings, summaries, scores, progress] = await Promise.all([
    readIn(read, 'bookings', 'id, application_id, slot_id, interview_slots(starts_at, ends_at)', 'application_id', ids, { eq: { status: 'active' }, order: ['id'] }),
    readIn(read, 'interview_summaries', 'application_id, summary', 'application_id', ids, { order: ['application_id'] }),
    readIn(read, 'scores', SCORE_COLS, 'application_id', ids, { order: ['id'] }),
    read.rpc('score_progress', { p_cycle_id: cycleId }, ['application_id', 'scorer_id']),
  ]);
  const slots = [...new Set(bookings.map((b) => String(b.slot_id)))];
  const pairings = await readIn(read, 'interview_pairings', 'slot_id, interviewer_a, interviewer_b', 'slot_id', slots, { order: ['slot_id'] });
  const idSet = new Set(ids);
  return { bookings, pairings, summaries, scores, progress: progress.filter((p) => idSet.has(String(p.application_id))) };
}

/** Reads the real tables and returns the list (failed when any read throws). `now` is for tests. */
export async function loadLiveApplicants(reader: ApReader, viewer: ApViewer, now = new Date()): Promise<ApplicantsResult> {
  const instant = now.toISOString();
  const read = guard(reader);
  try {
    const c = await readCycle(read);
    const caps = liveCaps(viewer.admin);
    if (!c) {
      const cycle: ApCycle = { term: '', awardName: 'Scholarship', opensAt: null, criteriaTotal: 6, scoresDue: null, interviewEnd: null, selectionAt: null, awardOn: null };
      return { failed: false, now: instant, me: viewer.id, cycle, people: [], applicants: [], loadFailed: false, caps };
    }
    const cid = String(c.id);
    const [cycle, apps, profiles] = await Promise.all([
      cycleFacts(read, c),
      read.all('applications', APP_COLS, { eq: { cycle_id: cid, status: 'submitted' }, order: ['id'] }),
      read.all('staff_profiles', 'user_id, display_name, initials', { order: ['user_id'] }),
    ]);
    const rest = await stageRows(read, cid, apps);
    const people = mapPeople(profiles, viewer.id);
    const applicants = mapApplicants({ apps, ...rest }, people, viewer.id, viewer.admin);
    return { failed: false, now: instant, me: viewer.id, cycle, people: interviewers(applicants), applicants, loadFailed: false, caps };
  } catch (e) {
    // Only the table and code reach the server log; the page shows its "didn't load" card.
    logFail(e);
    return { failed: true };
  }
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const yesNo = (v: unknown) => (v === true ? 'Yes' : 'No');

/** The answers, in the order the Portal asks them. */
export function detailAnswers(r: Row): ApFact[] {
  return [
    { label: 'Year in school', value: text(r.year_in_school) },
    { label: 'Major', value: text(r.major) },
    { label: 'Credits left', value: text(r.credits_left) },
    { label: 'Heard about the scholarship from', value: text(r.heard_from) },
    { label: 'Interested in certification', value: yesNo(r.interest_certification) },
    { label: 'Interested in mentoring', value: yesNo(r.interest_mentoring) },
    { label: 'Stay in touch', value: yesNo(r.stay_in_touch) },
    { label: 'Confirmed the answers are true', value: yesNo(r.agreed_true) },
  ];
}

/**
 * One application by its code (codes are unique), as the signed-in person: missing when there is none or row-level
 * security hides it (the page then answers 404, as before), failed when a read throws.
 */
export async function loadLiveApplicant(reader: ApReader, viewer: ApViewer, code: string, now = new Date()): Promise<ApplicantDetailResult> {
  const instant = now.toISOString();
  const read = guard(reader);
  try {
    const rows = await read.all('applications', DETAIL_COLS, { eq: { applicant_code: code, status: 'submitted' }, order: ['id'] });
    if (rows.length === 0) return { failed: false, missing: true };
    const r = rows[0];
    const cid = String(r.cycle_id);
    const [cycles, files, profiles] = await Promise.all([
      read.all('cycles', CYCLE_COLS, { eq: { id: cid }, order: ['id'] }),
      read.all('application_files', 'id, kind, filename', { eq: { application_id: String(r.id) }, order: ['id'] }),
      read.all('staff_profiles', 'user_id, display_name, initials', { order: ['user_id'] }),
    ]);
    const c = cycles[0] ?? { id: cid };
    const [cycle, rest] = await Promise.all([cycleFacts(read, c), stageRows(read, cid, [r])]);
    const people = mapPeople(profiles, viewer.id);
    // Contact details are on the page for every staff member (D2), so the applicant carries them here.
    const applicant: ApApplicant = mapApplicants({ apps: [r], ...rest }, people, viewer.id, true)[0];
    const fileOf = (k: string) => text(files.find((f) => f.kind === k)?.filename);
    return {
      failed: false,
      missing: false,
      now: instant,
      me: viewer.id,
      cycle,
      applicant,
      identity: [
        { label: 'Name', value: text(r.full_name) },
        { label: 'Terpmail', value: text(r.terpmail) },
        { label: 'Other email', value: text(r.secondary_email) },
        { label: 'Phone', value: text(r.phone) },
        { label: 'Gender', value: text(r.gender) },
        { label: 'Race', value: text(r.race) },
      ],
      answers: detailAnswers(r),
      shortAnswers: [String(r.answer_1 ?? ''), String(r.answer_2 ?? ''), String(r.answer_3 ?? '')],
      files: [
        { kind: 'resume', label: 'Resume', filename: fileOf('resume') },
        { kind: 'transcript', label: 'Transcript', filename: fileOf('transcript') },
      ],
      caps: liveCaps(viewer.admin),
    };
  } catch (e) {
    logFail(e);
    return { failed: true, missing: false };
  }
}
