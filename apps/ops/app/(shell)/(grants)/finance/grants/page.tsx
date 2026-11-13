// Finance > Grants (Ops Hub refresh 2026-11-12; demo p-grants). The server reads the page's data in one shape
// (lib/grants-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it to the client
// board (components/grants/grants-board.tsx). It sits in its own route group, (grants), with its loading skeleton
// (loading.tsx beside it). Live mode writes nothing: money writes stay off (lib/grants-map.ts LIVE_CAPS).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { GrantsBoard } from '@/components/grants/grants-board';
import { GrantsSkeleton } from '@/components/grants/grants-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadGrantsView } from '@/lib/grants-view-loader';
import { requireStaff } from '@/lib/user';
import { GRANTS_VIEW } from '@/mock/grants-view';

export const metadata: Metadata = { title: 'Grants' };

// The page.
export default async function GrantsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton (with the sample's Budget count on the phone tabs), as the demo does.
  if (!live && demo === 'loading') return <GrantsSkeleton budgetCount={GRANTS_VIEW.budgetCount} />;
  const view = await loadGrantsView({ demo });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Grants" />
        <LoadError what="Grants" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <GrantsBoard key={demo ?? 'normal'} view={view} live={live} />;
}
