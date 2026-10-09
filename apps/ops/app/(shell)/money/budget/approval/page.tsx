// The phone's approval screen for the Q4 budget (Today's "Approve Q4 budget" row opens it). Same data as Budget.
// ?demo=stress / ?demo=error as on the other Money pages.
import type { Metadata } from 'next';
import { ApprovalTop, ApprovalView } from '@/components/money/approval-view';
import { MoneyNoAccess } from '@/components/money/no-access';
import { LoadError } from '@/components/load-error';
import { loadBudget } from '@/lib/budget';
import { canUseMoney, mockRole } from '@/lib/money-shared';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Approval' };

export default async function ApprovalPage({ searchParams }: { searchParams: Promise<{ demo?: string; as?: string }> }) {
  const { demo, as } = await searchParams;
  const user = await requireStaff();
  const role = user.mock ? mockRole(as, user.role) : user.role;
  if (!canUseMoney(role)) return <MoneyNoAccess title="Approval" />;
  const data = await loadBudget({ demo, me: user.id });
  if (data.failed) {
    return (
      <div className="mn-ap">
        <ApprovalTop initials={user.initials} />
        <div className="mn-ap-body">
          <div className="mn-errwrap">
            <LoadError what="This approval" />
          </div>
        </div>
      </div>
    );
  }
  return <ApprovalView data={data} demo={demo} role={role} initials={user.initials} />;
}
