// Tasks: every task the board shares, on Mine / Team / Approvals (Ops Hub refresh; demo p-tasks). The server reads the
// page's data in one shape (lib/tasks-view-loader.ts: the demo's sample day without Supabase env, the real tables with
// it) and hands it to the client board (components/tasks/tasks-page.tsx), which owns everything the person does here.
// It sits in its own route group, (tasks), with its loading skeleton (loading.tsx beside it).
//
// Flags: `?tab=team|approvals` picks the starting tab. Mock mode only: `?demo=stress|empty|error|failed|loading|request`.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { TasksBoard } from '@/components/tasks/tasks-page';
import { loadTasksView } from '@/lib/tasks-view-loader';
import { startTab } from '@/lib/tasks-time';

export const metadata: Metadata = { title: 'Tasks' };

// The page.
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ demo?: string; tab?: string }> }) {
  const { demo, tab } = await searchParams;
  const live = hasSupabaseEnv();
  const view = await loadTasksView({ demo });
  // The whole page failed (?demo=failed in mock mode, or no signed-in staff member): the plain "didn't load" card.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Tasks" />
        <div className="o-todayerr">
          <LoadError what="Tasks" />
        </div>
      </>
    );
  }
  return (
    <TasksBoard
      // A new board when the demo state changes or the list goes from failed to loaded ("Try again"); other refreshes
      // are taken in by the board itself.
      key={`${demo ?? 'normal'}:${view.tasksFailed ? 'failed' : 'ok'}`}
      view={view}
      live={live}
      startTab={startTab(tab)}
      tasksFailed={view.tasksFailed}
      // Mock mode only: ?demo=loading draws the page with its list as grey rows (the demo's loading state).
      loading={!live && demo === 'loading'}
    />
  );
}
