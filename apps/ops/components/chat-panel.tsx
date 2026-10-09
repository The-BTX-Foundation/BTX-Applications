// The Scholarships chat panel beside the cycle page (Figma "aside.chat"). MOCK: there is no chat table yet, so the thread
// is the Figma sample (mock/cycle.ts) and the composer does not send anything (it is disabled until chat exists).
import { MOCK_CHAT } from '@/mock/cycle';
import { OIcon } from './icons';

// Keeps an applicant code ("APP-2026-00004") on one line, as the design does.
function withCodes(text: string) {
  return text.split(/(APP-\d{4}-\d{5})/).map((part, i) =>
    /^APP-/.test(part) ? (
      <span key={i} style={{ whiteSpace: 'nowrap' }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function ChatPanel() {
  const days = Array.from(new Set(MOCK_CHAT.messages.map((m) => m.day)));
  return (
    <aside className="o-chat" aria-label={MOCK_CHAT.title}>
      <div className="o-chat-h">
        <h2>{MOCK_CHAT.title}</h2>
        <span>{MOCK_CHAT.people} people</span>
      </div>
      <div className="o-chat-m">
        {days.map((d) => (
          <div key={d} className="o-chat-day">
            <p className="o-day">
              <span>{d}</span>
            </p>
            {MOCK_CHAT.messages
              .filter((m) => m.day === d)
              .map((m) => (
                <div key={m.id} className={`o-msg${m.mine ? ' mine' : ''}`}>
                  {m.mine ? null : (
                    <span className={m.bot ? 'o-ow bot big' : 'o-ow big'}>{m.bot ? <OIcon name="refresh" size={18} /> : m.initials}</span>
                  )}
                  <div>
                    <p className="o-msg-h">
                      {m.mine ? null : <b>{m.who}</b>} <span>{m.time}</span>
                    </p>
                    <p className={`o-bub${m.bot ? ' bot' : ''}`}>{withCodes(m.text)}</p>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="o-comp" aria-disabled="true">
        <span>Message Scholarships</span>
        <span className="o-go">
          <OIcon name="send" size={20} />
        </span>
      </div>
    </aside>
  );
}
