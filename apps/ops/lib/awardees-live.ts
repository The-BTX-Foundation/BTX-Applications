// The Awardees page in LIVE mode: reads the real tables as the signed-in person (row-level security applies) through a
// reader (lib/awardees-db.ts on the server; a stand-in in tests/awardees-live.test.ts) and builds the page's shape with
// the pure mapping in lib/awardees-map.ts.
// Core reads (the published cycle, its selection meeting, the term's awards with their steps, and the matching
// applications) fail the page: it draws its designed load error. The optional read (past awards) fails only its own
// section. Every read that can grow is paged; applications are read only for the awards shown, 100 ids at a time, and
// only from the published cycle's submitted applications. Nothing here logs a row.
import { chunked, mapAwards, mapCycle, mapPast, type Row } from './awardees-map';
import type { AwardeesView, AwCaps } from './awardees-view';
import { easternDay } from './refresh-time';

/** One read's filters. `order` lists the sort columns; the last one must be unique for a paged read. */
export type AwReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: [string, boolean][]; limit?: number };

/** How live mode reads: `rows` is one request (small reads with a `limit`); `all` pages through every row. */
export type AwReader = {
  rows: (table: string, select: string, o?: AwReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: AwReadOpts) => Promise<Row[]>;
};

/** The award columns the page reads, with each award's five steps. */
export const AWARD_COLS = 'id, application_id, award_name, amount_cents, kind, decision_note, payment_due_on, decided_at, award_steps(step, due_on, done_at, reminder_sent_at)';

/** The term's awards and the matching applications (core). */
async function readCurrent(r: AwReader, cycleId: string): Promise<{ awards: Row[]; apps: Row[] }> {
  // Main and extra awards of the cycle, in the order they were decided (id last: a stable order for paging).
  const awards = await r.all('scholarship_awards', AWARD_COLS, {
    eq: { cycle_id: cycleId },
    in: { kind: ['main', 'extra'] },
    order: [
      ['decided_at', true],
      ['id', true],
    ],
  });
  const ids = [...new Set(awards.map((a) => a.application_id).filter((v): v is string => typeof v === 'string' && v.length > 0))];
  // Only the applications of these awards, from this cycle, submitted (the same filters the old page used).
  const parts = await Promise.all(
    chunked(ids).map((c) =>
      r.all('applications', 'id, applicant_code, full_name, terpmail', { eq: { cycle_id: cycleId, status: 'submitted' }, in: { id: c }, order: [['id', true]] }),
    ),
  );
  return { awards, apps: parts.flat() };
}

/** Past awards entered for history, newest term first (optional: a failure marks only that section). */
async function readPast(r: AwReader): Promise<Row[]> {
  return r.all('scholarship_awards', 'id, past_term, award_name, amount_cents, awardee_label, past_term_starts', {
    eq: { kind: 'past' },
    order: [
      ['past_term_starts', false],
      ['id', true],
    ],
  });
}

/** Loads the live page. `now` is the server's clock (today's Eastern day is counted from it). */
export async function loadLiveAwardees(r: AwReader, role: string, now: Date = new Date()): Promise<AwardeesView> {
  const today = easternDay(now.toISOString());
  const staffRole = role === 'admin' || role === 'board';
  const pastRead = readPast(r).then(
    (rows) => ({ ok: true as const, rows }),
    () => ({ ok: false as const }),
  );
  let core: { cycle: Row | undefined; meeting: Row | undefined; awards: Row[]; apps: Row[] } | null = null;
  try {
    // The published cycle (staff can also see drafts, so ask for published explicitly), newest first.
    const cycle = (
      await r.rows('cycles', 'id, term, award_name, award_amount_cents, decision_date, decisions_released_at', {
        eq: { status: 'published' },
        order: [
          ['created_at', false],
          ['id', true],
        ],
        limit: 1,
      })
    )[0];
    if (cycle) {
      const [meeting, current] = await Promise.all([
        r.rows('calendar_events', 'starts_at', {
          eq: { cycle_id: cycle.id, kind: 'selection_meeting' },
          order: [
            ['starts_at', true],
            ['id', true],
          ],
          limit: 1,
        }),
        readCurrent(r, String(cycle.id)),
      ]);
      core = { cycle, meeting: meeting[0], ...current };
    } else {
      core = { cycle: undefined, meeting: undefined, awards: [], apps: [] };
    }
  } catch {
    core = null;
  }
  const past = await pastRead;
  const caps: AwCaps = {
    // award_steps update through lib/actions/awardees.ts setStepDone (admins and board members; zero rows = refused).
    tick: core != null && staffRole,
    // Mock only: setStepDone would stamp the person pressing Undo and now over the earlier record. Live re-ticks or
    // unticks with the step control instead.
    undo: false,
    // rpc mark_award_funds_sent (ticks step 4, sets paid_on, logs the payment on Budget in one step; a repeat says already_paid).
    funds: core != null && staffRole,
    // No email is ever sent from this page.
    remindEmail: false,
    // award_steps.reminder_sent_at update through lib/actions/awardees.ts sendReminder (records the date only).
    recordReminder: core != null && staffRole,
  };
  return {
    failed: false,
    today,
    cycle: core?.cycle ? mapCycle(core.cycle, core.meeting) : null,
    awards: core ? mapAwards(core.awards, core.apps) : [],
    past: past.ok ? mapPast(past.rows) : [],
    pastFailed: !past.ok,
    loadFailed: core == null,
    caps,
  };
}
