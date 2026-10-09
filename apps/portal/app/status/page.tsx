// The status page after submitting. `?demo=1` draws the draft's sample in mock mode.
import type { Metadata } from 'next';
import { ApplyLoadError } from '@/components/load-error-pages';
import { StatusView } from '@/components/status-view';
import { loadSubmitted } from '@/lib/apply';
import { MOCK_VIEW } from '@/lib/cycle';
import { easternDate } from '@/lib/format';
import { STRESS } from '@/lib/stress';

export const metadata: Metadata = { title: 'Application submitted' };

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadSubmitted(demo);
  if (d && d.failed) return <ApplyLoadError status />;
  // mock mode: the draft's sample (Ebony Coleman, submitted Sat Sep 12 at 4:52 PM Eastern)
  if (!d) {
    const stress = demo === 'stress';
    return (
      <StatusView
        view={MOCK_VIEW}
        accountName={stress ? STRESS.name : 'Ebony Coleman'}
        email={stress ? STRESS.email : 'ecoleman@terpmail.umd.edu'}
        submittedAt="2026-09-12T20:52:00Z"
        today="2026-09-13"
      />
    );
  }
  return (
    <StatusView
      view={d.view}
      accountName={d.application.full_name || 'Your account'}
      email={d.application.terpmail}
      code={d.application.applicant_code ?? undefined}
      submittedAt={d.application.submitted_at ?? d.application.updated_at}
      today={easternDate(new Date())}
    />
  );
}
