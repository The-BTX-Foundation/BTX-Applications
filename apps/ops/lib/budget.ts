// Money > Budget and the phone approval screen: the data. Types mirror the Ops Hub schema (budget_years,
// budget_categories, budget_quarter_plans, spending_entries, funds_snapshots, checklists + tasks + task_assignees,
// task_comments, chat_messages; the view budget_category_totals).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: everything is read from the tables as the
// signed-in person (tested against the local stack, 2026-10-12). With no Q4 plan yet, `plan` is null and the pages say so.
import { hasSupabaseEnv } from '@btx/data';
import { BUDGET_MOCK, BUDGET_STRESS } from '@/mock/money';
import { timeLabel } from './format';
import { shortCategory, spentInQuarter, type BudgetData, type BudgetStep, type PlanStatus } from './money-shared';

export { totals } from './money-shared';
import { checklistSteps, latestAreaMessage, profiles, read } from './money-db';

const FAILED: BudgetData = { ...BUDGET_MOCK, failed: true, mode: 'mock', me: 'dm', year: 2026 };

// Loads the Budget page's data. `demo` is the ?demo= value: "error" returns the failed shape, "stress" the stress sample.
export async function loadBudget({ demo, me = 'dm' }: { demo?: string; me?: string } = {}): Promise<BudgetData> {
  if (demo === 'error') return FAILED;
  const mock: BudgetData = { ...(demo === 'stress' ? BUDGET_STRESS : BUDGET_MOCK), failed: false, mode: 'mock', me: 'dm', year: 2026 };
  if (!hasSupabaseEnv()) return mock;
  try {
    // The budget year: this calendar year when it has a budget, else the latest one there is.
    const years = await read('budget_years', 'year', { order: ['year', false] });
    const thisYear = new Date().getFullYear();
    const year = years.some((y) => Number(y.year) === thisYear) ? thisYear : years.length ? Number(years[0].year) : thisYear;
    const [cats, spend, plans, funds, people, chat] = await Promise.all([
      read('budget_category_totals', 'category_id, name, kind, budget_cents, spent_cents, q4_plan_cents', { eq: { year }, order: ['position', true] }),
      read('spending_entries', 'id, spent_on, description, amount_cents, category_id, created_at, budget_categories!inner(name, year)', { eq: { 'budget_categories.year': year }, order: ['spent_on', false] }),
      read('budget_quarter_plans', 'id, year, quarter, status, note, decline_note, submitted_by, decided_by, decided_at', { eq: { year, quarter: 4 }, limit: 1 }),
      read('funds_snapshots', 'amount_cents, as_of, recorded_by, created_at', { order: ['as_of', false] }),
      profiles(),
      latestAreaMessage('money'),
    ]);
    const name = (id: unknown) => (id ? (people.get(String(id))?.name ?? null) : null);
    // Latest snapshot: the newest date, then the newest entry that day.
    const f = [...funds].sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)) || String(b.created_at).localeCompare(String(a.created_at)))[0];
    const recentRows = [...spend].sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const base: BudgetData = {
      failed: false,
      mode: 'live',
      me,
      year,
      q3_spent_cents: spentInQuarter(spend.map((x) => ({ spent_on: String(x.spent_on), amount_cents: Number(x.amount_cents) })), year, 3),
      funds: f ? { cents: Number(f.amount_cents), as_of: String(f.as_of), by: name(f.recorded_by) ?? 'Former member' } : null,
      categories: cats.map((c) => {
        const long = String(c.name);
        return { id: String(c.category_id), name: long, phone: shortCategory(long), short: shortCategory(long), budget_cents: Number(c.budget_cents), spent_cents: Number(c.spent_cents), q4_plan_cents: Number(c.q4_plan_cents ?? 0) };
      }),
      recent: recentRows.map((x) => ({
        id: String(x.id),
        spent_on: String(x.spent_on),
        description: String(x.description),
        category_id: String(x.category_id),
        category: shortCategory(String((x.budget_categories as { name?: string } | null)?.name ?? '')),
        amount_cents: Number(x.amount_cents),
      })),
      plan: null,
      steps: [],
      comments: { count: 0, list: [] },
      chat,
    };
    const p = plans[0];
    if (!p) return base;

    // The plan's checklist ("Q4 budget": checklists.budget_plan_id) and its approval step (the task of type 'approval').
    const lists = await read('checklists', 'id', { eq: { budget_plan_id: p.id }, limit: 1 });
    const rows = lists.length ? await checklistSteps(String(lists[0].id)) : [];
    const approval = rows.find((r) => r.type === 'approval');
    const steps: BudgetStep[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      owner: r.owner.kind === 'none' ? 'Unassigned' : r.owner.name,
      due_on: r.due_on,
      done: r.done,
      now: r.type === 'approval' ? 'Approve' : r.title,
      kind: r.type === 'approval' ? 'approval' : 'step',
    }));
    // A plan with no approval step still needs its Approve and Decline buttons: a step for the plan itself (no task).
    if (!approval) steps.push({ id: `plan-${String(p.id)}`, title: 'Approve Q4 budget', owner: 'Board', due_on: null, done: p.status === 'approved', now: 'Approve', kind: 'approval' });
    const comments = approval ? await read('task_comments', 'id, author_id, body, created_at', { eq: { task_id: approval.id }, order: ['created_at', true] }) : [];
    return {
      ...base,
      plan: {
        id: String(p.id),
        task_id: approval?.id ?? '',
        year,
        quarter: 4,
        status: p.status as PlanStatus,
        note: (p.note as string | null) ?? null,
        decline_note: (p.decline_note as string | null) ?? null,
        due_on: approval?.due_on ?? null,
        submitter: name(p.submitted_by) ?? 'the drafter',
        decided_by: (p.decided_by as string | null) ?? null,
        decided_at: (p.decided_at as string | null) ?? null,
        decided_by_name: name(p.decided_by),
      },
      steps,
      comments: {
        count: comments.length,
        list: comments.map((c) => {
          const who = people.get(String(c.author_id));
          return { id: String(c.id), name: who?.name ?? 'Former member', initials: who?.initials ?? '?', time: timeLabel(String(c.created_at)), body: String(c.body) };
        }),
      },
    };
  } catch {
    return FAILED;
  }
}
