// Money > Grants. Mock data until the Ops Hub tables exist (lib/grants.ts). ?demo=stress / ?demo=error as on
// the other Money pages.
import type { Metadata } from 'next';
import { GrantsView } from '@/components/money/grants-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadGrants } from '@/lib/grants';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Grants' };

export default async function GrantsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  await requireStaff();
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
  return <GrantsView data={data} demo={demo} />;
}
