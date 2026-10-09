// Outreach > Newsletter: the next issue's sections, the email preview and the facts strip. MOCK today (see
// lib/outreach.ts). ?demo=error draws the "didn't load" state, ?demo=stress the stress data. Reviewers don't see it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AreaLoadError } from '@/components/area/parts';
import { NewsletterView } from '@/components/outreach/newsletter-view';
import { loadNewsletter } from '@/lib/outreach';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Newsletter' };

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  if (user.role === 'reviewer') notFound();
  const data = await loadNewsletter({ demo });
  return (
    <div className="ar-fill ar-stack ar-tall">
      {data.failed ? <AreaLoadError title="Newsletter" what="Newsletter" /> : <NewsletterView data={data} />}
    </div>
  );
}
