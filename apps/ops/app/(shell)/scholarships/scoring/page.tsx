// Scholarships > Scoring: the signed-in scorer's queue and scorecard (finished interviews are real, scores and notes are
// mock). ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { PhoneBar } from '@/components/sch-parts';
import { ScoringView } from '@/components/scoring-view';
import { loadScoring } from '@/lib/scoring';

export const metadata: Metadata = { title: 'Scoring' };

export default async function ScoringPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const data = await loadScoring({ forceError: demo === 'error', stress: demo === 'stress' });
  if (data.failed) {
    return (
      <>
        <div className="o-lg">
          <PageHeader title="Scoring" />
        </div>
        <PhoneBar title="Scoring" />
        <LoadError what="This scorecard" />
      </>
    );
  }
  return <ScoringView data={data} />;
}
