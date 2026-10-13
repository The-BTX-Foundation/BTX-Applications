// Scholarships > Selection: the ranking and the meeting agenda (live: lib/selection.ts; mock mode: mock/selection.ts). ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { SelectionView } from '@/components/selection-view';
import { loadSelection } from '@/lib/selection';
import { requireStaff } from '@/lib/user';

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
  // Only a board member with admin rights gets the "Release decisions" button (the server action checks it again).
  const user = await requireStaff();
  return <SelectionView data={data} isAdmin={user.role === 'admin'} />;
}
