// Finance > Budget (Ops Hub refresh 2026-11-12; demo p-budget): the quarter's plan and its approval, the year by category,
// the quarter's spending, funds on hand and the finance chat. The server reads the page's data in one shape
// (lib/budget-view-loader.ts: the mock sample without Supabase env, the real tables with it, as the signed-in person so
// row-level security applies; money stays admin + board) and hands it to the client board (components/budget/budget-board.tsx).
// It sits in its own route group, (budget), with its loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { BudgetBoard } from '@/components/budget/budget-board';
import { BudgetSkeleton } from '@/components/budget/budget-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadBudgetView } from '@/lib/budget-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Budget' };

// The page.
export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const user = await requireStaff();
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <BudgetSkeleton />;
  const view = await loadBudgetView({ demo, me: user.id });
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
  return <BudgetBoard key={demo ?? 'normal'} view={view} live={live} mode="page" demo={demo} />;
}
