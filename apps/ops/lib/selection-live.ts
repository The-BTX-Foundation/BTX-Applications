// The Selection page in LIVE mode: reads the real tables as the signed-in person (row-level security applies) through a
// reader (lib/selection-db.ts on the server; a stand-in in tests/selection-live.test.ts) and builds the page's shape with
// the pure mapping in lib/selection-map.ts.
//
// Every read is a core read: any failure draws the page's designed load error (never zeros or an empty ranking), and logs
// one server line with the table and the error code only (never a name or a score). Every read that can grow is paged;
// id lists go 100 at a time. Scores: only the summary view (which counts published scores only) decides who is ranked,
// and score rows are read with published = true and only for the ranked applications, so an unpublished score never
// reaches the page.
import { chunked, mapAwards, mapCrit, mapCycle, mapMeeting, mapRanking, type Row } from './selection-map';
import type { SelectionView, SlCaps } from './selection-view';
import { easternDay } from './refresh-time';
import { pickMeeting } from './selection-state';

/** One read's filters. `order` lists the sort columns; the last one must be unique for a paged read. */
export type SlReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order?: [string, boolean][]; limit?: number };

/** How live mode reads: `rows` is one request (small reads with a `limit`); `all` pages through every row. */
export type SlReader = {
  rows: (table: string, select: string, o?: SlReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o: SlReadOpts) => Promise<Row[]>;
};

/** The award columns the page reads, with each award's steps (step 1 decides whether it can still be undone). */
export const SL_AWARD_COLS = 'id, application_id, award_name, amount_cents, kind, decided_at, award_steps(step, done_at)';
/** The score columns (published rows only are ever asked for). */
export const SL_SCORE_COLS = 'id, application_id, scorer_id, criteria, weighted_score, published';

/** A read that failed: the table and the database's error code (nothing else is kept). */
class ReadFailed extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super('read failed');
  }
}

// Runs one read; a failure becomes ReadFailed with only the table and the code.
async function read(table: string, run: () => Promise<Row[]>): Promise<Row[]> {
  try {
    return await run();
  } catch (e) {
    const code = e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : 'unknown';
    throw new ReadFailed(table, code);
  }
}

// Reads `table` for every id in `ids`, 100 ids at a time, each chunk paged.
async function byIds(r: SlReader, table: string, select: string, col: string, ids: string[], o: SlReadOpts): Promise<Row[]> {
  const parts = await Promise.all(chunked(ids).map((c) => read(table, () => r.all(table, select, { ...o, in: { ...(o.in ?? {}), [col]: c } }))));
  return parts.flat();
}

/** Loads the live page as a person with `role`. `now` is the server's clock. */
export async function loadLiveSelection(r: SlReader, role: string, now: Date = new Date()): Promise<SelectionView> {
  const nowIso = now.toISOString();
  const base: SelectionView = {
    failed: false,
    loadFailed: false,
    now: nowIso,
    today: easternDay(nowIso),
    cycle: null,
    meeting: null,
    crit: [],
    rows: [],
    unscored: [],
    awards: [],
    caps: { record: false, undo: false, release: false },
    failFirst: false,
  };
  try {
    // The published cycle (staff can also see drafts, so ask for published explicitly), newest first.
    const cycle = (
      await read('cycles', () =>
        r.rows('cycles', 'id, term, award_name, award_amount_cents, interview_start, interview_end, decision_date, decisions_released_at', {
          eq: { status: 'published' },
          order: [
            ['created_at', false],
            ['id', true],
          ],
          limit: 1,
        }),
      )
    )[0];
    if (!cycle) return { ...base, caps: capsFor(role) };
    const cycleId = String(cycle.id);
    const [apps, rubric, meeting, awards, staff] = await Promise.all([
      read('applications', () =>
        r.all('applications', 'id, applicant_code, full_name, terpmail', { eq: { cycle_id: cycleId, status: 'submitted' }, order: [['id', true]] }),
      ),
      read('rubric_criteria', () =>
        r.all('rubric_criteria', 'id, key, name, weight, position', {
          eq: { cycle_id: cycleId },
          order: [
            ['position', true],
            ['id', true],
          ],
        }),
      ),
      read('calendar_events', () =>
        // Every selection meeting of the cycle (an old row may linger): the page shows the next one, else the latest.
        r.all('calendar_events', 'id, starts_at, video_url', {
          eq: { cycle_id: cycleId, kind: 'selection_meeting' },
          order: [
            ['starts_at', true],
            ['id', true],
          ],
        }),
      ),
      read('scholarship_awards', () =>
        r.all('scholarship_awards', SL_AWARD_COLS, {
          eq: { cycle_id: cycleId },
          in: { kind: ['main', 'extra'] },
          order: [
            ['decided_at', true],
            ['id', true],
          ],
        }),
      ),
      read('staff_profiles', () => r.all('staff_profiles', 'user_id, display_name', { order: [['user_id', true]] })),
    ]);
    const appIds = apps.map((a) => String(a.id));
    // Who has both scores published (the view counts published scores only).
    const summary = await byIds(r, 'application_score_summary', 'application_id, published_count, combined_score', 'application_id', appIds, {
      order: [['application_id', true]],
    });
    const rankedIds = summary.filter((s) => Number(s.published_count) >= 2 && s.combined_score != null).map((s) => String(s.application_id));
    const [scores, notes] = await Promise.all([
      byIds(r, 'scores', SL_SCORE_COLS, 'application_id', rankedIds, { eq: { published: true }, order: [['id', true]] }),
      byIds(r, 'interview_summaries', 'application_id, summary, quotes', 'application_id', rankedIds, { order: [['application_id', true]] }),
    ]);
    const crit = mapCrit(rubric);
    const ranking = mapRanking({ apps, summary, scores, staff, notes, crit });
    return {
      ...base,
      cycle: mapCycle(cycle, apps.length),
      meeting: mapMeeting(pickMeeting(meeting, nowIso)),
      crit,
      rows: ranking.rows,
      unscored: ranking.unscored,
      awards: mapAwards(awards, apps),
      caps: capsFor(role),
    };
  } catch (e) {
    const f = e instanceof ReadFailed ? e : new ReadFailed('unknown', 'unknown');
    console.error('[selection] read failed', { table: f.table, code: f.code });
    return { ...base, loadFailed: true };
  }
}

/**
 * What a role may do. Admins and board members record and undo awards (scholarship_awards row-level security; the server
 * actions decide again); only admins release decisions (lib/release.ts; the server action refuses anyone else).
 */
export function capsFor(role: string): SlCaps {
  const staff = role === 'admin' || role === 'board';
  return { record: staff, undo: staff, release: role === 'admin' };
}
