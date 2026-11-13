// Board chat (Ops Hub refresh; demo p-chat): every area channel together ("All areas"), each area, and direct
// conversations. The server reads the page's data in one shape (lib/chat-view-loader.ts: the mock sample without Supabase
// env, the real tables with it) and hands it to the client board (components/chat/chat-board.tsx), which owns everything
// the person does on the page. It sits in its own route group, (chat), so its loading skeleton (../loading.tsx) covers
// /chat only. Mock mode flags: ?demo=stress|empty|error|failed|loading|capped|failsend.
import type { Metadata } from 'next';
import { hasSupabaseEnv } from '@btx/data';
import { ChatBoard } from '@/components/chat/chat-board';
import { ChatSkeleton } from '@/components/chat/chat-skeleton';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { chatDemo, loadChatView } from '@/lib/chat-view-loader';

export const metadata: Metadata = { title: 'Board chat' };

// The page.
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const live = hasSupabaseEnv();
  // Mock mode only: ?demo=loading draws the loading skeleton (the same one loading.tsx shows).
  if (!live && demo === 'loading') return <ChatSkeleton />;
  const view = await loadChatView({ demo });
  // The whole page failed (live: not signed in as a board member or the first reads failed; mock: ?demo=failed).
  if (view.failed) {
    return (
      <>
        <PageHeader title="Board chat" />
        <LoadError what="Board chat" />
      </>
    );
  }
  return (
    // A new board when the signed-in person or the demo state changes, or the thread goes from failed to loaded ("Try
    // again"); other refreshes are taken in by the board itself.
    <ChatBoard key={`${view.me.userId}:${demo ?? 'normal'}:${view.threadFailed ? 'failed' : 'ok'}`} view={view} live={live} failSend={chatDemo(demo, live).failSend} />
  );
}
