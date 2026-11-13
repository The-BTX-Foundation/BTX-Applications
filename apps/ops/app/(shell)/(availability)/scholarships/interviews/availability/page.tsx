// Scholarships > Interviews > Your availability (Ops Hub refresh 2026-11-12; demo p-availability). The server reads the
// page's data in one shape (lib/availability-view-loader.ts: the mock sample without Supabase env, the signed-in board
// member's own rows with it) and hands it to the client board (components/availability/availability-board.tsx). It sits
// in its own route group, (availability), with its loading skeleton beside it. Live mode keeps the current page's writes
// exactly: Send calls saveAvailability, "Fill in my times" calls readTypedAvailability; nothing else writes.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { AvailabilityBoard } from '@/components/availability/availability-board';
import { AvailabilitySkeleton } from '@/components/availability/availability-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadAvailabilityView } from '@/lib/availability-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Your availability' };

// The page.
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <AvailabilitySkeleton />;
  const view = await loadAvailabilityView({ demo, user: { id: user.id, initials: user.initials } });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Your availability" />
        <LoadError what="Your availability" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <AvailabilityBoard key={demo ?? 'normal'} view={view} live={live} />;
}
