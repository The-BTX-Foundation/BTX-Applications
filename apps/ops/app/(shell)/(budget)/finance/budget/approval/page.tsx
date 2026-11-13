// Finance > Budget > Approval (Ops Hub refresh 2026-11-12; demo p-budget #/approval): the quarter's plan alone, phone first,
// with its approve and decline actions in reach. Same data as the Budget page (lib/budget-view-loader.ts); the client board
// draws it in approval mode. Money actions stay "Coming soon" in live mode until the money writes are turned on.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { BudgetBoard } from '@/components/budget/budget-board';
import { BudgetSkeleton } from '@/components/budget/budget-skeleton';
import { BudgetUnavailable } from '@/components/budget/budget-unavailable';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadBudgetView } from '@/lib/budget-view-loader';
import { easternDay } from '@/lib/refresh-time';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Approval' };

// The page. Link format: /finance/budget/approval?plan=<budget_quarter_plans id> opens that plan (its quarter, checklist and
// approval task come from the plan); the bare route opens the plan awaiting approval, else this quarter's.
export default async function BudgetApprovalPage({ searchParams }: { searchParams: Promise<{ demo?: string; plan?: string | string[] }> }) {
  const { demo, plan: rawPlan } = await searchParams;
  const user = await requireStaff();
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <BudgetSkeleton approval />;
  // A repeated ?plan= is not one plan: it is unavailable (an empty string is passed on and is unavailable too).
  const plan = Array.isArray(rawPlan) ? '' : rawPlan;
  const view = await loadBudgetView({ demo, me: user.id, plan });
  // The plan asked for does not exist or is not visible: one plain line, never a different plan.
  if (view.failed && view.unavailable) return <BudgetUnavailable today={easternDay(new Date().toISOString())} />;
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Budget" />
        <LoadError what="Budget" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <BudgetBoard key={demo ?? 'normal'} view={view} live={live} mode="approval" demo={demo} />;
}
