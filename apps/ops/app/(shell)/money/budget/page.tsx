// Money > Budget. Mock data until the Ops Hub tables exist (lib/budget.ts). ?demo=stress draws the stress sample, ?demo=error
// the "didn't load" state.
import type { Metadata } from 'next';
import { BudgetView } from '@/components/money/budget-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadBudget } from '@/lib/budget';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Budget' };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const user = await requireStaff();
  const data = await loadBudget({ demo, me: user.id });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Budget" />
        <div className="mn-errwrap">
          <LoadError what="Budget" />
        </div>
      </>
    );
  }
  return <BudgetView data={data} demo={demo} />;
}
