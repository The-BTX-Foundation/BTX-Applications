// Live mode: builds the Grants view (lib/grants-view.ts) from the real tables as the signed-in person. The reads go through
// a reader (lib/grants-db.ts: the session client, so row-level security applies), passed in so tests can stand in for the
// database (tests/grants-live.test.ts). Every read is paged (lib/grants-map.ts pageAll), so a list is never cut at 1,000.
//
// What a failed read does, so a failure never reads as a true number:
// - core reads (grants, staff_profiles): the page shows its "Grants didn't load." card, because "0 grants" or
//   "Won so far $0" from a failed read would be false;
// - the checklist (checklists, its tasks, their assignees): only that panel shows its error line.
import { chunk, CHECKLIST_TITLE, LIVE_CAPS, mapGrants, mapPeople, mapSteps, stageCounts, type Row } from './grants-map';
import { easternDay } from './refresh-time';
import type { GrantsChecklist, GrantsResult, GrantsView } from './grants-view';

/** One paged read: filters and a stable order (the last column must make the order unique). */
export type GrantsReadOpts = { eq?: Record<string, unknown>; in?: Record<string, unknown[]>; order: string[] };

/** How live mode reads: `all` pages until every row is in; `me` is the signed-in person's id (null if none). */
export type GrantsReader = {
  all: (table: string, select: string, o: GrantsReadOpts) => Promise<Row[]>;
  me: () => Promise<string | null>;
};

const GRANT_COLS = 'id, name, funder, amount_cents, amount_is_up_to, stage, outcome, deadline_on, date_note, submitted_on, decided_on, owner_id, created_at';

/** The view live mode shows when a core read fails: the title and the "Grants didn't load." card, nothing else. */
export function failedView(today: string, now: string): GrantsView {
  return { today, now, grants: [], counts: { researching: 0, writing: 0, submitted: 0, decided: 0 }, checklist: null, budgetCount: null, loadFailed: true, caps: LIVE_CAPS };
}

/**
 * The "Getting started with grants" checklist: the oldest checklist with that title, its tasks that are not archived,
 * and only those tasks' assignees (in chunks of 100 ids). No checklist yet = no steps.
 */
export async function readChecklist(read: GrantsReader, people: Map<string, { name: string; initials: string }>, me: string | null): Promise<GrantsChecklist> {
  const lists = await read.all('checklists', 'id, title, created_at', { eq: { title: CHECKLIST_TITLE }, order: ['created_at', 'id'] });
  if (lists.length === 0) return { title: CHECKLIST_TITLE, steps: [] };
  const id = lists[0].id;
  const tasks = await read.all('tasks', 'id, title, note, due_on, status, assignee_group, position', { eq: { checklist_id: id, archived: false }, order: ['id'] });
  const ids = tasks.map((t) => t.id);
  const parts = await Promise.all(chunk(ids, 100).map((c) => read.all('task_assignees', 'task_id, user_id', { in: { task_id: c }, order: ['task_id', 'user_id'] })));
  return { title: CHECKLIST_TITLE, steps: mapSteps(tasks, parts.flat(), people, me) };
}

// A failed read, tagged with its table, so the server log can say which read failed (table and error code only).
class ReadFailed extends Error {
  constructor(
    readonly table: string,
    readonly code: string,
  ) {
    super(`read failed: ${table}`);
  }
}

// The database's error code ("42501"), or "unknown"; never the message (it can quote row data).
function codeOf(e: unknown): string {
  const c = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof c === 'string' && /^[\w.-]{1,40}$/.test(c) ? c : 'unknown';
}

// The reader with each failure tagged by table.
function tagged(read: GrantsReader): GrantsReader {
  return {
    me: read.me,
    all: (table, select, o) =>
      read.all(table, select, o).catch((e: unknown) => {
        throw e instanceof ReadFailed ? e : new ReadFailed(table, codeOf(e));
      }),
  };
}

// One server log line per caught failure: which part, the table, the code. No row data, no names.
function logFail(part: 'core' | 'checklist', e: unknown): void {
  const f = e instanceof ReadFailed ? e : null;
  console.error(`[grants] ${part} read failed`, { table: f?.table ?? 'unknown', code: f?.code ?? codeOf(e) });
}

/** Reads the real tables and returns the Grants view (loadFailed when a core read throws). `now` is for tests. */
export async function loadLiveGrantsView(reader: GrantsReader, now = new Date()): Promise<GrantsResult> {
  const instant = now.toISOString();
  const today = easternDay(instant);
  const read = tagged(reader);
  try {
    const [me, rows, profileRows] = await Promise.all([
      read.me().catch(() => null),
      read.all('grants', GRANT_COLS, { order: ['id'] }),
      read.all('staff_profiles', 'user_id, display_name, initials', { order: ['user_id'] }),
    ]);
    const people = mapPeople(profileRows);
    // The checklist is optional: a failure marks only its panel (null), never the page.
    const checklist = await readChecklist(read, people, me).catch((e: unknown) => {
      logFail('checklist', e);
      return null;
    });
    const grants = mapGrants(rows, people, me);
    return {
      failed: false,
      today,
      now: instant,
      grants,
      counts: stageCounts(grants),
      checklist,
      // The phone's Finance tabs draw no count in live mode (the shell's sidebar carries the real counts).
      budgetCount: null,
      loadFailed: false,
      caps: LIVE_CAPS,
    };
  } catch (e) {
    logFail('core', e);
    return { ...failedView(today, instant), failed: false };
  }
}
