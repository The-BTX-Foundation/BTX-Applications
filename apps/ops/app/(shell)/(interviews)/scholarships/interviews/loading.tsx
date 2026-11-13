// Shown at once while the Interviews data loads (Next.js loading file for /scholarships/interviews): the title and the grey
// shapes of the gold card, the calendar and the two panels.
import { InterviewsSkeleton } from '@/components/interviews/interviews-skeleton';

// The skeleton.
export default function InterviewsLoading() {
  return <InterviewsSkeleton />;
}
