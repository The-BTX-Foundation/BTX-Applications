// Live mode: builds the Fundraising view (lib/fundraising-view.ts) from the real tables as the signed-in person. The reads
// go through a reader (lib/fundraising-db.ts: the session client, so row-level security applies), passed in so tests can
// stand in for the database (tests/fundraising-live.test.ts). The mapping is pure (lib/fundraising-map.ts).
//
// What a failed read does, so a failure never reads as a true number:
// - core reads (gifts, the goal, the donor names of the newest gifts): the page shows its "Fundraising didn't load." card,
//   because "$0 raised" from a failed read would be false;
// - the "Year-end giving" checklist (optional): only that panel shows its load-error line.
// Gifts are paged (every year, because "new this year" needs the older gifts; PostgREST stops at 1,000 rows silently).
import type { ReadOpts, Row } from './daily-db';
import { giftFigures, mapGifts, mapSteps, newestGifts } from './fundraising-map';
import { easternDay } from './refresh-time';
import type { FrCaps, FrChecklist, FundraisingResult, FundraisingView } from './fundraising-view';

/** How live mode reads: `rows` is one request (for small reads), `all` pages until every row is in. */
export type FrReader = {
  rows: (table: string, select: string, o?: ReadOpts) => Promise<Row[]>;
  /** `then` adds tie-break columns after `o.order` (ascending), so a key over two columns pages in a stable order. */
  all: (table: string, select: string, o?: ReadOpts, then?: string[]) => Promise<Row[]>;
};

/** The checklist this page shows (found by its title, as the current page does). */
export const CHECKLIST_TITLE = 'Year-end giving';

/** How many ids one `in (...)` read asks for. */
export const ID_CHUNK = 100;

/**
 * Live mode's controls: none. Logging a gift stays "Coming soon" (owner, 2026-10-12: money writes stay off; the multi-step
 * writer in lib/money-writes.ts has no rollback); ticking a checklist step and the Board chat nudge are not wired here.
 */
export function liveCaps(): FrCaps {
  return { logGift: false, giftUndo: false, tick: false, nudge: false };
}

// Splits ids into chunks of ID_CHUNK (one `in (...)` with every id could pass the URL limit).
function chunks<T>(ids: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(ids.slice(i, i + ID_CHUNK));
  return out;
}

// Reads `select` from `table` for every id in `ids` (column `col`), chunked and paged in the order of the table's unique key
// (`order`, then `then`); any part failing fails the read.
async function byIds(read: FrReader, table: string, select: string, col: string, ids: string[], order: string, then?: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const parts = await Promise.all(chunks(ids).map((c) => read.all(table, select, { in: { [col]: c }, order: [order, true] }, then)));
  return parts.flat();
}

/** The "Year-end giving" steps: the checklist, its tasks, their assignees and those people's names. Throws on any failure. */
export async function readChecklist(read: FrReader): Promise<FrChecklist> {
  const lists = await read.rows('checklists', 'id, title', { eq: { title: CHECKLIST_TITLE }, order: ['id', true], limit: 1 });
  if (lists.length === 0) return { title: CHECKLIST_TITLE, steps: [] };
  const id = String(lists[0].id);
  const tasks = await read.all('tasks', 'id, title, note, due_on, status, assignee_group, position', { eq: { checklist_id: id, archived: false }, order: ['id', true] });
  const assignees = await byIds(read, 'task_assignees', 'task_id, user_id', 'task_id', tasks.map((t) => String(t.id)), 'task_id', ['user_id']);
  const userIds = [...new Set(assignees.map((a) => String(a.user_id)))];
  const profiles = await byIds(read, 'staff_profiles', 'user_id, display_name, initials', 'user_id', userIds, 'user_id');
  return { title: String(lists[0].title ?? CHECKLIST_TITLE), steps: mapSteps(tasks, assignees, profiles) };
}

/** The view live mode shows when a core read fails: the header and the "didn't load" card, nothing else. */
export function failedView(today: string, me: string): FundraisingView {
  const year = Number(today.slice(0, 4));
  return {
    today,
    year,
    me,
    goalCents: null,
    raisedCents: 0,
    q3Cents: 0,
    donors: 0,
    newDonors: 0,
    monthlyDonors: 0,
    avgCents: 0,
    sources: [],
    recent: [],
    checklist: null,
    budgetCount: null,
    loadFailed: true,
    caps: liveCaps(),
  };
}

/** Reads the real tables and returns the Fundraising view (loadFailed when a core read throws). `now` is for tests. */
export async function loadLiveFundraisingView(read: FrReader, me: string, now = new Date()): Promise<FundraisingResult> {
  const today = easternDay(now.toISOString());
  const year = Number(today.slice(0, 4));
  try {
    // The checklist is optional: its failure becomes null (that panel's error line), never the page's.
    const listP = readChecklist(read).catch(() => null);
    const [gifts, goals] = await Promise.all([
      read.all('gifts', 'id, gift_on, created_at, amount_cents, source, monthly, donor_id', { order: ['id', true] }),
      // Every money goal of the year (a handful at most); the first by position, then id, as the Goals page picks it.
      read.rows('goals', 'id, position, target_cents', { eq: { year, metric: 'money_raised' }, order: ['position', true] }),
    ]);
    const newest = newestGifts(gifts, 5);
    // Names only for the donors of the gifts on screen.
    const donorIds = [...new Set(newest.map((g) => g.donor_id).filter(Boolean).map(String))];
    const donors = await byIds(read, 'donors', 'id, name', 'id', donorIds, 'id');
    const names = new Map(donors.map((d) => [String(d.id), String(d.name ?? '')]));
    const goal = [...goals].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id)))[0];
    const target = goal?.target_cents;
    return {
      today,
      year,
      me,
      goalCents: target == null ? null : Number(target),
      ...giftFigures(gifts, year),
      recent: mapGifts(newest, names),
      checklist: await listP,
      // The phone's Finance tabs draw no count in live mode (the shell's sidebar carries the real counts).
      budgetCount: null,
      loadFailed: false,
      caps: liveCaps(),
      failed: false,
    };
  } catch {
    return { ...failedView(today, me), failed: false };
  }
}
