// Scholarships > Interviews: interview times, fairness, booked interviews and the interviewer pairs.
// In mock mode only: ?demo=error draws the "didn't load" state, ?demo=stress the stress frame's data, and ?demo=waiting,
// proposed (default), sent, fair or board the stages of the interview flow.
import type { Metadata } from 'next';
import { InterviewsView } from '@/components/interviews-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadInterviews, loadVideoLinks } from '@/lib/interviews';

export const metadata: Metadata = { title: 'Interviews' };

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadInterviews({ forceError: demo === 'error', stress: demo === 'stress', demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Interviews" />
        <LoadError what="Interviews" />
      </>
    );
  }
  // Admins add the video links here (the student and both interviewers get them by email).
  const videoLinks = data.isAdmin ? await loadVideoLinks() : undefined;
  return <InterviewsView data={data} videoLinks={videoLinks} />;
}
