// Programs > Sponsorships: this year's one-off sponsorships and how one works, with "Log a sponsorship".
// Data comes from lib/programs.ts. ?demo=error draws the "didn't load" state, ?demo=stress the stress data.
import type { Metadata } from 'next';
import { AreaLoadError } from '@/components/area/parts';
import { SponsorshipsView } from '@/components/programs/sponsorships-view';
import { loadSponsorships } from '@/lib/programs';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Sponsorships' };

export default async function SponsorshipsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }] = await Promise.all([searchParams, requireStaff()]);
  const data = await loadSponsorships({ demo });
  return (
    <div className="ar-fill ar-stack">
      {data.failed ? <AreaLoadError title="Sponsorships" what="Sponsorships" /> : <SponsorshipsView data={data} />}
    </div>
  );
}
