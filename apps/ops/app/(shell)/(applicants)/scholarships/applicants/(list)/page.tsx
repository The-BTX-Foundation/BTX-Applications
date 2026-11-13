// Scholarships > Applicants (Ops Hub refresh 2026-11-12; demo p-applicants). The server reads the page's data in one
// shape (lib/applicants-view-loader.ts: the mock sample without Supabase env, the real tables with it, as the signed-in
// person so row-level security applies) and hands it to the client board (components/applicants/applicants-board.tsx).
// Every staff member sees names (D2). Read-only: nothing here writes, emails or sends.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { ApplicantsBoard } from '@/components/applicants/applicants-board';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadApplicantsView } from '@/lib/applicants-view-loader';
import { requireStaff } from '@/lib/user';
import { APPLICANTS_VIEW } from '@/mock/applicants-view';

export const metadata: Metadata = { title: 'Applicants' };

// The page.
export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, me] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the real header and strip over grey rows, as the demo does.
  if (!live && demo === 'loading') return <ApplicantsBoard view={APPLICANTS_VIEW} live={false} loading />;
  const view = await loadApplicantsView({ demo, viewer: { id: me.id, admin: me.role === 'admin' } });
  // A failed read (or ?demo=failed in mock mode): the plain "didn't load" card under the title, never an empty list.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Applicants" />
        <LoadError what="Applicants" />
      </>
    );
  }
  return <ApplicantsBoard key={demo ?? 'normal'} view={view} live={live} />;
}
