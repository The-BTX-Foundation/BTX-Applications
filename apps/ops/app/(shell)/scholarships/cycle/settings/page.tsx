// Cycle settings: one scrolling page where an admin sets up a scholarship cycle (names, amount, dates, what the Portal
// shows). It edits the published cycle, else the newest draft; ?cycle=<id> picks one. Board members see it read-only.
// In mock mode ?demo=error draws the "didn't load" card.
import type { Metadata } from 'next';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { CycleSettingsView } from '@/components/cycle-settings/cycle-settings-view';
import { loadCycleSettings } from '@/components/cycle-settings/load';

export const metadata: Metadata = { title: 'Cycle settings' };

export default async function CycleSettingsPage({ searchParams }: { searchParams: Promise<{ demo?: string; cycle?: string }> }) {
  const { demo, cycle } = await searchParams;
  const data = await loadCycleSettings(cycle, { forceError: demo === 'error' });
  if (data.state === 'error') {
    return (
      <>
        <PageHeader title="Cycle settings" />
        <LoadError what="Cycle settings" />
      </>
    );
  }
  if (data.state === 'none') {
    return (
      <>
        <PageHeader title="Cycle settings" sub="No cycle yet" />
        <section className="o-err">
          <h2>No cycle to set up yet.</h2>
          <p>There is no draft or published cycle. Ask the person who runs the database to add one.</p>
        </section>
      </>
    );
  }
  return <CycleSettingsView key={data.cycle.id} cycle={data.cycle} applications={data.applications} otherPublishedTerm={data.otherPublishedTerm} canEdit={data.canEdit} />;
}
