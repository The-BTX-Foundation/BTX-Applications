// Calendar: interviews, meetings, due dates, posts and the cycle's dates on one month (Ops Hub refresh, 2026-11-11; demo
// p-calendar). The server reads the page's data in one shape (lib/calendar-view-loader.ts: the demo's sample without
// Supabase env, the real tables with it) and hands it to the client board (components/calendar/calendar-board.tsx), which
// owns everything the person does on the page. It sits in its own route group, (calendar), so its loading skeleton
// (loading.tsx beside it) covers /calendar only.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { CalendarBoard } from '@/components/calendar/calendar-board';
import { CalendarSkeleton } from '@/components/calendar/calendar-skeleton';
import { loadCalendarView } from '@/lib/calendar-view-loader';

export const metadata: Metadata = { title: 'Calendar' };

// The page.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the loading skeleton (the same one loading.tsx shows).
  if (!live && demo === 'loading') return <CalendarSkeleton />;
  const view = await loadCalendarView({ demo });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Calendar" />
        <LoadError what="Calendar" />
      </>
    );
  }
  // A new board when the demo state changes or the calendar goes from failed to loaded ("Try again"); other refreshes
  // (after a live add) are taken in by the board itself.
  return <CalendarBoard key={`${demo ?? 'normal'}:${view.itemsFailed ? 'failed' : 'ok'}`} view={view} live={live} />;
}
