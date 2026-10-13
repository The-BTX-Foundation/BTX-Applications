// Money > Fundraising. Mock data until the Ops Hub tables exist (lib/fundraising.ts). ?demo=stress / ?demo=error as on
// the other Money pages.
import type { Metadata } from 'next';
import { FundraisingView } from '@/components/money/fundraising-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadFundraising } from '@/lib/fundraising';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Fundraising' };

export default async function FundraisingPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  await requireStaff();
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
  return <FundraisingView data={data} demo={demo} />;
}
