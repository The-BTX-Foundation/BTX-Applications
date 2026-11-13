// Shown at once while the Goals data loads (Next.js loading file for /goals): the title and the grey goal rows.
import { GoalsSkeleton } from '@/components/goals/goals-skeleton';

// The skeleton.
export default function GoalsLoading() {
  return <GoalsSkeleton />;
}
