'use client';

// An area's chat panel beside its page (Figma "aside.chat", e.g. "Programs chat"). MOCK: the thread is the Figma sample
// and the composer does not send anything. LIVE: the thread is the area's real channel and the composer posts to it
// (the same write the Board chat uses); when canPost is false the composer stays off. It reuses the cycle
// page's .o-chat styles.
import { useState } from 'react';
import { postMessage } from '@/lib/chat-actions';
import { postedMessage } from '@/lib/area-map';
import type { AreaChat, ChatMsg } from '@/mock/area';
import { OIcon } from '../icons';
import './area.css';

export function AreaChatPanel({ chat, composerLabel }: { chat: AreaChat; composerLabel: string }) {
  const [sent, setSent] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const live = Boolean(chat.channelId);
  const messages = [...chat.messages, ...sent];
  const days = Array.from(new Set(messages.map((m) => m.day)));

  async function send() {
    const body = draft.trim();
    if (!body || busy || !chat.channelId) return;
    setBusy(true);
    setError(false);
    try {
      const saved = await postMessage(chat.channelId, body);
      setSent((s) => [...s, postedMessage(saved.id, body, saved.createdAt, new Date())]);
      setDraft('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
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
            {messages
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
      {live && chat.canPost ? (
        <form
          className="o-comp ar-comp"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input type="text" placeholder={composerLabel} aria-label={composerLabel} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="o-go" aria-label="Send" disabled={busy || !draft.trim()}>
            <OIcon name="send" size={20} />
          </button>
          {error ? (
            <span className="ar-comp-err" role="alert">
              Didn&apos;t send. Try again.
            </span>
          ) : null}
        </form>
      ) : (
        <div className="o-comp" aria-disabled="true">
          <span>{composerLabel}</span>
          <span className="o-go">
            <OIcon name="send" size={20} />
          </span>
        </div>
      )}
    </aside>
  );
}
