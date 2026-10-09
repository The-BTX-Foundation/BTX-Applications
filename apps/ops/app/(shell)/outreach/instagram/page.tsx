// Outreach > Instagram: the posts by month and the selected post's checklist. MOCK today (see lib/outreach.ts).
// ?demo=error draws the "didn't load" state, ?demo=stress the stress data. Reviewers don't see it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AreaLoadError } from '@/components/area/parts';
import { InstagramView } from '@/components/outreach/instagram-view';
import { loadInstagram } from '@/lib/outreach';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Instagram' };

export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  if (user.role === 'reviewer') notFound();
  const data = await loadInstagram({ demo });
  return (
    <div className="ar-fill ar-stack ar-tall">
      {data.failed ? <AreaLoadError title="Instagram" what="Instagram" /> : <InstagramView data={data} />}
    </div>
  );
}
