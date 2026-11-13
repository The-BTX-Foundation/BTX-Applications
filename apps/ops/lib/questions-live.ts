// Live mode: builds the Interview questions view (lib/questions-view.ts) as the signed-in person. The reads go through a
// reader (lib/questions-db.ts: the session client, so row-level security applies), passed in so tests can stand in for
// the database (tests/questions-live.test.ts). The mapping is pure (lib/questions-map.ts).
//
// Core reads (the cycle, its rubric and its questions) fail the page's questions with the load-error card, never an empty
// list. The next interview is an optional read: when it fails only that panel shows its load error.
import { STARTER_QUESTIONS } from '@/mock/interview-flow';
import { liveCaps, pickNext, qnGroups, type Row } from './questions-map';
import type { QnNext, QnResult, QnView } from './questions-view';

/** The reads live mode needs. Each returns every matching row (paged) or throws `{ table, code }`. */
export type QnReader = {
  /** The newest published cycle (`id, term`), or null. */
  cycle: () => Promise<Row | null>;
  rubric: (cycleId: string) => Promise<Row[]>;
  questions: (cycleId: string) => Promise<Row[]>;
  /** The person's pairings in the cycle whose slot starts after `nowIso` (slot embedded as `interview_slots`). */
  myPairings: (cycleId: string, me: string, nowIso: string) => Promise<Row[]>;
  /** Active bookings of these slots. */
  bookings: (slotIds: string[]) => Promise<Row[]>;
  applications: (ids: string[]) => Promise<Row[]>;
  staff: (ids: string[]) => Promise<Row[]>;
};

/** The view when the core read failed: the title and the load-error card. */
function failedView(me: string | null, isAdmin: boolean): QnView {
  return { cycleId: null, term: null, groups: [], isAdmin, next: null, nextFailed: false, loadFailed: true, caps: liveCaps(false, false), me, starterCount: STARTER_QUESTIONS.length, mockWrite: null };
}

// One server line with the table and the error code only (never row data, names or the message).
function logFail(err: unknown): void {
  const e = (err ?? {}) as { table?: unknown; code?: unknown };
  console.error('[questions] read failed', { table: typeof e.table === 'string' ? e.table : 'unknown', code: typeof e.code === 'string' ? e.code : 'unknown' });
}

// The person's next interview: pairings, then the bookings of those slots, then the applications and the other person.
async function readNext(read: QnReader, cycleId: string, me: string, nowIso: string): Promise<QnNext | null> {
  const pairings = await read.myPairings(cycleId, me, nowIso);
  if (pairings.length === 0) return null;
  const bookings = await read.bookings(pairings.map((p) => String(p.slot_id)));
  if (bookings.length === 0) return null;
  const others = pairings.map((p) => (String(p.interviewer_a) === me ? String(p.interviewer_b) : String(p.interviewer_a)));
  const [apps, staff] = await Promise.all([read.applications([...new Set(bookings.map((b) => String(b.application_id)))]), read.staff([...new Set(others)])]);
  return pickNext(me, pairings, bookings, apps, staff, nowIso);
}

/** Reads the cycle, its questions and the person's next interview. `isAdmin` comes from the auth server (requireStaff). */
export async function loadLiveQnView(read: QnReader, me: string | null, isAdmin: boolean, now = new Date()): Promise<QnResult> {
  let core: { cycle: Row | null; rubric: Row[]; questions: Row[] };
  try {
    const cycle = await read.cycle();
    if (!cycle) {
      core = { cycle: null, rubric: [], questions: [] };
    } else {
      const id = String(cycle.id);
      const [rubric, questions] = await Promise.all([read.rubric(id), read.questions(id)]);
      core = { cycle, rubric, questions };
    }
  } catch (err) {
    logFail(err);
    return { ...failedView(me, isAdmin), failed: false };
  }
  const cycleId = core.cycle ? String(core.cycle.id) : null;
  let next: QnNext | null = null;
  let nextFailed = false;
  if (cycleId && me) {
    try {
      next = await readNext(read, cycleId, me, now.toISOString());
    } catch (err) {
      logFail(err);
      nextFailed = true;
    }
  }
  const view: QnView = {
    cycleId,
    term: core.cycle && typeof core.cycle.term === 'string' ? core.cycle.term : null,
    groups: qnGroups(core.rubric, core.questions),
    isAdmin,
    next,
    nextFailed,
    loadFailed: false,
    caps: liveCaps(isAdmin, cycleId !== null),
    me,
    starterCount: STARTER_QUESTIONS.length,
    mockWrite: null,
  };
  return { ...view, failed: false };
}
