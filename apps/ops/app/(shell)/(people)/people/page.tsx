// Board members (route /people; Ops Hub refresh 2026-11-12, demo p-people). The server reads the page's data in one shape
// (lib/people-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it to the client
// board (components/people/people-board.tsx), which owns the nudges, the member details and the admin-rights changes.
// Mock mode only: ?as=board shows the page as a board member without admin rights, ?demo= picks a demo state.
// In live mode the viewer's role is the one requireStaff() read from the auth server; the rights change itself is checked
// again on the server (lib/people-actions.ts). It sits in its own route group, (people), with its loading skeleton.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { PeopleBoard } from '@/components/people/people-board';
import { PeopleSkeleton } from '@/components/people/people-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { mockRole } from '@/lib/money-shared';
import { loadPeopleView } from '@/lib/people-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Board members' };

// The page.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ demo?: string; as?: string }> }) {
  const { demo, as } = await searchParams;
  const user = await requireStaff();
  const live = hasSupabaseEnv();
  const role = user.mock ? mockRole(as, user.role) : user.role;
  // Mock mode only: ?demo=loading draws the skeleton, as the demo's Loading state does.
  if (!live && demo === 'loading') return <PeopleSkeleton />;
  const view = await loadPeopleView({ demo: live ? undefined : demo });
  // The whole page failed (not signed in, or ?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Board members" />
        <LoadError what="Board members" />
      </>
    );
  }
  // Mock mode: a new board when the demo state or ?as= changes. Live mode keeps one board: a refresh (even one where the
  // viewer's own role changed elsewhere) is taken in by the board itself, so its messages and nudges in flight survive.
  return <PeopleBoard key={live ? 'live' : `${demo ?? 'normal'}:${role}`} view={view} live={live} role={role} demo={live ? undefined : demo} />;
}
