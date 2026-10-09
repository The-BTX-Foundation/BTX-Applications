// Scholarships > Selection: the ranking and the meeting agenda (scores, awards and the meeting are mock until the Ops Hub
// tables exist). ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { SelectionView } from '@/components/selection-view';
import { loadSelection } from '@/lib/selection';

export const metadata: Metadata = { title: 'Selection' };

export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadSelection({ forceError: demo === 'error', stress: demo === 'stress' });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Selection" />
        <LoadError what="Selection" />
      </>
    );
  }
  return <SelectionView data={data} />;
}
