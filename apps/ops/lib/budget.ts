// Money > Budget and the phone approval screen: the data. Types mirror the draft Ops Hub schema (budget_years,
// budget_categories, budget_quarter_plans, budget_quarter_plan_lines, spending_entries, funds_snapshots, tasks,
// task_comments; the view budget_category_totals).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: the reads below are written but NOT TESTED:
// needs the Ops Hub tables (draft schema, not applied).
import { hasSupabaseEnv } from '@btx/data';
import { BUDGET_MOCK, BUDGET_STRESS } from '@/mock/money';
import type { BudgetData, PlanStatus } from './money-shared';

export { totals } from './money-shared';
import { profiles, read } from './money-db';

const FAILED: BudgetData = { ...BUDGET_MOCK, failed: true, mode: 'mock', me: 'dm', year: 2026 };


// Loads the Budget page's data. `demo` is the ?demo= value: "error" returns the failed shape, "stress" the stress sample.
export async function loadBudget({ demo, me = 'dm' }: { demo?: string; me?: string } = {}): Promise<BudgetData> {
  if (demo === 'error') return FAILED;
  const mock: BudgetData = { ...(demo === 'stress' ? BUDGET_STRESS : BUDGET_MOCK), failed: false, mode: 'mock', me: 'dm', year: 2026 };
  if (!hasSupabaseEnv()) return mock;
  try {
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    const year = 2026;
    const [cats, spend, plans, funds, people] = await Promise.all([
      read('budget_category_totals', 'category_id, name, kind, budget_cents, spent_cents, q4_plan_cents', { eq: { year }, order: ['position', true] }),
      read('spending_entries', 'id, spent_on, description, amount_cents, category_id, budget_categories(name)', { order: ['spent_on', false], limit: 5 }),
      read('budget_quarter_plans', 'id, year, quarter, status, note, decline_note, submitted_by, decided_by, decided_at', { eq: { year, quarter: 4 }, limit: 1 }),
      read('funds_snapshots', 'amount_cents, as_of, recorded_by', { order: ['as_of', false], limit: 1 }),
      profiles(),
    ]);
    if (plans.length === 0) return mock; // TODO (live): no Q4 plan yet; the page should then show a "Start the Q4 plan" state.
    const p = plans[0];
    const f = funds[0];
    const taskRows = await read('tasks', 'id, title, due_on, status, type, checklist_id', { eq: { type: 'approval' }, order: ['due_on', true], limit: 1 });
    const approval = taskRows[0];
    return {
      ...mock,
      mode: 'live',
      me,
      year,
      categories: cats.map((c) => {
        const long = String(c.name);
        return { id: String(c.category_id), name: long, phone: long, short: long.replace(/\s*\(.*\)\s*$/, ''), budget_cents: Number(c.budget_cents), spent_cents: Number(c.spent_cents), q4_plan_cents: Number(c.q4_plan_cents ?? 0) };
      }),
      recent: spend.map((s) => ({
        id: String(s.id),
        spent_on: String(s.spent_on),
        description: String(s.description),
        category_id: String(s.category_id),
        category: String((s.budget_categories as { name?: string } | null)?.name ?? ''),
        amount_cents: Number(s.amount_cents),
      })),
      funds: f ? { cents: Number(f.amount_cents), as_of: String(f.as_of), by: people.get(String(f.recorded_by))?.name ?? '' } : mock.funds,
      plan: {
        id: String(p.id),
        task_id: approval ? String(approval.id) : mock.plan.task_id,
        year,
        quarter: 4,
        status: p.status as PlanStatus,
        note: (p.note as string | null) ?? null,
        decline_note: (p.decline_note as string | null) ?? null,
        due_on: approval?.due_on ? String(approval.due_on) : mock.plan.due_on,
        submitter: people.get(String(p.submitted_by))?.name ?? mock.plan.submitter,
        decided_by: (p.decided_by as string | null) ?? null,
        decided_at: (p.decided_at as string | null) ?? null,
      },
      // TODO (live): the checklist steps (checklists.budget_plan_id -> tasks), the plan's comments (task_comments), the
      // Q3 closing figure and the Money chat message come from the mock's shapes until those reads are written.
    };
  } catch {
    return FAILED;
  }
}

