// Scholarships > Scoring (Ops Hub refresh 2026-11-12; demo p-scoring). The server reads the signed-in person's queue in
// one shape (lib/scoring-view-loader.ts: the demo's sample without Supabase env, the real tables with it, as the signed-in
// person so row-level security applies) and hands it to the client board (components/scoring/scoring-board.tsx).
// Blind scoring: the view carries only the person's own picks and private notes; the other interviewer is a published
// yes/no. Live mode ignores every `?demo=` value.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { ScoringBoard } from '@/components/scoring/scoring-board';
import { ScoringLoadError, ScoringSkeleton } from '@/components/scoring/scoring-skeleton';
import { easternDay } from '@/lib/refresh-time';
import { titleDate } from '@/lib/scoring-map';
import { loadScoringView } from '@/lib/scoring-view-loader';
import { requireStaff } from '@/lib/user';
import { mockScoringView } from '@/mock/scoring-view';

export const metadata: Metadata = { title: 'Scoring' };

// The page.
export default async function ScoringPage({ searchParams }: { searchParams: Promise<{ demo?: string; code?: string }> }) {
  const [{ demo, code }, me] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the loading skeleton, as the demo does.
  if (!live && demo === 'loading') return <ScoringSkeleton />;
  const view = await loadScoringView({ demo: live ? undefined : demo, me: me.id });
  if (view.failed) {
    // Mock ?demo=failed: the whole-page "didn't load" card.
    if (view.page) {
      return (
        <>
          <PageHeader title="Scoring" />
          <LoadError what="Scoring" />
        </>
      );
    }
    // A failed read: the demo's "Your scores didn't load" card under the title, never an empty queue.
    return <ScoringLoadError date={titleDate(live ? easternDay(new Date().toISOString()) : mockScoringView().today)} />;
  }
  // ?code=APP-... opens that student's sheet first (the interview page's "Score" link); unknown codes are ignored.
  return <ScoringBoard key={demo ?? 'normal'} view={view} live={live} userId={me.id} initialCode={typeof code === 'string' ? code : undefined} />;
}
