// The full application (Ops Hub refresh 2026-11-12; demo p-applicants, its `#/APP-...` view). Staff only (requireStaff),
// read as the signed-in person so row-level security applies (applications_select_staff, application_files_select_staff).
// An unknown code, a malformed one, or one the reader may not see answers a real 404: a one-row lookup runs before
// anything streams (there is no loading boundary above this page), then the rest loads under its own skeleton. No blind
// review (D2): every staff member sees the name, contact details and every answer. The PDFs open through ./file/<kind>.
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { ApplicantDetail } from '@/components/applicants/applicant-detail';
import { ApplicantDetailSkeleton } from '@/components/applicants/applicants-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import type { ApViewer } from '@/lib/applicants-live';
import { applicantExists, loadApplicantView } from '@/lib/applicants-view-loader';
import { requireStaff } from '@/lib/user';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ demo?: string }> };

// The code from the URL, or null when it is malformed (a stray "%").
function codeOf(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// The tab title is the code (never the name).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = codeOf((await params).code);
  return { title: code ?? 'Application' };
}

// Everything past the lookup, drawn under the skeleton.
async function Detail({ code, demo, viewer }: { code: string; demo?: string; viewer: ApViewer }) {
  const view = await loadApplicantView({ code, demo, viewer });
  if (view.failed) {
    return (
      <>
        <PageHeader title="Application" />
        <LoadError what="The application" />
      </>
    );
  }
  if (view.missing) notFound();
  return <ApplicantDetail view={view} />;
}

// The page.
export default async function ApplicationPage({ params, searchParams }: Props) {
  const [{ code: raw }, { demo }, me] = await Promise.all([params, searchParams, requireStaff()]);
  const code = codeOf(raw);
  if (code === null || !(await applicantExists(code))) notFound();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!hasSupabaseEnv() && demo === 'loading') return <ApplicantDetailSkeleton />;
  return (
    <Suspense fallback={<ApplicantDetailSkeleton />}>
      <Detail code={code} demo={demo} viewer={{ id: me.id, admin: me.role === 'admin' }} />
    </Suspense>
  );
}
