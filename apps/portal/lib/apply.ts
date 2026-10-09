// Server-side loading for the application pages. Every /apply page needs the signed-in student's application for the
// published cycle; this finds it (her cookies carry the session, so row-level security applies) or sends her where she
// belongs: sign-in, /apply/start (no application yet), or /status (already submitted).
import { redirect } from 'next/navigation';
import { fetchPublishedCycle, getAuthMode, listFiles, type AppFile, type Application, type Cycle } from '@btx/data';
import { MOCK_VIEW, toView, type CycleView } from './cycle';
import { sessionClient } from './supabase-server';

export type ApplyData =
  | { failed: true }
  | { failed?: false; mock: true; view: CycleView }
  | { failed?: false; mock: false; application: Application; files: AppFile[]; view: CycleView; cycle: Cycle; email: string; userId: string };

// Loads the application for the page at `here` (used for the return address after sign-in).
export async function loadApply(here: string, demo?: string): Promise<ApplyData> {
  if (getAuthMode() === 'mock') return demo === 'error' ? { failed: true } : { mock: true, view: MOCK_VIEW };
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const { cycle, failed } = await fetchPublishedCycle(client);
  if (failed) return { failed: true };
  const { data: application, error } = cycle
    ? await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle()
    : { data: null, error: null };
  if (error) return { failed: true };
  if (!cycle || !application) redirect('/apply/start');
  if (application.status === 'submitted') redirect('/status');
  const files = await listFiles(client, application.id);
  return { mock: false, application, files, view: toView(cycle), cycle, email: auth.user.email ?? '', userId: auth.user.id };
}

// Loads the submitted application for the status page, or sends her to the step she is on.
export async function loadSubmitted(demo?: string) {
  if (getAuthMode() === 'mock') return demo === 'error' ? ({ failed: true } as const) : null;
  const client = await sessionClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect('/sign-in?next=%2Fstatus');
  const { cycle, failed } = await fetchPublishedCycle(client);
  if (failed) return { failed: true } as const;
  const { data: application, error } = cycle
    ? await client.from('applications').select('*').eq('cycle_id', cycle.id).maybeSingle()
    : { data: null, error: null };
  if (error) return { failed: true } as const;
  if (!cycle || !application || application.status !== 'submitted') redirect('/apply/start');
  return { failed: false as const, application, view: toView(cycle), email: auth.user.email ?? '' };
}
