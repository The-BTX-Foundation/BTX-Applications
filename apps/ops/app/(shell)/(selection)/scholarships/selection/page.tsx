// Scholarships > Selection: the ranking by combined score and the board's decisions (Ops Hub refresh; demo p-selection).
// The server reads the page's data in one shape (lib/selection-view-loader.ts: the mock sample without Supabase env, the
// real tables with it) and hands it to the client board (components/selection/selection-board.tsx). It sits in its own
// route group, (selection), with its loading skeleton.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { SelectionBoard } from '@/components/selection/selection-board';
import { SelectionSkeleton, SlHead } from '@/components/selection/selection-skeleton';
import { loadSelectionView } from '@/lib/selection-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Selection' };

// Server Actions run under the page that calls them, so their time limit is set here. releaseAndNotify pauses between
// decision emails (about 550 ms each), so a large cycle needs minutes; a cut-off between an email's claim and its send
// would leave that applicant without an email. Same value as the Today and Interviews pages.
export const maxDuration = 300;

// The page.
export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <SelectionSkeleton />;
  const view = await loadSelectionView({ demo, role: user.role });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf sl">
        <SlHead />
        <LoadError what="Selection" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <SelectionBoard key={demo ?? 'normal'} view={view} live={live} />;
}
