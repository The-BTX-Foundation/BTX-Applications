// Programs > Certifications (Ops Hub refresh 2026-11-12; demo p-certifications): the program's status and next step, the
// pilot plan, the setup checklist with the ideas for the call, and the Programs chat. The server reads the page's data in
// one shape (lib/cert-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it to the
// client board (components/certifications/cert-board.tsx). It sits in its own route group, (certifications), with its
// loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { CertBoard } from '@/components/certifications/cert-board';
import { CertSkeleton } from '@/components/certifications/cert-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadCertView } from '@/lib/cert-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Certifications' };

// The page.
export default async function CertificationsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, staff] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <CertSkeleton />;
  const view = await loadCertView({ demo, who: { id: staff.id, role: staff.role } });
  // The whole page failed: the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Certifications" />
        <LoadError what="Certifications" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <CertBoard key={demo ?? 'normal'} view={view} live={live} failSave={!live && demo === 'failsave'} />;
}
