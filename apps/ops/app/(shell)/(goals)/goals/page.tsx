// Goals: this year's goals, scholars funded per award cycle, and year over year (Ops Hub refresh 2026-11-11; demo p-goals).
// The server reads the page's data in one shape (lib/goals-view-loader.ts: mock sample without Supabase env, the real
// tables with it) and hands it to the client board (components/goals/goals-board.tsx), which owns the year picker and the
// figure entry. It sits in its own route group, (goals), with its loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { GoalsBoard } from '@/components/goals/goals-board';
import { GoalsSkeleton } from '@/components/goals/goals-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { goalsNews, moneyUp } from '@/lib/goals-map';
import { loadGoalsView } from '@/lib/goals-view-loader';
import { GOALS_VIEW } from '@/mock/goals-view';

export const metadata: Metadata = { title: 'Goals' };

// The page.
export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton with the sample's year and news card, as the demo does.
  if (!live && demo === 'loading') {
    const news = goalsNews(GOALS_VIEW.goals);
    return (
      <GoalsSkeleton
        head={{
          year: GOALS_VIEW.year,
          showPicker: GOALS_VIEW.years.length > 1,
          news: news ? { kicker: `${moneyUp(news.left)} to go, by Dec 31`, title: news.title } : null,
        }}
      />
    );
  }
  const view = await loadGoalsView({ demo });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Goals" />
        <div className="gl-err">
          <LoadError what="Goals" />
        </div>
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <GoalsBoard key={demo ?? 'normal'} view={view} live={live} />;
}
