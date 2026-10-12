// Scholarships > Applicants: the submitted applications of the published cycle (live: blind for board members and
// reviewers, names for admins). In mock mode ?demo=error draws the "didn't load" state for design review.
import type { Metadata } from 'next';
import { ApplicantsBoard } from '@/components/applicants-board';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadApplicants } from '@/lib/applicants';

export const metadata: Metadata = { title: 'Applicants' };

// Loads the rows on the server (as the signed-in person, so row-level security applies) and draws the screen.
export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadApplicants({ forceError: demo === 'error' });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Applicants" />
        <LoadError what="Applicants" />
      </>
    );
  }
  return <ApplicantsBoard cycleLabel={data.cycleLabel} rows={data.rows} cycleSub={data.cycleSub} canExport={data.canExport} showNames={data.showNames} />;
}
