// Goals: this year's goal cards, scholars funded per award cycle, and the year-over-year table. Mock data for now.
// ?demo=error draws the "didn't load" state, ?demo=stress the stress data.
import type { Metadata } from 'next';
import { GoalsView } from '@/components/goals/goals-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadGoals } from '@/lib/goals';
import '@/components/goals/goals.css';

export const metadata: Metadata = { title: 'Goals' };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadGoals({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Goals" />
        <div className="gl-err">
          <LoadError what="Goals" />
        </div>
      </>
    );
  }
  return <GoalsView data={data} />;
}
