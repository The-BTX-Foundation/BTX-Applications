// Live mode: builds the Budget view (lib/budget-view.ts) from the real tables as the signed-in person. The reads go through a
// reader (lib/budget-db.ts: the session client, so row-level security applies; money rows are admin and board only), passed
// in so tests can stand in for the database (tests/budget-live.test.ts). The mapping is pure (lib/budget-map.ts).
//
// What a failed read does, so a failure never reads as a true number:
// - core reads (years, plan, categories, steps, comments, spending, funds, people): the header and the "Budget didn't load."
//   card, because "$0 spent" or "Leaves $8,500" from a failed read would be false;
// - the Finance chat (an extra): only the chat panel shows its error line.
// Every failed read is logged once on the server as `[budget] read failed {table, code}` (no message, no row data).
//
// Which plan the page draws:
// 1. /finance/budget/approval?plan=<budget_quarter_plans id>: that plan (its year, quarter, checklist and approval task all
//    come from the plan row and checklists.budget_plan_id, never from the link). Not found or not visible: "unavailable".
// 2. else the plan awaiting approval (the newest, if several);
// 3. else this Eastern quarter's plan when that row exists;
// 4. else no plan, drawn for this quarter (or the newest budget year's, lib/budget-map.ts fallbackQuarter).
// The plan amounts come from the plan's own quarter column (budget_category_totals q1..q4_plan_cents); a plan that is still a
// draft (or none) draws no plan amounts, because the view sums plan lines whatever the plan's status.
import type { ReadOpts, Row } from './daily-db';
import { addDays, easternDay } from './refresh-time';
import { chunks, fallbackQuarter, isPlanId, lineOrder, liveCaps, mapCategory, mapComment, mapFunds, mapMsg, mapPlan, mapSpend, mapStep, prevQuarter, quarterOf, quarterRange, sumByCategory, type People } from './budget-map';
import type { BudgetResult, BudgetView, BuMsg, BuStep } from './budget-view';

/** A read's options: daily-db's, plus `orders` (several sort columns, in order) for reads that must be stable. */
export type BuReadOpts = ReadOpts & { orders?: [string, boolean][] };

/** How live mode reads: `rows` is one request (for small or limited reads), `all` pages until every row is in. */
export type BudgetReader = {
  rows: (table: string, select: string, o?: BuReadOpts) => Promise<Row[]>;
  all: (table: string, select: string, o?: ReadOpts) => Promise<Row[]>;
};

/** How many spending rows the board draws (the rest are a count). */
export const SPEND_SHOWN = 5;

const PLAN_COLS = 'id, year, quarter, status, note, decline_note, submitted_by, decided_by, decided_at';

/** The view live mode shows when a core read fails: the header and the "Budget didn't load." card, nothing else. */
export function failedView(today: string): BudgetView {
  const year = Number(today.slice(0, 4));
  return {
    today,
    year,
    cats: [],
    lineOrder: [],
    plan: { id: '', taskId: '', quarter: quarterOf(today), status: 'none', due: null, from: null, declineNote: null, decidedBy: null, decidedAt: null },
    steps: [],
    comments: { count: 0, list: [] },
    spend: [],
    spendAll: { count: 0, cents: 0 },
    prevQuarterCents: 0,
    funds: null,
    chat: { failed: false, messages: [] },
    loadFailed: true,
    caps: liveCaps(),
  };
}

// The error's code for the log (the database's code, else the error's name), never its message.
function codeOf(e: unknown): string | null {
  if (e && typeof e === 'object') {
    const c = (e as { code?: unknown }).code;
    if (typeof c === 'string' && c) return c;
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string' && n) return n;
  }
  return null;
}

/** The reader with every failed read logged once (table and code only), then thrown on to the loader. */
export function logged(r: BudgetReader): BudgetReader {
  // Wraps one read function: a failure is logged, then re-thrown.
  function wrap<O>(f: (t: string, s: string, o?: O) => Promise<Row[]>) {
    return async (table: string, select: string, o?: O) => {
      try {
        return await f(table, select, o);
      } catch (e) {
        console.error('[budget] read failed', { table, code: codeOf(e) });
        throw e;
      }
    };
  }
  return { rows: wrap(r.rows), all: wrap(r.all) };
}

// Spending rows of one quarter (every row, paged), newest first.
function quarterSpend(r: BudgetReader, year: number, q: number, select: string): Promise<Row[]> {
  const { from, to } = quarterRange(year, q);
  return r.all('spending_entries', select, { gte: { spent_on: from }, lte: { spent_on: addDays(to, -1) }, order: ['spent_on', false] });
}

// The Finance chat's newest message (the area channel "money", unique by area; never a direct message). Throws on failure.
async function financeChat(r: BudgetReader, people: People, me: string): Promise<BuMsg[]> {
  const ch = await r.rows('chat_channels', 'id', { eq: { area: 'money' }, limit: 1 });
  if (!ch[0]) return [];
  const m = await r.rows('chat_messages', 'id, author_id, is_bot, body, created_at', { eq: { channel_id: ch[0].id }, orders: [['created_at', false], ['id', false]], limit: 1 });
  return m.map((x) => mapMsg(x, people, me));
}

type PlanPick = { kind: 'plan'; row: Row } | { kind: 'none'; year: number; quarter: number } | { kind: 'unavailable' };

// Which plan to draw (see the top of this file). Throws when a read fails.
async function pickPlan(r: BudgetReader, today: string, planId: string | undefined): Promise<PlanPick> {
  if (planId !== undefined) {
    if (!isPlanId(planId)) return { kind: 'unavailable' };
    const rows = await r.rows('budget_quarter_plans', PLAN_COLS, { eq: { id: planId }, limit: 1 });
    return rows[0] ? { kind: 'plan', row: rows[0] } : { kind: 'unavailable' };
  }
  const waiting = await r.rows('budget_quarter_plans', PLAN_COLS, { eq: { status: 'awaiting_approval' }, orders: [['year', false], ['quarter', false], ['id', true]], limit: 1 });
  if (waiting[0]) return { kind: 'plan', row: waiting[0] };
  const year = Number(today.slice(0, 4));
  const quarter = quarterOf(today);
  const current = await r.rows('budget_quarter_plans', PLAN_COLS, { eq: { year, quarter }, limit: 1 });
  if (current[0]) return { kind: 'plan', row: current[0] };
  const years = await r.rows('budget_years', 'year', { orders: [['year', false]] });
  const fb = fallbackQuarter(today, years.map((y) => Number(y.year)));
  // This year has no budget yet (January, say): the newest budget year's quarter, with its plan when one exists.
  if (fb.year !== year || fb.quarter !== quarter) {
    const other = await r.rows('budget_quarter_plans', PLAN_COLS, { eq: { year: fb.year, quarter: fb.quarter }, limit: 1 });
    if (other[0]) return { kind: 'plan', row: other[0] };
  }
  return { kind: 'none', ...fb };
}

/**
 * Reads everything both Budget routes draw. `me` is the signed-in person's id (requireStaff), `now` the instant the page is
 * built for (tests pass one), `planId` the approval page's ?plan= (undefined on the board and the bare approval page).
 */
export async function loadLiveBudgetView(reader: BudgetReader, me: string, now: string = new Date().toISOString(), planId?: string): Promise<BudgetResult> {
  const r = logged(reader);
  const today = easternDay(now);
  let core: Omit<BudgetView, 'chat'> & { people: People };
  try {
    const pick = await pickPlan(r, today, planId);
    if (pick.kind === 'unavailable') return { failed: true, unavailable: true };
    const p = pick.kind === 'plan' ? pick.row : undefined;
    const year = pick.kind === 'plan' ? Number(pick.row.year) : pick.year;
    const q = pick.kind === 'plan' ? Number(pick.row.quarter) : pick.quarter;
    const prev = prevQuarter(year, q);
    const [catRows, fundRows, profileRows, spendRows, prevRows] = await Promise.all([
      // A handful of categories per year: one request.
      r.rows('budget_category_totals', 'category_id, name, kind, budget_cents, spent_cents, q1_plan_cents, q2_plan_cents, q3_plan_cents, q4_plan_cents', { eq: { year }, orders: [['position', true], ['category_id', true]] }),
      // The newest snapshot, ties broken so the same row always wins.
      r.rows('funds_snapshots', 'id, amount_cents, as_of, recorded_by, created_at', { orders: [['as_of', false], ['created_at', false], ['id', false]], limit: 1 }),
      r.rows('staff_profiles', 'user_id, display_name, initials'),
      quarterSpend(r, year, q, 'id, spent_on, description, amount_cents, category_id, budget_categories(name)'),
      quarterSpend(r, prev.year, prev.q, 'id, amount_cents'),
    ]);
    const people: People = new Map(profileRows.map((x) => [String(x.user_id), { name: String(x.display_name ?? ''), initials: String(x.initials ?? '') }]));
    const allSpend = spendRows.map(mapSpend);
    // A draft (or no) plan draws no plan amounts.
    const planned = !!p && p.status !== 'draft';
    const cats = catRows.map((c) => mapCategory(c, sumByCategory(allSpend), q, planned));

    // The plan's checklist (checklists.budget_plan_id), its steps, their owners and the approval step's comments.
    let steps: BuStep[] = [];
    let commentRows: Row[] = [];
    if (p) {
      const lists = await r.rows('checklists', 'id', { eq: { budget_plan_id: p.id }, orders: [['position', true], ['created_at', true], ['id', true]], limit: 1 });
      if (lists[0]) {
        const tasks = await r.all('tasks', 'id, title, due_on, status, type, assignee_group, position, completed_at', { eq: { checklist_id: lists[0].id, archived: false }, order: ['position', true] });
        // Owners only for these tasks, 100 ids per request (a step has one or two owners, far under the 1,000-row cap),
        // sorted by task, then person, so the owner drawn is the same on every load.
        const ids = tasks.map((t) => String(t.id));
        const owners = new Map<string, string>();
        for (const part of chunks(ids)) {
          for (const a of await r.rows('task_assignees', 'task_id, user_id', { in: { task_id: part }, orders: [['task_id', true], ['user_id', true]] })) {
            if (!owners.has(String(a.task_id))) owners.set(String(a.task_id), String(a.user_id));
          }
        }
        steps = tasks.map((t) => mapStep(t, owners.get(String(t.id)), people, me));
      }
      const approval = steps.find((s) => s.approval);
      if (approval) {
        commentRows = await r.all('task_comments', 'id, author_id, body, created_at', { eq: { task_id: approval.id }, order: ['created_at', true] });
      }
    }
    const approval = steps.find((s) => s.approval);
    const plan = mapPlan(p, approval, steps, people, me, q);
    // The approval step was done when the plan was decided.
    if (approval && plan.decidedAt) steps = steps.map((s) => (s.approval ? { ...s, doneOn: easternDay(plan.decidedAt as string) } : s));
    const prevQuarterCents = prevRows.reduce((a, x) => a + Number(x.amount_cents ?? 0), 0);
    core = {
      today,
      year,
      cats,
      lineOrder: lineOrder(cats),
      plan,
      steps,
      comments: { count: commentRows.length, list: commentRows.map((c) => mapComment(c, people, me)) },
      // Only the rows the board draws go to the browser; the count and sum cover every row.
      spend: allSpend.slice(0, SPEND_SHOWN),
      spendAll: { count: allSpend.length, cents: allSpend.reduce((a, x) => a + x.cents, 0) },
      prevQuarterCents,
      funds: mapFunds(fundRows[0], people, me),
      loadFailed: false,
      caps: liveCaps(),
      people,
    };
  } catch {
    return { ...failedView(today), failed: false };
  }

  // The chat is an extra: its failure marks only its own panel.
  let chat: BudgetView['chat'];
  try {
    chat = { failed: false, messages: await financeChat(r, core.people, me) };
  } catch {
    chat = { failed: true, messages: [] };
  }
  const { people: _people, ...view } = core;
  void _people;
  return { ...view, chat, failed: false };
}
