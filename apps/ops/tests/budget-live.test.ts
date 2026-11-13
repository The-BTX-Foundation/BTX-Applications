// Live Budget loading (lib/budget-live.ts) against a stand-in reader: which plan is drawn (?plan=, awaiting approval, this
// quarter, the newest budget year), a failed core read is the page's load error (never "$0 spent") and is logged with its
// table and code only, a failed chat read marks only the chat, owner ids are read 100 at a time, `limit 1` reads are
// ordered, only five spending rows leave the server, a draft plan draws no plan amounts, every cap is off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '@/lib/daily-db';
import { loadLiveBudgetView, type BudgetReader, type BuReadOpts } from '@/lib/budget-live';
import type { BudgetView } from '@/lib/budget-view';

const NOW = '2026-11-10T15:00:00Z';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const TABLES: Record<string, Row[]> = {
  budget_years: [{ year: 2026 }],
  budget_category_totals: [
    { category_id: 'c1', year: 2026, name: 'Scholarships', budget_cents: 250_000, spent_cents: 0, q2_plan_cents: 10_000, q4_plan_cents: 250_000 },
    { category_id: 'c2', year: 2026, name: 'Operations (website)', budget_cents: 120_000, spent_cents: 86_000, q4_plan_cents: 34_000 },
  ],
  budget_quarter_plans: [{ id: P1, year: 2026, quarter: 4, status: 'awaiting_approval', submitted_by: 'u1' }],
  funds_snapshots: [{ id: 'f1', amount_cents: 1_860_000, as_of: '2026-11-09', recorded_by: 'me' }],
  staff_profiles: [{ user_id: 'u1', display_name: 'Keith Dawson', initials: 'KD' }, { user_id: 'me', display_name: 'Dana Mercer', initials: 'DM' }],
  spending_entries: [{ id: 's1', spent_on: '2026-11-02', description: 'Domain', amount_cents: 2_000, category_id: 'c2', budget_categories: { name: 'Operations' } }],
  checklists: [{ id: 'cl1', budget_plan_id: P1 }],
  tasks: [
    { id: 't1', title: 'Draft the Q4 plan', status: 'done', position: 1, completed_at: '2026-11-08T15:00:00Z' },
    { id: 't2', title: 'Approve the Q4 budget', status: 'open', type: 'approval', position: 2, due_on: '2026-11-13' },
  ],
  task_assignees: [{ task_id: 't1', user_id: 'u1' }, { task_id: 't2', user_id: 'me' }],
  task_comments: [{ id: 'k1', author_id: 'u1', body: 'Looks right.', created_at: '2026-11-10T13:02:00Z' }],
  chat_channels: [{ id: 'ch1' }],
  chat_messages: [{ id: 'm1', author_id: 'u1', body: 'Hi', created_at: '2026-11-10T14:20:00Z' }],
};

type Call = { kind: 'rows' | 'all'; table: string; o?: BuReadOpts };

// Compares two cell values for sorting (ascending).
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  return String(a) < String(b) ? -1 : 1;
}

// A reader over TABLES that logs every call. It applies `eq` to rows that have the column (so the plan picks and the
// categories' year filter work), sorts by `orders` and honours `limit`. `fail` lists tables whose read throws (with a code),
// `override` replaces a table's rows.
function reader(fail: string[] = [], override: Record<string, Row[]> = {}) {
  const calls: Call[] = [];
  const get = (kind: Call['kind']) => async (table: string, _s: string, o?: BuReadOpts) => {
    calls.push({ kind, table, o });
    if (fail.includes(table)) throw Object.assign(new Error(`secret detail about ${table}`), { code: 'PGRST301' });
    const rows = (override[table] ?? TABLES[table] ?? []).filter((x) => Object.entries(o?.eq ?? {}).every(([c, v]) => !(c in x) || x[c] === v));
    const by = o?.orders ?? [];
    rows.sort((a, b) => {
      for (const [c, asc] of by) {
        const d = cmp(a[c], b[c]);
        if (d) return asc ? d : -d;
      }
      return 0;
    });
    return o?.limit ? rows.slice(0, o.limit) : rows;
  };
  const r: BudgetReader = { rows: get('rows'), all: get('all') };
  return { r, calls };
}

// Loads and fails the test on a whole-page failure.
async function load(r: BudgetReader, now = NOW, plan?: string): Promise<BudgetView> {
  const v = await loadLiveBudgetView(r, 'me', now, plan);
  if (v.failed) throw new Error('failed');
  return v;
}

describe('loadLiveBudgetView', () => {
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    err = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => err.mockRestore());

  it('builds the page from every read, with every write off', async () => {
    const { r, calls } = reader();
    const v = await load(r);
    expect(v.loadFailed).toBe(false);
    expect([v.today, v.year, v.cats.length, v.plan.status, v.plan.quarter, v.plan.taskId, v.plan.from?.first]).toEqual(['2026-11-10', 2026, 2, 'waiting', 4, 't2', 'Keith']);
    expect(v.cats[1]).toMatchObject({ name: 'Operations', sub: 'website', quarterSpentCents: 2_000, planCents: 34_000 });
    expect(v.steps.map((s) => [s.done, s.approval, s.who.kind])).toEqual([[true, false, 'person'], [false, true, 'person']]);
    expect(v.comments.count).toBe(1);
    expect(v.funds?.cents).toBe(1_860_000);
    expect(v.chat).toMatchObject({ failed: false, messages: [{ id: 'm1' }] });
    expect(Object.values(v.caps).every((c) => c === false)).toBe(true);
    // Growing reads are paged ("all"), never a single capped read.
    for (const t of ['spending_entries', 'tasks', 'task_comments']) expect(calls.filter((c) => c.table === t).every((c) => c.kind === 'all')).toBe(true);
    // Q4 spending is read inside the quarter, Oct 1 to Dec 31.
    expect(calls.find((c) => c.table === 'spending_entries')?.o).toMatchObject({ gte: { spent_on: '2026-10-01' }, lte: { spent_on: '2026-12-31' } });
    expect(err).not.toHaveBeenCalled();
  });

  it('every limit-1 read is ordered to a unique row; owners are picked in a fixed order', async () => {
    const { r, calls } = reader();
    await load(r);
    expect(calls.find((c) => c.table === 'funds_snapshots')?.o?.orders).toEqual([['as_of', false], ['created_at', false], ['id', false]]);
    expect(calls.find((c) => c.table === 'checklists')?.o).toMatchObject({ eq: { budget_plan_id: P1 }, orders: [['position', true], ['created_at', true], ['id', true]], limit: 1 });
    expect(calls.find((c) => c.table === 'task_assignees')?.o?.orders).toEqual([['task_id', true], ['user_id', true]]);
    expect(calls.find((c) => c.table === 'budget_quarter_plans')?.o).toMatchObject({ eq: { status: 'awaiting_approval' }, orders: [['year', false], ['quarter', false], ['id', true]], limit: 1 });
  });

  it.each(['budget_category_totals', 'budget_quarter_plans', 'funds_snapshots', 'staff_profiles', 'spending_entries', 'checklists', 'tasks', 'task_assignees', 'task_comments'])(
    'a failed %s read is the load error, never a zero, logged with table and code only',
    async (t) => {
      const { r } = reader([t]);
      const v = await load(r);
      expect(v.loadFailed).toBe(true);
      expect(v.cats).toEqual([]);
      expect(v.funds).toBeNull();
      expect(v.spendAll).toEqual({ count: 0, cents: 0 });
      // One log per failed read (spending is read twice: this quarter and the one before).
      expect(err).toHaveBeenCalledTimes(t === 'spending_entries' ? 2 : 1);
      for (const call of err.mock.calls) expect(call).toEqual(['[budget] read failed', { table: t, code: 'PGRST301' }]);
      expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
    },
  );
  it('a failed budget_years read (no plan found) is the load error', async () => {
    const { r } = reader(['budget_years'], { budget_quarter_plans: [] });
    expect((await load(r)).loadFailed).toBe(true);
    expect(err).toHaveBeenCalledWith('[budget] read failed', { table: 'budget_years', code: 'PGRST301' });
  });
  it('a failed chat read marks only the chat (and is logged)', async () => {
    const { r } = reader(['chat_messages']);
    const v = await load(r);
    expect(v.loadFailed).toBe(false);
    expect(v.chat).toEqual({ failed: true, messages: [] });
    expect(v.cats.length).toBe(2);
    expect(err).toHaveBeenCalledWith('[budget] read failed', { table: 'chat_messages', code: 'PGRST301' });
  });
  it('reads owners 100 task ids at a time', async () => {
    const tasks = Array.from({ length: 230 }, (_, i) => ({ id: `t${i}`, title: 'x', position: i }));
    const { r, calls } = reader([], { tasks });
    await load(r);
    const sizes = calls.filter((c) => c.table === 'task_assignees').map((c) => (c.o?.in?.task_id as unknown[]).length);
    expect(sizes).toEqual([100, 100, 30]);
  });
  it('no plan row: status "none" for this quarter, no checklist read, no plan amounts', async () => {
    const { r, calls } = reader([], { budget_quarter_plans: [] });
    const v = await load(r);
    expect([v.plan.status, v.year, v.plan.quarter]).toEqual(['none', 2026, 4]);
    expect(v.cats.every((c) => c.planCents === 0)).toBe(true);
    expect(calls.some((c) => c.table === 'checklists')).toBe(false);
  });
  it('a decided plan dates the approval step by the decision', async () => {
    const { r } = reader([], { budget_quarter_plans: [{ id: P1, year: 2026, quarter: 4, status: 'approved', decided_by: 'me', decided_at: '2026-11-09T16:00:00Z' }] });
    const v = await load(r);
    expect(v.steps.find((s) => s.approval)?.doneOn).toBe('2026-11-09');
    expect(v.plan.decidedBy).toEqual({ name: 'Dana Mercer', me: true });
  });
  it('a declined plan keeps its note; a draft plan draws no plan amounts (the view ignores status)', async () => {
    const declined = await load(reader([], { budget_quarter_plans: [{ id: P1, year: 2026, quarter: 4, status: 'declined', decline_note: 'Trim outreach' }] }).r);
    expect([declined.plan.status, declined.plan.declineNote, declined.cats[0].planCents]).toEqual(['declined', 'Trim outreach', 250_000]);
    const draft = await load(reader([], { budget_quarter_plans: [{ id: P1, year: 2026, quarter: 4, status: 'draft' }] }).r);
    expect(draft.plan.status).toBe('none');
    expect(draft.cats.map((c) => c.planCents)).toEqual([0, 0]);
  });
  it('sends only the five drawn spending rows, with the true count and sum', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, spent_on: '2026-11-02', description: 'x', amount_cents: 1_001, category_id: 'c2' }));
    const v = await load(reader([], { spending_entries: rows }).r);
    expect(v.spend.length).toBe(5);
    expect(v.spendAll).toEqual({ count: 7, cents: 7_007 });
    // The category sums still use every row.
    expect(v.cats[1].quarterSpentCents).toBe(7_007);
  });
});

describe('which plan the page draws', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('?plan=<id>: that plan, its own year and quarter (plan column, spending range, checklist)', async () => {
    const plans = [
      { id: P1, year: 2026, quarter: 4, status: 'awaiting_approval' },
      { id: P2, year: 2026, quarter: 2, status: 'approved' },
    ];
    const { r, calls } = reader([], { budget_quarter_plans: plans, checklists: [{ id: 'cl2', budget_plan_id: P2 }] });
    const v = await load(r, NOW, P2);
    expect([v.plan.id, v.plan.quarter, v.plan.status, v.cats[0].planCents]).toEqual([P2, 2, 'approved', 10_000]);
    expect(calls.find((c) => c.table === 'spending_entries')?.o).toMatchObject({ gte: { spent_on: '2026-04-01' }, lte: { spent_on: '2026-06-30' } });
    expect(calls.find((c) => c.table === 'checklists')?.o?.eq).toEqual({ budget_plan_id: P2 });
  });
  it('?plan= unknown or not visible: unavailable, never a different plan', async () => {
    const { r } = reader();
    expect(await loadLiveBudgetView(r, 'me', NOW, '33333333-3333-4333-8333-333333333333')).toEqual({ failed: true, unavailable: true });
  });
  it('?plan= that is not an id: unavailable without a read', async () => {
    const { r, calls } = reader();
    for (const bad of ['', 'abc', "1' or 1=1", `${P1},${P2}`]) expect(await loadLiveBudgetView(r, 'me', NOW, bad)).toEqual({ failed: true, unavailable: true });
    expect(calls).toEqual([]);
  });
  it('the bare page: the plan awaiting approval, even in an older year', async () => {
    const plans = [
      { id: P2, year: 2026, quarter: 4, status: 'approved' },
      { id: P1, year: 2025, quarter: 4, status: 'awaiting_approval' },
    ];
    const { r, calls } = reader([], { budget_quarter_plans: plans });
    const v = await load(r);
    expect([v.plan.id, v.year, v.plan.quarter, v.plan.status]).toEqual([P1, 2025, 4, 'waiting']);
    expect(calls.find((c) => c.table === 'budget_category_totals')?.o?.eq).toEqual({ year: 2025 });
  });
  it('a newer budget year exists: still this quarter of this year', async () => {
    const plans = [{ id: P1, year: 2026, quarter: 4, status: 'approved' }];
    const v = await load(reader([], { budget_quarter_plans: plans, budget_years: [{ year: 2027 }, { year: 2026 }] }).r);
    expect([v.plan.id, v.year, v.plan.quarter]).toEqual([P1, 2026, 4]);
    // With no plan for this quarter, still this year's quarter (not the newer year's).
    const none = await load(reader([], { budget_quarter_plans: [], budget_years: [{ year: 2027 }, { year: 2026 }] }).r);
    expect([none.plan.status, none.year, none.plan.quarter]).toEqual(['none', 2026, 4]);
  });
  it("January before the new year has a budget: the newest year's Q4 plan", async () => {
    const plans = [{ id: P1, year: 2026, quarter: 4, status: 'approved' }];
    const v = await load(reader([], { budget_quarter_plans: plans }).r, '2027-01-05T15:00:00Z');
    expect([v.plan.id, v.year, v.plan.quarter, v.today]).toEqual([P1, 2026, 4, '2027-01-05']);
  });
  it('January once the new year has a budget: Q1 of the new year, no plan yet', async () => {
    const plans = [{ id: P1, year: 2026, quarter: 4, status: 'approved' }];
    const v = await load(reader([], { budget_quarter_plans: plans, budget_years: [{ year: 2027 }, { year: 2026 }] }).r, '2027-01-05T15:00:00Z');
    expect([v.plan.status, v.year, v.plan.quarter]).toEqual(['none', 2027, 1]);
  });
});
