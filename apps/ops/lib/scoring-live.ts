// Live mode: builds the Scoring view (lib/scoring-view.ts) from the real tables as the signed-in person. The reads go
// through a reader (lib/applicants-db.ts sessionReader: the session client, so row-level security applies), passed in so
// tests can stand in for the database (tests/scoring-live.test.ts). Every read is paged in a unique order and every `in()`
// filter is sent in chunks of 100 ids.
//
// Read-only. BLIND SCORING: the only score rows read with their values are the signed-in person's own
// (`scorer_id = me`) and, for the cycle average, published rows the database already lets them see; lib/scoring-map.ts
// filters both again and only averages leave this file. The other interviewer is a published yes/no from
// score_progress() (no values). Private notes are read only for `user_id = me`.
//
// A failed core read (the cycle, the queue, the rubric, their own scores and notes, progress) is a load error, never an
// empty queue or a zero. The interview summaries and questions are extras: when they fail the page says so in place.
import { chunk, type Row } from './applicants-map';
import type { ApReader, ApReadOpts } from './applicants-live';
import { notesForScoring, questionGroups } from './interview-page-map';
import { easternDay } from './refresh-time';
import { LIVE_CAPS, cycleAverages, mapCriteria, mapSheets } from './scoring-map';
import type { ScoringResult } from './scoring-view';

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

/** Server log of a failed read: the table and error code only (never a name, a score or a note). */
export function logFail(e: unknown): void {
  console.error('[scoring] read failed', { table: e instanceof ReadFail ? e.table : 'unknown', code: e instanceof ReadFail ? e.code : codeOf(e) });
}

// Every row of `table` whose `col` is one of `ids`, in chunks of 100 ids.
async function readIn(read: ApReader, table: string, select: string, col: string, ids: string[], o: Omit<ApReadOpts, 'in'>): Promise<Row[]> {
  if (!ids.length) return [];
  const parts = await Promise.all(chunk(ids, 100).map((c) => read.all(table, select, { ...o, in: { [col]: c } })));
  return parts.flat();
}

// An optional read: the rows, or null when it failed (logged, table and code only).
async function optional(p: Promise<Row[]>): Promise<Row[] | null> {
  try {
    return await p;
  } catch (e) {
    logFail(e);
    return null;
  }
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** Reads the real tables for the signed-in person `me` and returns their queue (failed when a core read throws). */
export async function loadLiveScoring(reader: ApReader, me: string, now = new Date()): Promise<ScoringResult> {
  const instant = now.toISOString();
  const today = easternDay(instant);
  const read = guard(reader);
  const empty = { failed: false as const, today, now: instant, due: null, criteria: [], sheets: [], caps: LIVE_CAPS, notesFailed: false, questionsFailed: false, sim: null };
  try {
    const cycles = await read.all('cycles', 'id, created_at', { eq: { status: 'published' }, order: ['created_at', 'id'] });
    const cycle = cycles[cycles.length - 1];
    if (!cycle) return empty;
    const cid = String(cycle.id);

    // The person's pairings (as either interviewer), the rubric, the progress (no values) and the staff names.
    const [pa, pb, rubric, progress, staff] = await Promise.all([
      read.all('interview_pairings', 'slot_id, interviewer_a, interviewer_b', { eq: { interviewer_a: me }, order: ['slot_id'] }),
      read.all('interview_pairings', 'slot_id, interviewer_a, interviewer_b', { eq: { interviewer_b: me }, order: ['slot_id'] }),
      read.all('rubric_criteria', 'key, name, weight, position', { eq: { cycle_id: cid }, order: ['position', 'key'] }),
      read.rpc('score_progress', { p_cycle_id: cid }, ['application_id', 'scorer_id']),
      read.all('staff_profiles', 'user_id, display_name', { order: ['user_id'] }),
    ]);
    const pairings = [...pa, ...pb];
    const bookings = await readIn(read, 'bookings', 'application_id, slot_id, interview_slots(starts_at)', 'slot_id', uniq(pairings.map((p) => String(p.slot_id))), {
      eq: { status: 'active' },
      order: ['id'],
    });
    const apps = await readIn(read, 'applications', 'id, applicant_code, full_name, terpmail', 'id', uniq(bookings.map((b) => String(b.application_id))), {
      eq: { cycle_id: cid, status: 'submitted' },
      order: ['id'],
    });
    const ids = apps.map((a) => String(a.id));

    // Their own scores and private notes are core: a failure must never draw an empty draft or an empty note box.
    const [own, notes, summaries, questions, visible] = await Promise.all([
      readIn(read, 'scores', 'application_id, scorer_id, criteria, published, published_at, updated_at', 'application_id', ids, { eq: { scorer_id: me }, order: ['id'] }),
      readIn(read, 'score_private_notes', 'application_id, note', 'application_id', ids, { eq: { user_id: me }, order: ['application_id'] }),
      optional(readIn(read, 'interview_summaries', 'application_id, summary, quotes, duration_minutes', 'application_id', ids, { order: ['application_id'] })),
      // The Questions page's order (position, created_at, id: lib/questions-db.ts), so the numbers match the interview page.
      optional(read.all('interview_questions', 'criterion_key, position, text, id, created_at', { eq: { cycle_id: cid }, order: ['position', 'created_at', 'id'] })),
      // For the cycle average: published rows only. Row-level security returns only the person's own and released
      // ones; lib/scoring-map.ts cycleAverages filters again and only the averages are kept.
      optional(read.all('scores', 'application_id, scorer_id, criteria, published, applications!inner(cycle_id)', { eq: { published: true, 'applications.cycle_id': cid }, order: ['id'] })),
    ]);

    const keys = rubric.map((r) => String(r.key));
    const avg = visible ? cycleAverages(keys, visible, progress, me) : {};
    const criteria = mapCriteria(rubric, questions ?? [], avg);
    const mapped = mapSheets({ pairings, bookings, apps, scores: own, progress, notes, summaries: summaries ?? [], staff }, criteria, me, instant);

    // The interviewers' notes per question (the interview's page), read only. Optional: a failure says so in the panel.
    const slotOf = new Map(bookings.map((b) => [String(b.application_id), String(b.slot_id)]));
    const slotIds = uniq(mapped.map((s) => slotOf.get(s.applicationId)).filter((x): x is string => !!x));
    const ivRows = await optional(readIn(read, 'interview_notes', 'id, slot_id, question_id, author_id, body', 'slot_id', slotIds, { order: ['id'] }));
    const groups = questions ? questionGroups(rubric, questions) : [];
    const names = new Map(staff.map((p) => [String(p.user_id), typeof p.display_name === 'string' ? p.display_name : '']));
    const sheets = mapped.map((s) => {
      const slot = slotOf.get(s.applicationId);
      const rows = slot && ivRows ? ivRows.filter((r) => String(r.slot_id) === slot) : [];
      return { ...s, ivNotes: notesForScoring(groups, rows, names, me) };
    });
    return { ...empty, criteria, sheets, notesFailed: summaries === null, questionsFailed: questions === null, ivNotesFailed: ivRows === null };
  } catch (e) {
    logFail(e);
    return { failed: true };
  }
}
