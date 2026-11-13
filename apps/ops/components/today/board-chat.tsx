'use client';

// "Board chat" on Today: the latest message, the unread count beside the heading, and a reply box right under the message.
// A sent reply folds in under it as "You · just now". Live mode posts through lib/chat-actions (postMessage) and takes the
// reply back out if the database refuses; the reply box is drawn only when `canReply` (caps.reply and a channel exist).
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ChatPreview } from '@/lib/today-view';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { Fold } from './parts';
import { TdIcon } from './td-icons';
import { sendChat } from './today-writes';

type Props = {
  chat: ChatPreview;
  myInitials: string;
  canReply: boolean;
  live: boolean;
  say: (m: string) => void;
  /** Shows the page's "Couldn't save. Try again." line. */
  onFail: () => void;
};

// The panel.
export function BoardChat({ chat, myInitials, canReply, live, say, onFail }: Props) {
  const [text, setText] = useState('');
  const [thread, setThread] = useState<{ id: number; text: string }[]>([]);
  const seq = useRef(0);
  // When a refresh brings a new latest message (often the reply just sent), the local thread is cleared so a reply never
  // shows twice (once as the latest message, once below it).
  const latestKey = chat.latest ? `${chat.latest.from}|${chat.latest.timeLabel}|${chat.latest.text}` : '';
  const [seenLatest, setSeenLatest] = useState(latestKey);
  if (latestKey !== seenLatest) {
    setSeenLatest(latestKey);
    setThread([]);
  }
  const unread = chat.unread > 99 ? '99+' : chat.unread > 0 ? String(chat.unread) : '';
  const first = chat.latest?.from.split(' ')[0] ?? '';

  // Sends the reply: it shows at once; live mode takes it back out when the write fails.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || !chat.channelId) return;
    const id = ++seq.current;
    setThread((t) => [...t, { id, text: v }]);
    setText('');
    say('Reply sent');
    if (live) {
      void sendChat(chat.channelId, v).then((ok) => {
        if (ok) return;
        setThread((t) => t.filter((m) => m.id !== id));
        setText(v);
        onFail();
      });
    }
  };

  return (
    <Panel
      id="td-chh"
      className="td-chat"
      title={<>Board chat {unread ? <span className="td-unread">· {unread} unread</span> : null}</>}
      action={
        <Link className="rf-lnk" href="/chat">
          Open chat
        </Link>
      }
    >
        {chat.latest ? (
          <div className="td-msg">
            <span className="rf-avatar rf-round" aria-hidden="true">
              {chat.latest.initials}
            </span>
            <div>
              <p className="td-from">
                <b>{chat.latest.from}</b>
                <span>{chat.latest.timeLabel}</span>
              </p>
              <p className="td-txt">{chat.latest.text}</p>
            </div>
          </div>
        ) : (
          <StateLine kind="empty">No messages yet.</StateLine>
        )}
        <div className="td-thread">
          {thread.map((m) => (
            <Fold key={m.id} open appear>
              <div className="td-msg">
                <span className="rf-avatar rf-round" aria-hidden="true">
                  {myInitials}
                </span>
                <div>
                  <p className="td-from">
                    <b>You</b>
                    <span>just now</span>
                  </p>
                  <p className="td-txt">{m.text}</p>
                </div>
              </div>
            </Fold>
          ))}
        </div>
        {canReply && chat.channelId ? (
          <form className="td-reply" autoComplete="off" onSubmit={submit}>
            <input
              type="text"
              enterKeyHint="send"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={chat.latest?.mine ? 'Reply' : first ? `Reply to ${first}` : 'Write to the board'}
              aria-label={chat.latest?.mine ? 'Reply' : chat.latest ? `Reply to ${chat.latest.from}` : 'Message the board'}
            />
            <button className="td-send" type="submit" aria-label="Send reply" disabled={!text.trim()}>
              <TdIcon name="send" />
            </button>
          </form>
        ) : null}
    </Panel>
  );
}
