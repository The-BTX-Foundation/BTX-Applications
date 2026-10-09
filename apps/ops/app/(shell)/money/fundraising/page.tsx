// Money > Fundraising. Mock data until the Ops Hub tables exist (lib/fundraising.ts). ?demo=stress / ?demo=error as on
// the other Money pages; in mock mode ?as=board|reviewer shows the page as that role.
import type { Metadata } from 'next';
import { FundraisingView } from '@/components/money/fundraising-view';
import { MoneyNoAccess } from '@/components/money/no-access';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadFundraising } from '@/lib/fundraising';
import { canUseMoney, mockRole } from '@/lib/money-shared';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Fundraising' };

export default async function FundraisingPage({ searchParams }: { searchParams: Promise<{ demo?: string; as?: string }> }) {
  const { demo, as } = await searchParams;
  const user = await requireStaff();
  const role = user.mock ? mockRole(as, user.role) : user.role;
  if (!canUseMoney(role)) return <MoneyNoAccess title="Fundraising" />;
  const data = await loadFundraising({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Fundraising" />
        <div className="mn-errwrap">
          <LoadError what="Fundraising" />
        </div>
      </>
    );
  }
  return <FundraisingView data={data} demo={demo} role={role} />;
}
