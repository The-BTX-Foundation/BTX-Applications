// Programs > Sponsorships (Ops Hub refresh 2026-11-12; demo p-sponsorships): this year's sponsorships, "Log a sponsorship"
// in place with a money confirm, and how a sponsorship works. The server reads the page's data in one shape
// (lib/sponsorships-view-loader.ts: the mock sample without Supabase env, this year's `sponsorships` rows with it) and hands
// it to the client board (components/sponsorships/sponsorships-board.tsx), which owns the one live write, log_sponsorship.
// It sits in its own route group, (sponsorships), with its loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { SponsorshipsBoard } from '@/components/sponsorships/sponsorships-board';
import { ProgramsNav, SponsorsHead, SponsorshipsSkeleton } from '@/components/sponsorships/sponsorships-skeleton';
import { requireStaff } from '@/lib/user';
import { loadSponsorsView } from '@/lib/sponsorships-view-loader';

export const metadata: Metadata = { title: 'Sponsorships' };

// The page.
export default async function SponsorshipsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <SponsorshipsSkeleton />;
  const view = await loadSponsorsView({ demo }, live);
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf sz">
        <SponsorsHead />
        <ProgramsNav />
        <LoadError what="Sponsorships" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <SponsorshipsBoard key={demo ?? 'normal'} view={view} live={live} />;
}
