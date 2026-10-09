// Programs > Certifications: the pilot plan, the setup checklist, the ideas and the Programs chat. MOCK today (see
// lib/programs.ts). ?demo=error draws the "didn't load" state, ?demo=stress the stress data. Reviewers don't see it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AreaChatPanel } from '@/components/area/area-chat';
import { AreaLoadError } from '@/components/area/parts';
import { CertView } from '@/components/programs/cert-view';
import { loadCertifications } from '@/lib/programs';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Certifications' };

export default async function CertificationsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  if (user.role === 'reviewer') notFound();
  const data = await loadCertifications({ demo });
  return (
    <div className="o-cy ar-fill">
      <div className="o-cy-main ar-main">
        {data.failed ? (
          <AreaLoadError title="Certification program" phoneTitle="Certifications" what="Certifications" />
        ) : (
          <CertView data={data} />
        )}
      </div>
      {data.failed ? null : <AreaChatPanel chat={data.chat} composerLabel="Message Programs" />}
    </div>
  );
}
