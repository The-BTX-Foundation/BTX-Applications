// Outreach > Newsletter: the next issue's sections as a checklist, the sending line, the facts and the email preview (Ops
// Hub refresh 2026-11-12; demo p-newsletter). The server reads the page's data in one shape (lib/newsletter-view-loader.ts:
// the mock sample without Supabase env, the real tables with it) and hands it to the client board
// (components/newsletter/newsletter-board.tsx). It sits in its own route group, (newsletter), with its loading skeleton.
// Nothing on this page sends the newsletter or emails anyone in live mode.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { LoadError } from '@/components/load-error';
import { NewsletterBoard } from '@/components/newsletter/newsletter-board';
import { NewsletterSkeleton, NlHead } from '@/components/newsletter/newsletter-skeleton';
import { loadNewsletterView } from '@/lib/newsletter-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Newsletter' };

// The page.
export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <NewsletterSkeleton />;
  const view = await loadNewsletterView({ demo, user: { id: user.id, role: user.role } });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <div className="rf nl">
        <NlHead />
        <LoadError what="Newsletter" />
      </div>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <NewsletterBoard key={demo ?? 'normal'} view={view} live={live} />;
}
