// Today: what needs the signed-in person (Ops Hub refresh, signed off 2026-11-11; demo p-today-states). The server reads
// the page's data in one shape (lib/today-view-loader.ts: mock sample without Supabase env, the real tables with it) and
// hands it to the client board (components/today/today-board.tsx), which owns everything the person does on the page.
// It sits in its own route group, (today), so its loading skeleton (loading.tsx beside it) covers "/" only.
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { TodayBoard } from '@/components/today/today-board';
import { TodaySkeleton } from '@/components/today/today-skeleton';
import { loadTodayView } from '@/lib/today-view-loader';
import { requireStaff } from '@/lib/user';

// Server Actions run under the page that calls them, so their time limit is set here (Next.js: maxDuration at the page
// level). Vercel's btx-ops project has Fluid compute on, which allows 300.
export const maxDuration = 300;

// The page.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the loading skeleton (the same one app/(shell)/(today)/loading.tsx shows).
  if (!live && demo === 'loading') return <TodaySkeleton />;
  const view = await loadTodayView({ demo });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Today" />
        <div className="o-todayerr">
          <LoadError what="Today" />
        </div>
      </>
    );
  }
  const user = await requireStaff();
  return (
    <TodayBoard
      // A new board when the demo state changes or the tasks go from failed to loaded ("Try again"); other refreshes
      // are taken in by the board itself.
      key={`${demo ?? 'normal'}:${view.tasksFailed ? 'failed' : 'ok'}`}
      view={view}
      live={live}
      me={{ id: user.id, initials: user.initials }}
    />
  );
}
