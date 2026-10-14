// Scholarships > Fall 2026 cycle: a read-only overview. The dates and the checklist come from the database (lib/cycle.ts;
// dates it lacks read "Not set"); the chat is drawn by the chat panel. ?demo=error draws the "didn't load" state.
import type { Metadata } from 'next';
import { ChatPanel } from '@/components/chat-panel';
import { CycleView } from '@/components/cycle-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadCycle } from '@/lib/cycle';

export const metadata: Metadata = { title: 'Cycle' };

// Loads the cycle on the server (as the signed-in person) and draws the page with the chat beside it.
export default async function CyclePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const cycle = await loadCycle({ forceError: demo === 'error' });
  return (
    <div className="o-cy">
      <div className="o-cy-main">
        {cycle.failed ? (
          <>
            <PageHeader title="Fall 2026 cycle" />
            <LoadError what="The cycle" />
          </>
        ) : (
          <CycleView cycle={cycle} />
        )}
      </div>
      <ChatPanel />
    </div>
  );
}
