// Scholarships > Cycle settings (Ops Hub refresh 2026-11-12; demo p-cycle-settings). The server reads the page's data in
// one shape (lib/cycle-settings-view-loader.ts: the mock sample without Supabase env, the real tables with it) and hands it
// to the client board (components/cycle-settings/cycle-settings-board.tsx). It edits the published cycle, else the newest
// draft; ?cycle=<id> picks one live. Each change goes through the admin-only saveCycleFields action
// (lib/cycle-settings-actions.ts). It sits in its own route group, (cycle-settings), with its loading skeleton beside it.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { CycleSettingsBoard } from '@/components/cycle-settings/cycle-settings-board';
import { CycleSettingsSkeleton } from '@/components/cycle-settings/cycle-settings-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadCycleSettingsView } from '@/lib/cycle-settings-view-loader';
import { requireStaff } from '@/lib/user';

export const metadata: Metadata = { title: 'Cycle settings' };

// The page.
export default async function CycleSettingsPage({ searchParams }: { searchParams: Promise<{ demo?: string; cycle?: string }> }) {
  const [{ demo, cycle }] = await Promise.all([searchParams, requireStaff()]);
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the skeleton, as the demo does.
  if (!live && demo === 'loading') return <CycleSettingsSkeleton />;
  const view = await loadCycleSettingsView({ demo, cycle });
  // The whole page failed (?demo=failed in mock mode): the plain "didn't load" card under the title.
  if (view.failed) {
    return (
      <>
        <PageHeader title="Cycle settings" />
        <LoadError what="Cycle settings" />
      </>
    );
  }
  // A new board when the demo state changes; live refreshes are taken in by the board itself.
  return <CycleSettingsBoard key={live ? (view.cycle?.id ?? 'none') : (demo ?? 'normal')} view={view} live={live} />;
}
