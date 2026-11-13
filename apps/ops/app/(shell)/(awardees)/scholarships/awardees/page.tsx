// Scholarships > Awardees: the current term's awardees and their five steps, and past awardees by term (Ops Hub refresh;
// demo p-awardees). The server reads the page's data in one shape (lib/awardees-view-loader.ts: the mock sample without
// Supabase env, the real tables with it) and hands it to the client board (components/awardees/awardees-board.tsx). It
// sits in its own route group, (awardees), with its loading skeleton.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { AwardeesBoard } from '@/components/awardees/awardees-board';
import { AwardeesSkeleton, AwHead } from '@/components/awardees/awardees-skeleton';
import { loadAwardeesView } from '@/lib/awardees-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Awardees' };

// The page.
export default async function AwardeesPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <AwardeesSkeleton />;
  const view = await loadAwardeesView({ demo, role: user.role });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf aw">
        <AwHead />
        <LoadError what="Awardees" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <AwardeesBoard key={demo ?? 'normal'} view={view} live={live} />;
}
