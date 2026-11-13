// Programs > Mentorship: the program's setup checklist ("Where it stands") and the Programs chat (Ops Hub refresh
// 2026-11-11; demo p-mentorship). The server reads the page's data in one shape (lib/mentorship-view-loader.ts: the mock
// sample without Supabase env, the real tables with it) and hands it to the client board
// (components/mentorship/mentorship-board.tsx). It sits in its own route group, (mentorship), with its loading skeleton.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { MentorshipBoard } from '@/components/mentorship/mentorship-board';
import { MentorshipSkeleton, MsHead } from '@/components/mentorship/mentorship-skeleton';
import { loadMentorshipView } from '@/lib/mentorship-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Mentorship' };

// The page.
export default async function MentorshipPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <MentorshipSkeleton />;
  const view = await loadMentorshipView({ demo, user: { id: user.id, initials: user.initials, role: user.role } });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf ms">
        <MsHead />
        <LoadError what="Mentorship" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <MentorshipBoard key={demo ?? 'normal'} view={view} live={live} />;
}
