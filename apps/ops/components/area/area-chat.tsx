// An area's chat panel beside its page (Figma "aside.chat", e.g. "Programs chat"). It reuses the cycle page's .o-chat
// styles. MOCK mode (no Supabase env): the thread is the `chat` sample passed in and the composer is a drawing that sends
// nothing. LIVE mode: the area's channel (`area`, or the area named in "Message <Area>") with its latest messages and a
// working composer (area-thread.tsx); the `chat` prop is not used. Nothing for someone who can't see the chat.
import { hasSupabaseEnv } from '@btx/data';
import { loadAreaChat } from '@/lib/chat';
import type { AreaChat } from '@/mock/area';
import { OIcon } from '../icons';
import { AreaThread } from './area-thread';
import './area.css';

export async function AreaChatPanel({ chat, composerLabel, area }: { chat: AreaChat; composerLabel: string; area?: string }) {
  if (hasSupabaseEnv()) {
    const slug = area ?? composerLabel.replace(/^Message\s+/, '').trim().toLowerCase();
    const live = await loadAreaChat(slug);
    if (!live) return null;
    return <AreaThread channelId={live.channelId} title={live.title} people={live.people} messages={live.messages} composerLabel={composerLabel} className="ar-chat" />;
  }
  const days = Array.from(new Set(chat.messages.map((m) => m.day)));
  return (
    <aside className="o-chat ar-chat" aria-label={chat.title}>
      <div className="o-chat-h">
        <h2>{chat.title}</h2>
        <span>{chat.people} people</span>
      </div>
      <div className="o-chat-m">
        {days.map((d) => (
          <div key={d} className="o-chat-day">
            <p className="o-day">
              <span>{d}</span>
            </p>
            {chat.messages
              .filter((m) => m.day === d)
              .map((m) => (
                <div key={m.id} className={`o-msg${m.mine ? ' mine' : ''}`}>
                  {m.mine ? null : <span className={m.bot ? 'o-ow bot big' : 'o-ow big'}>{m.bot ? <OIcon name="refresh" size={18} /> : m.initials}</span>}
                  <div>
                    <p className="o-msg-h">
                      {m.mine ? null : <b>{m.who}</b>} <span>{m.time}</span>
                    </p>
                    <p className={`o-bub${m.bot ? ' bot' : ''}`}>{m.text}</p>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="o-comp" aria-disabled="true">
        <span>{composerLabel}</span>
        <span className="o-go">
          <OIcon name="send" size={20} />
        </span>
      </div>
    </aside>
  );
}
