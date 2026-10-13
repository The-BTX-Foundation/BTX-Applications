// Tasks: every open task on the board, grouped by when it is due, with the selected task's details beside it. Mock
// data until the Ops Hub tables exist (lib/tasks.ts). ?demo=stress draws the long-text sample, ?demo=error the
// "didn't load" state, ?tab=team|approvals picks the starting tab.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { TasksBoard, type Tab } from '@/components/tasks/tasks-board';
import { loadTasks } from '@/lib/tasks';
import '@/components/tasks/tasks.css';

export const metadata: Metadata = { title: 'Tasks' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ demo?: string; tab?: string }> }) {
  const { demo, tab } = await searchParams;
  const data = await loadTasks({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Tasks" />
        <div className="tk2-errwrap">
          <LoadError what="Tasks" />
        </div>
      </>
    );
  }
  const start: Tab = tab === 'team' || tab === 'approvals' ? tab : 'mine';
  return <TasksBoard data={data} startTab={start} />;
}
