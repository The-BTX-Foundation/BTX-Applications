// Scholarships > Interviews: booked interviews and the interviewer pairs (booked slots are real, pairs are mock).
// ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { InterviewsView } from '@/components/interviews-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadInterviews } from '@/lib/interviews';

export const metadata: Metadata = { title: 'Interviews' };

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadInterviews({ forceError: demo === 'error', stress: demo === 'stress' });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Interviews" />
        <LoadError what="Interviews" />
      </>
    );
  }
  return <InterviewsView data={data} />;
}
