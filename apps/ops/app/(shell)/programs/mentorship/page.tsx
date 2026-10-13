// Programs > Mentorship: the "Where it stands" checklist of the planned mentorship program.
// Data comes from lib/programs.ts. ?demo=error draws the "didn't load" state, ?demo=stress the stress data.
import type { Metadata } from 'next';
import { AreaLoadError } from '@/components/area/parts';
import { MentorshipView } from '@/components/programs/mentorship-view';
import { loadMentorship } from '@/lib/programs';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Mentorship' };

export default async function MentorshipPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }] = await Promise.all([searchParams, requireStaff()]);
  const data = await loadMentorship({ demo });
  return (
    <div className="ar-fill ar-stack">
      {data.failed ? <AreaLoadError title="Mentorship program" what="Mentorship program" /> : <MentorshipView data={data} />}
    </div>
  );
}
