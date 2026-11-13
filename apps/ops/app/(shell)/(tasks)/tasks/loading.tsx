// Shown at once while Tasks' server data loads (Next.js loading file for /tasks): grey blocks shaped like the page.
import { TasksSkeleton } from '@/components/tasks/tasks-skeleton';

// The skeleton.
export default function TasksLoading() {
  return <TasksSkeleton />;
}
