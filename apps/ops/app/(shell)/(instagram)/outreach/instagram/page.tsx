// Outreach > Instagram (Ops Hub refresh 2026-11-12; demo p-instagram): this month's posts against the target, each post's
// five steps, and adding a post in place. The server reads the page's data in one shape (lib/instagram-view-loader.ts: the
// mock sample without Supabase env, the Instagram channel's `posts` rows with it) and hands it to the client board
// (components/instagram/instagram-board.tsx), which owns the live writes (add a post, send it for board approval).
// It sits in its own route group, (instagram), with its loading skeleton (loading.tsx beside it).
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { InstagramBoard } from '@/components/instagram/instagram-board';
import { IgHead, InstagramSkeleton, OutreachNav } from '@/components/instagram/instagram-skeleton';
import { requireStaff } from '@/lib/user';
import { loadIgView } from '@/lib/instagram-view-loader';

export const metadata: Metadata = { title: 'Instagram' };

// The page.
export default async function InstagramPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <InstagramSkeleton />;
  const view = await loadIgView({ demo, me: user.id }, live);
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf ig">
        <IgHead />
        <OutreachNav />
        <LoadError what="Instagram" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <InstagramBoard key={demo ?? 'normal'} view={view} live={live} />;
}
