// Scholarships > Awardees: who won and the five follow-up steps (awards and steps are mock until the Ops Hub tables
// exist). ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { AwardeesView } from '@/components/awardees-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadAwardees } from '@/lib/awardees';

export const metadata: Metadata = { title: 'Awardees' };

export default async function AwardeesPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadAwardees({ forceError: demo === 'error', stress: demo === 'stress' });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Awardees" />
        <LoadError what="Awardees" />
      </>
    );
  }
  return <AwardeesView data={data} />;
}
