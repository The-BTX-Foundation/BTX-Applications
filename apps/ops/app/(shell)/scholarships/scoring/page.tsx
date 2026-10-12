// Scholarships > Scoring: the signed-in scorer's queue and scorecard (live: lib/scoring.ts; mock mode: mock/scores.ts). ?demo=error draws the "didn't load" state and ?demo=stress the stress frame's data, in mock mode only.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { PhoneBar } from '@/components/sch-parts';
import { ScoringView } from '@/components/scoring-view';
import { loadScoring } from '@/lib/scoring';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Scoring' };

export default async function ScoringPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const [data, user] = await Promise.all([loadScoring({ forceError: demo === 'error', stress: demo === 'stress' }), requireStaff()]);
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
  return <ScoringView data={data} initials={user.mock ? undefined : user.initials} />;
}
