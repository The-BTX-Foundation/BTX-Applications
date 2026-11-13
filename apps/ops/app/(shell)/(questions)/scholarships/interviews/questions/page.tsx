// Scholarships > Interviews > Interview questions (Ops Hub refresh 2026-11-12; demo p-questions). The server reads the
// page's data in one shape (lib/questions-view-loader.ts: the mock sample without Supabase env, the real tables with it)
// and hands it to the client board (components/questions/questions-board.tsx). It sits in its own route group,
// (questions), with its loading skeleton (loading.tsx beside it). Writes go through the page's existing server actions
// (lib/actions/interview-questions.ts), unchanged.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { QuestionsBoard } from '@/components/questions/questions-board';
import { QuestionsSkeleton } from '@/components/questions/questions-skeleton';
import { requireStaff } from '@/lib/user';
import { loadQnView } from '@/lib/questions-view-loader';

export const metadata: Metadata = { title: 'Interview questions' };

// The page.
export default async function InterviewQuestionsPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, me] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <QuestionsSkeleton />;
  const view = await loadQnView({ demo, me: me.id ?? null, isAdmin: me.role === 'admin' }, live);
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Interview questions" />
        <LoadError what="The interview questions" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <QuestionsBoard key={demo ?? 'normal'} view={view} live={live} />;
}
