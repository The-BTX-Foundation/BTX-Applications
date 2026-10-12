// Money > Budget and the phone approval screen: the data. Types mirror the draft Ops Hub schema (budget_years,
// budget_categories, budget_quarter_plans, budget_quarter_plan_lines, spending_entries, funds_snapshots, tasks,
// task_comments; the view budget_category_totals).
// MOCK (mock/money.ts): everything in mock mode, including ?demo=stress. LIVE: reads the Ops Hub tables.
import { hasSupabaseEnv } from '@btx/data';
import { BUDGET_MOCK, BUDGET_STRESS } from '@/mock/money';
import { timeLabel } from './format';
import { quarterSpent } from './money-logic';
import type { BudgetData, BudgetStep, PlanStatus } from './money-shared';

export { totals } from './money-shared';
import { profiles, read, type Row } from './money-db';

const FAILED: BudgetData = { ...BUDGET_MOCK, failed: true, mode: 'mock', me: 'dm', year: 2026 };


// Loads the Budget page's data. `demo` is the ?demo= value: "error" returns the failed shape, "stress" the stress sample.
export async function loadBudget({ demo, me = 'dm' }: { demo?: string; me?: string } = {}): Promise<BudgetData> {
  if (demo === 'error') return FAILED;
  const mock: BudgetData = { ...(demo === 'stress' ? BUDGET_STRESS : BUDGET_MOCK), failed: false, mode: 'mock', me: 'dm', year: 2026 };
  if (!hasSupabaseEnv()) return mock;
  try {
    const years = await read('budget_years', 'year', { order: ['year', false], limit: 1 });
    const year = years[0] ? Number(years[0].year) : new Date().getFullYear();
    const [cats, spend, allSpend, plans, funds, people] = await Promise.all([
      read('budget_category_totals', 'category_id, name, kind, budget_cents, spent_cents, q4_plan_cents', { eq: { year }, order: ['position', true] }),
      read('spending_entries', 'id, spent_on, description, amount_cents, category_id, budget_categories(name)', { order: ['spent_on', false], limit: 5 }),
      read('spending_entries', 'spent_on, amount_cents'),
      read('budget_quarter_plans', 'id, year, quarter, status, note, decline_note, submitted_by, decided_by, decided_at', { eq: { year, quarter: 4 }, limit: 1 }),
      read('funds_snapshots', 'amount_cents, as_of, recorded_by', { order: ['as_of', false], limit: 1 }),
      profiles(),
    ]);
    const p = plans[0];
    const f = funds[0];

    // The plan's checklist (checklists.budget_plan_id) and its steps; the approval step is the task of type "approval".
    let steps: BudgetStep[] = [];
    let approval: Row | undefined;
    let comments: BudgetData['comments'] = { count: 0, list: [] };
    if (p) {
      const lists = await read('checklists', 'id', { eq: { budget_plan_id: p.id }, limit: 1 });
      if (lists[0]) {
        const [tasks, assignees] = await Promise.all([
          read('tasks', 'id, title, due_on, status, type, assignee_group, position', { eq: { checklist_id: lists[0].id, archived: false }, order: ['position', true] }),
          read('task_assignees', 'task_id, user_id'),
        ]);
        approval = tasks.find((t) => t.type === 'approval');
        steps = tasks.map((t): BudgetStep => {
          const a = assignees.find((x) => x.task_id === t.id);
          const owner = a ? (people.get(String(a.user_id))?.name ?? '') : t.assignee_group === 'board' ? 'Board' : '';
          const kind = t.type === 'approval' ? 'approval' : 'step';
          return { id: String(t.id), title: String(t.title), owner, due_on: (t.due_on as string | null) ?? '', done: t.status === 'done', now: kind === 'approval' ? 'Approve' : String(t.title), kind };
        });
      }
      if (approval) {
        const rows = await read('task_comments', 'id, author_id, body, created_at', { eq: { task_id: approval.id }, order: ['created_at', true] });
        comments = {
          count: rows.length,
          list: rows.map((c) => {
            const who = people.get(String(c.author_id));
            return { id: String(c.id), name: who?.name ?? 'Someone', initials: who?.initials ?? '', time: timeLabel(String(c.created_at)), body: String(c.body) };
          }),
        };
      }
    }

    // The newest message in the Money chat channel (area channels are open to admin and board).
    let chat: BudgetData['chat'] = null;
    const channel = await read('chat_channels', 'id', { eq: { area: 'money' }, limit: 1 });
    if (channel[0]) {
      const m = (await read('chat_messages', 'author_id, is_bot, body, created_at', { eq: { channel_id: channel[0].id }, order: ['created_at', false], limit: 1 }))[0];
      if (m) {
        const who = people.get(String(m.author_id));
        chat = m.is_bot ? { name: 'BTX', initials: 'BT', time: timeLabel(String(m.created_at)), body: String(m.body) } : { name: who?.name ?? 'Someone', initials: who?.initials ?? '', time: timeLabel(String(m.created_at)), body: String(m.body) };
      }
    }

    return {
      mode: 'live',
      failed: false,
      me,
      year,
      q3_spent_cents: quarterSpent(allSpend, year, 3),
      categories: cats.map((c) => {
        const long = String(c.name);
        return { id: String(c.category_id), name: long, phone: long.replace(/\s*\(.*\)\s*$/, ''), short: long.replace(/\s*\(.*\)\s*$/, ''), budget_cents: Number(c.budget_cents), spent_cents: Number(c.spent_cents), q4_plan_cents: Number(c.q4_plan_cents ?? 0) };
      }),
      recent: spend.map((s) => ({
        id: String(s.id),
        spent_on: String(s.spent_on),
        description: String(s.description),
        category_id: String(s.category_id),
        category: String((s.budget_categories as { name?: string } | null)?.name ?? ''),
        amount_cents: Number(s.amount_cents),
      })),
      funds: f ? { cents: Number(f.amount_cents), as_of: String(f.as_of), by: people.get(String(f.recorded_by))?.name ?? '' } : { cents: 0, as_of: '', by: '' },
      plan: {
        // No Q4 plan yet: an empty draft (id ''), which the page shows without approval buttons.
        id: p ? String(p.id) : '',
        task_id: approval ? String(approval.id) : '',
        year,
        quarter: 4,
        status: p ? (p.status as PlanStatus) : 'draft',
        note: (p?.note as string | null) ?? null,
        decline_note: (p?.decline_note as string | null) ?? null,
        due_on: approval?.due_on ? String(approval.due_on) : '',
        submitter: people.get(String(p?.submitted_by))?.name ?? '',
        decided_by: (p?.decided_by as string | null) ?? null,
        decided_at: (p?.decided_at as string | null) ?? null,
      },
      steps,
      comments,
      chat,
    };
  } catch {
    return FAILED;
  }
}
