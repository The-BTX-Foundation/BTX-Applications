// Scholarships > Interviews > Your availability: a board member says when they are free for interviews (Figma page
// "Options: interview flow"). Open to every board member. ?demo=empty|sent|nodates|error draw the other states, mock only.
import type { Metadata } from 'next';
import { AvailabilityView } from '@/components/availability-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadAvailability } from '@/lib/availability';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Your availability' };

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  await requireStaff();
  const data = await loadAvailability({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Your availability" />
        <LoadError what="Your availability" />
      </>
    );
  }
  if (data.noDates) {
    return (
      <>
        <PageHeader title="Your availability" />
        <p className="o-card" style={{ padding: 20, fontSize: 15 }}>
          The interview dates aren&apos;t set yet.
        </p>
      </>
    );
  }
  return <AvailabilityView data={data} />;
}
