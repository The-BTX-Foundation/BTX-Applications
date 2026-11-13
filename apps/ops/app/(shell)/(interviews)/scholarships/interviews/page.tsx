// Scholarships > Interviews (route /scholarships/interviews; Ops Hub refresh 2026-11-12, demo p-interviews). The server reads
// the page's data in one shape (lib/interviews-view-loader.ts: the mock sample without Supabase env; live, the existing
// loader lib/interviews.ts, unchanged) and hands it to the client board (components/interviews/interviews-board.tsx),
// which calls only the existing server actions in lib/actions/interviews.ts, as the old page did.
// Mock mode only: ?demo= picks a demo state (stress, empty, error, failed, loading); live mode ignores it.
// It sits in its own route group, (interviews), with its loading skeleton; the availability and questions pages under
// /scholarships/interviews stay where they were.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { InterviewsBoard } from '@/components/interviews/interviews-board';
import { InterviewsSkeleton } from '@/components/interviews/interviews-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadInterviewsView } from '@/lib/interviews-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Interviews' };

// Server Actions run under the page that calls them, so their time limit is set here (Next.js: maxDuration at the page
// level). "Make Teams links" calls Microsoft once or twice per interview and then sends the emails, which can take
// minutes for a full cycle. Vercel's btx-ops project has Fluid compute on, which allows 300.
export const maxDuration = 300;

// The page.
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  await requireStaff();
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo's Loading state does.
  if (!live && demo === 'loading') return <InterviewsSkeleton />;
  const view = await loadInterviewsView({ demo: live ? undefined : demo });
  // The whole page failed (the read failed, or ?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Interviews" />
        <LoadError what="Interviews" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <InterviewsBoard key={live ? 'live' : (demo ?? 'normal')} view={view} live={live} />;
}
