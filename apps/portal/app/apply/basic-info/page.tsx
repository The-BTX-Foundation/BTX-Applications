// Application step 1: Basic info. Loads the signed-in student's application on the server (her cookies carry the
// session, so row-level security applies). `?demo=1` loads the draft's sample answers for design review (mock mode).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthMode, getPublishedCycle } from '@btx/data';
import { BasicInfoForm } from '@/components/basic-info-form';
import { loadLanding } from '@/lib/cycle';
import { sessionClient } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Basic info' };

export default async function BasicInfoPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const { view } = await loadLanding();
  if (getAuthMode() === 'mock') {
    return <BasicInfoForm demo={demo === '1'} application={null} view={view} />;
  }
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect('/sign-in?next=%2Fapply%2Fbasic-info');
  const cycle = await getPublishedCycle(client);
  const { data: application } = cycle
    ? await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle()
    : { data: null };
  // no open cycle or no application yet: /apply/start finds or creates it (or sends her to the closed page)
  if (!application) redirect('/apply/start');
  return <BasicInfoForm application={application} email={auth.user.email ?? ''} view={view} />;
}
