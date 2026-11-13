// Shown at once while one interview's data loads (Next.js loading file for /scholarships/interviews/[slot]).
import { InterviewPageSkeleton } from '@/components/interview-page/interview-page-skeleton';

// The skeleton.
export default function InterviewLoading() {
  return <InterviewPageSkeleton />;
}
