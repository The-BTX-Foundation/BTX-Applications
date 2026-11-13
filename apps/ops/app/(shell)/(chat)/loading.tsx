// Shown at once while Board chat's server data loads (Next.js loading file, for /chat only: this is the (chat) route
// group): the same skeleton as `?demo=loading`.
import { ChatSkeleton } from '@/components/chat/chat-skeleton';

// The skeleton.
export default function ChatLoading() {
  return <ChatSkeleton />;
}
