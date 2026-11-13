// Outreach > Plan (Ops Hub refresh 2026-11-12; demo p-outreach-plan): what needs the person, this month on a line over its
// list, the channels, and next month's list with "Plan a post or issue". The server reads the page's data in one shape
// (lib/oplan-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it to the client
// board (components/oplan/oplan-board.tsx). It sits in its own route group, (oplan), with its loading skeleton beside it.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { OplanBoard } from '@/components/oplan/oplan-board';
import { OplanSkeleton } from '@/components/oplan/oplan-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadOplanView } from '@/lib/oplan-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Plan' };

// The page.
export default async function OutreachPlanPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, staff] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <OplanSkeleton />;
  const view = await loadOplanView({ demo, me: staff.id });
  // The whole page failed: the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Outreach" />
        <LoadError what="Outreach plan" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <OplanBoard key={demo ?? 'normal'} view={view} live={live} failSave={!live && demo === 'failsave'} />;
}
