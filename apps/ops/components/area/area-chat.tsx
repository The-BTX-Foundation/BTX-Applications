// An area's chat panel beside its page (Figma "aside.chat", e.g. "Programs chat"). MOCK: there is no chat table yet, so
// the thread is the Figma sample and the composer does not send anything (it is disabled until chat exists). It reuses
// the cycle page's .o-chat styles.
import type { AreaChat } from '@/mock/area';
import { OIcon } from '../icons';
import './area.css';

export function AreaChatPanel({ chat, composerLabel }: { chat: AreaChat; composerLabel: string }) {
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
