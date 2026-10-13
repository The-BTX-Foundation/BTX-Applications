// Scholarships > Interviews > Interview questions: the cycle's questions by scoring criterion. Every board member reads;
// board members with admin rights edit. In mock mode only: ?demo=error draws the "didn't load" state, ?demo=empty the
// empty state and ?demo=board the read-only view.
import type { Metadata } from 'next';
import { QuestionsView } from '@/components/interviews/questions-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadQuestions } from '@/lib/interview-questions';

export const metadata: Metadata = { title: 'Interview questions' };

export default async function InterviewQuestionsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadQuestions({ forceError: demo === 'error', demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Interview questions" />
        <LoadError what="The interview questions" />
      </>
    );
  }
  return <QuestionsView data={data} />;
}
