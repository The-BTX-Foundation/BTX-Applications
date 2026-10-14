'use client';

// An area's chat panel in LIVE mode (the cycle page's Scholarships chat, the Programs chat): the channel's latest messages
// and a composer that posts to chat_messages as the signed-in person (lib/chat-actions.ts). It draws the same .o-chat
// markup as the mock panels; mock mode never uses it.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OIcon } from '@/components/icons';
import { postMessage } from '@/lib/chat-actions';
import { dayName, type AreaMsg } from '@/lib/chat-shared';
import { timeLabel } from '@/lib/format';
import './area.css';

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

export function AreaThread({
  channelId,
  title,
  people,
  messages,
  composerLabel,
  className,
}: {
  channelId: string;
  title: string;
  people: number;
  messages: AreaMsg[];
  composerLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [sent, setSent] = useState<AreaMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  // Messages the server already returned replace the ones added here after a send.
  const known = new Set(messages.map((m) => m.id));
  const all = [...messages, ...sent.filter((m) => !known.has(m.id))];
  const days = Array.from(new Set(all.map((m) => m.day)));

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [all.length]);

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(false);
    try {
      const saved = await postMessage(channelId, body);
      setSent((s) => [...s, { id: saved.id, day: dayName(saved.createdAt, Date.now()), who: 'You', mine: true, time: timeLabel(saved.createdAt), text: body }]);
      setDraft('');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`o-chat ar-live${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="o-chat-h">
        <h2>{title}</h2>
        <span>{people} people</span>
      </div>
      <div className="o-chat-m" ref={list}>
        {all.length === 0 ? <p className="ar-none">No messages yet.</p> : null}
        {days.map((d) => (
          <div key={d} className="o-chat-day">
            <p className="o-day">
              <span>{d}</span>
            </p>
            {all
              .filter((m) => m.day === d)
              .map((m) => (
                <div key={m.id} className={`o-msg${m.mine ? ' mine' : ''}`}>
                  {m.mine ? null : <span className={m.bot ? 'o-ow bot big' : 'o-ow big'}>{m.bot ? <OIcon name="refresh" size={18} /> : m.initials}</span>}
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
      <form
        className="o-comp ar-comp"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input type="text" value={draft} maxLength={4000} placeholder={composerLabel} aria-label={composerLabel} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="o-go" aria-label="Send" disabled={busy || !draft.trim()}>
          <OIcon name="send" size={20} />
        </button>
        {error ? (
          <span className="ar-senderr" role="alert">
            Didn&apos;t send. Try again.
          </span>
        ) : null}
      </form>
    </aside>
  );
}
