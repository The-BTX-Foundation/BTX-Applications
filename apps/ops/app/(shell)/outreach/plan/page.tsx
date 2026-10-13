// Outreach > Plan: the four channels and the month's items. Data comes from lib/outreach.ts. ?demo=error draws the
// "didn't load" state, ?demo=stress the stress data.
import type { Metadata } from 'next';
import { AreaLoadError } from '@/components/area/parts';
import { PlanView } from '@/components/outreach/plan-view';
import { loadPlan } from '@/lib/outreach';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Plan' };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }] = await Promise.all([searchParams, requireStaff()]);
  const data = await loadPlan({ demo });
  return (
    <div className="ar-fill ar-stack ar-tall">
      {data.failed ? <AreaLoadError title="Outreach plan" what="Outreach plan" /> : <PlanView data={data} />}
    </div>
  );
}
