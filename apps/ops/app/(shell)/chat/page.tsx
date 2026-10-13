// Board chat: every area channel together ("All areas"), each area, and direct conversations. Mock mode shows the Figma
// sample; ?demo=stress the long-text sample and ?demo=error the "didn't load" card.
import type { Metadata } from "next";
import { ChatView } from "@/components/chat/chat-view";
import "@/components/chat/chat.css";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { loadChat } from "@/lib/chat";

export const metadata: Metadata = { title: "Board chat" };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const data = await loadChat({ demo });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Board chat" />
        <div className="ch-errp">
          <LoadError what="Board chat" />
        </div>
      </>
    );
  }
  return <ChatView data={data} />;
}
