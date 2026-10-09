// Outreach > Plan: the four channels and the month's items. MOCK today (see lib/outreach.ts). ?demo=error draws the
// "didn't load" state, ?demo=stress the stress data. Reviewers don't see it.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AreaLoadError } from '@/components/area/parts';
import { PlanView } from '@/components/outreach/plan-view';
import { loadPlan } from '@/lib/outreach';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Plan' };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  if (user.role === 'reviewer') notFound();
  const data = await loadPlan({ demo });
  return (
    <div className="ar-fill ar-stack ar-tall">
      {data.failed ? <AreaLoadError title="Outreach plan" what="Outreach plan" /> : <PlanView data={data} />}
    </div>
  );
}
