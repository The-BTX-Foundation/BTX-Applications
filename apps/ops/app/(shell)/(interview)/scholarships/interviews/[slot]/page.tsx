// The page for one interview (route /scholarships/interviews/[slot]; slot = the interview time's id, lib/interview-href.ts).
// Staff only (requireStaff), read as the signed-in person so row-level security applies (lib/interview-page-loader.ts: the
// mock sample without Supabase env, the real tables with it). The static routes beside it (questions, availability) win
// over this dynamic segment. Mock mode only: ?demo= picks a state (stress, empty, board, failsave, error, failed, loading);
// live mode ignores it. It sits in its own route group, (interview), with its loading skeleton.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasSupabaseEnv } from '@btx/data';
import { InterviewPageBoard } from '@/components/interview-page/interview-page';
import { InterviewPageSkeleton } from '@/components/interview-page/interview-page-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadInterviewPage } from '@/lib/interview-page-loader';
import { currentStaffId } from '@/lib/me';
import { requireStaff } from '@/lib/user';

// The tab title never carries the student's name.
export const metadata: Metadata = { title: 'Interview' };

// Change interviewer emails the incoming member and may update the Teams meeting (Server Actions run under this page).
export const maxDuration = 60;

type Props = { params: Promise<{ slot: string }>; searchParams: Promise<{ demo?: string }> };

// The slot id from the URL, or null when it is malformed (a stray "%").
function slotOf(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// The page.
export default async function InterviewPage({ params, searchParams }: Props) {
  const [{ slot: raw }, { demo }, user] = await Promise.all([params, searchParams, requireStaff()]);
  const slotId = slotOf(raw);
  if (slotId === null) notFound();
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <InterviewPageSkeleton />;
  // Live: the session's user id; mock: the sample's viewer (Dana Mercer).
  const me = live ? user.id : await currentStaffId();
  const result = await loadInterviewPage({ slotId, demo: live ? undefined : demo, me, isAdmin: user.role === 'admin' });
  if (result.state === 'missing') notFound();
  if (result.state === 'failed') {
    return (
      <>
        <PageHeader title="Interview" />
        <LoadError what="This interview" />
      </>
    );
  }
  return <InterviewPageBoard key={live ? 'live' : `${slotId}:${demo ?? 'normal'}`} view={result.view} live={live} userId={me ?? ''} />;
}
