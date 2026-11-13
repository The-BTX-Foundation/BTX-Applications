// Finance > Fundraising (Ops Hub refresh 2026-11-12; demo p-fundraising): this year's giving against the goal, the newest
// gifts and the "Year-end giving" checklist. The server reads the page's data in one shape (lib/fundraising-view-loader.ts:
// the mock sample without Supabase env, the real tables with it, as the signed-in person so row-level security applies)
// and hands it to the client board (components/fundraising/fundraising-board.tsx). It sits in its own route group,
// (fundraising), with its loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { FundraisingBoard } from '@/components/fundraising/fundraising-board';
import { FundraisingSkeleton } from '@/components/fundraising/fundraising-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadFundraisingView } from '@/lib/fundraising-view-loader';
import { requireStaff } from '@/lib/user';
import { FUNDRAISING_VIEW } from '@/mock/fundraising-view';

export const metadata: Metadata = { title: 'Fundraising' };

// The page.
export default async function FundraisingPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const user = await requireStaff();
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, with the sample's count on the phone's Budget tab.
  if (!live && demo === 'loading') return <FundraisingSkeleton budgetCount={FUNDRAISING_VIEW.budgetCount} />;
  const view = await loadFundraisingView({ demo, me: user.id });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Fundraising" />
        <LoadError what="Fundraising" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <FundraisingBoard key={demo ?? 'normal'} view={view} live={live} />;
}
