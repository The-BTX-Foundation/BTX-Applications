// Shown at once while the Interview questions data loads (Next.js loading file for /scholarships/interviews/questions):
// the title blocks and the grey groups and ticket.
import { QuestionsSkeleton } from '@/components/questions/questions-skeleton';

// The skeleton.
export default function InterviewQuestionsLoading() {
  return <QuestionsSkeleton />;
}
