// Scholarships > the published cycle (Ops Hub refresh, demo p-cycle): the schedule drawn on one dated line, the cycle's
// checklist grouped by stage, and the Scholarships chat. The server reads the page's data in one shape
// (lib/cycle-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it to the client
// board (components/cycle/cycle-board.tsx). It sits in its own route group, (cycle), with its loading skeleton. The
// cycle's settings page (/scholarships/cycle/settings) is a separate page; this one only links to it.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { CycleBoard } from '@/components/cycle/cycle-board';
import { CycleSkeleton } from '@/components/cycle/cycle-skeleton';
import { loadCycleView } from '@/lib/cycle-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Cycle' };

// The page.
export default async function CyclePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [{ demo }, user] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton.
  if (!live && demo === 'loading') return <CycleSkeleton />;
  const view = await loadCycleView({ demo, user: { id: user.id, name: user.name, initials: user.initials, role: user.role } });
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <CycleBoard key={live ? 'live' : (demo ?? 'normal')} view={view} live={live} />;
}
