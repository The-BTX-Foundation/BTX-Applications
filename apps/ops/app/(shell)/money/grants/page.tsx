// Money > Grants. Mock data until the Ops Hub tables exist (lib/grants.ts). ?demo=stress / ?demo=error as on
// the other Money pages; in mock mode ?as=board|reviewer shows the page as that role.
import type { Metadata } from 'next';
import { GrantsView } from '@/components/money/grants-view';
import { MoneyNoAccess } from '@/components/money/no-access';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadGrants } from '@/lib/grants';
import { canUseMoney, mockRole } from '@/lib/money-shared';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Grants' };

export default async function GrantsPage({ searchParams }: { searchParams: Promise<{ demo?: string; as?: string }> }) {
  const { demo, as } = await searchParams;
  const user = await requireStaff();
  const role = user.mock ? mockRole(as, user.role) : user.role;
  if (!canUseMoney(role)) return <MoneyNoAccess title="Grants" />;
  const data = await loadGrants({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Grants" />
        <div className="mn-errwrap">
          <LoadError what="Grants" />
        </div>
      </>
    );
  }
  return <GrantsView data={data} demo={demo} role={role} />;
}
