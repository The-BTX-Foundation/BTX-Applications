// Scholarships > Fall 2026 cycle: a read-only overview. The schedule's dates come from the `cycles` row (the three the
// table lacks read "Not set"); the checklist is the cycle's own tasks; the chat is the Scholarships area chat. In mock
// mode everything is the Figma sample and ?demo=error draws the "didn't load" state.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { AreaChatPanel } from '@/components/area/area-chat';
import { ChatPanel } from '@/components/chat-panel';
import { CycleView } from '@/components/cycle-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadAreaChat, loadStaff } from '@/lib/area-db';
import { loadCycle } from '@/lib/cycle';

export const metadata: Metadata = { title: 'Cycle' };

// Loads the cycle on the server (as the signed-in person) and draws the page with the chat beside it.
export default async function CyclePage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const cycle = await loadCycle({ forceError: demo === 'error' });
  const chat = hasSupabaseEnv() && !cycle.failed ? await loadAreaChat('scholarships', 'Scholarships chat', await loadStaff()).catch(() => null) : null;
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
      {hasSupabaseEnv() ? chat ? <AreaChatPanel chat={chat} composerLabel="Message Scholarships" /> : null : <ChatPanel />}
    </div>
  );
}
