'use client';

// The Mentorship page's Programs chat panel (the real Programs area channel): day lines, the newest messages, and a box to
// write. Mock mode adds the sent message at once, like the demo. Live mode posts it with lib/chat-actions.ts postMessage
// and a browser-made id (a retry of the same message never posts twice); a send that did not save leaves its words in a
// "Not sent" row (Retry, Remove) kept in lib/chat-unsent.ts under the person's id and the channel id, so the same row also
// shows on the Chat page. The draft lives in the same store, so it survives the panel being drawn anew.
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { StateLine } from '@/components/refresh/state-line';
import { postMessage, sendBudget } from '@/lib/chat-actions';
import {
  addUnsent,
  claimChatStore,
  draftsServerSnapshot,
  draftsSnapshot,
  dropUnsent,
  setStoreDraft,
  setUnsentState,
  subscribeUnsent,
  unsentIn,
  unsentServerSnapshot,
  unsentSnapshot,
  type Unsent,
} from '@/lib/chat-unsent';
import type { MsChat, MsMessage } from '@/lib/mentorship-view';
import { newId } from '@/lib/tasks-ids';
import { MsChatSkel } from './mentorship-skeleton';

type Props = {
  chat: MsChat;
  me: { userId: string; initials: string };
  canSend: boolean;
  live: boolean;
  /** Mock ?demo=failsend: the first try of each message fails after ~600 ms (its Retry saves). */
  failSend: boolean;
  stamp: () => string;
  say: (m: string) => void;
  enqueue: <T>(k: string, write: () => Promise<T>) => Promise<T>;
};

/** The words after a send that did not save. */
const SEND_ERR = "Couldn't save. Try again.";

// One message: avatar (the BTX flag for the bot), name and time, the words.
function Msg({ m }: { m: MsMessage }) {
  return (
    <div className={`ms-msg${m.bot ? ' ms-bot' : ''}`}>
      <span className="ms-av" aria-hidden="true">
        {m.bot ? <Icon name="flag" /> : m.initials}
      </span>
      <div>
        <p className="ms-from">
          <b>{m.who}</b>
          <span>{m.time}</span>
        </p>
        <p className="ms-txt">{m.text}</p>
      </div>
    </div>
  );
}

// The panel.
export function MentorshipChat({ chat, me, canSend, live, failSend, stamp, say, enqueue }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Messages sent from this panel since it loaded (dropped once the server's list has them).
  const [mine, setMine] = useState<MsMessage[]>([]);
  const [grown, setGrown] = useState<Set<string>>(() => new Set());
  // "Try again" on the chat's load error: true only while the refresh runs, so a second failure shows the error line (and
  // its one role="alert" announcement) again.
  const [retrying, startRetry] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const tried = useRef(new Set<string>());

  claimChatStore(me.userId);
  const unsent = useSyncExternalStore(subscribeUnsent, () => unsentSnapshot(me.userId), unsentServerSnapshot);
  const drafts = useSyncExternalStore(subscribeUnsent, () => draftsSnapshot(me.userId), draftsServerSnapshot);

  const channelId = chat.failed ? null : chat.channelId;
  const draftKey = `ms:${channelId ?? 'none'}`;
  const draft = drafts[draftKey] ?? '';

  // A refresh that shows a Not-sent message saved drops its row.
  const serverIds = new Set(chat.failed ? [] : chat.messages.map((m) => m.id));
  useEffect(() => {
    if (!channelId) return;
    const saved = unsentIn(unsent, [channelId]).filter((r) => serverIds.has(r.id) && r.state === 'failed');
    if (saved.length) dropUnsent(me.userId, saved.map((r) => r.id));
  });

  if (chat.failed) {
    // "Try again": mock goes back to the sample (drops ?demo), live reloads the server data.
    const retry = () => {
      startRetry(() => {
        if (live) router.refresh();
        else router.replace(pathname);
      });
    };
    return (
      <section className="rf-panel ms-panel ms-chat" aria-labelledby="ms-ch">
        <div className="rf-ph ms-ph">
          <h2 id="ms-ch">{chat.title}</h2>
        </div>
        <div className="rf-pcard ms-chat-err">
          <StateLine kind="error" retrying={retrying} skeleton={<MsChatSkel />} onRetry={retry}>
            Programs chat didn&apos;t load.
          </StateLine>
        </div>
      </section>
    );
  }

  const messages = [...chat.messages, ...mine.filter((m) => !serverIds.has(m.id))];
  const notSent = channelId ? unsentIn(unsent, [channelId]).filter((r) => !serverIds.has(r.id)) : [];
  const sendable = canSend && channelId != null;

  // Draws a sent message at the bottom of the thread, growing in.
  const land = (id: string, text: string, time: string) => {
    setMine((ms) => [...ms, { id, day: 'Today', who: 'You', initials: me.initials, bot: false, mine: true, time, text }]);
    setGrown((g) => new Set(g).add(id));
  };

  // Mock ?demo=failsend's stand-in for postMessage: the first try of a message id fails after ~600 ms.
  const mockPost = (id: string) =>
    new Promise<void>((res, rej) =>
      window.setTimeout(() => {
        if (tried.current.has(id)) res();
        else {
          tried.current.add(id);
          rej(new Error('demo: not saved'));
        }
      }, 600),
    );

  // Posts `text` with message id `id`. `draw`: a new send is drawn at once; a Retry waits for the answer. Refused or
  // timed out, the words become (again) a Not-sent row and the page says so once.
  const deliver = (id: string, text: string, draw: boolean) => {
    const at = stamp();
    if (draw) land(id, text, at);
    const write = live ? () => postMessage(channelId as string, text, { id, signal: sendBudget() }).then(() => undefined) : () => mockPost(id);
    const run = live ? enqueue(`send:${channelId}`, write) : write();
    run.then(
      () => {
        if (!draw) land(id, text, at);
        dropUnsent(me.userId, [id]);
        say('Message sent to Programs chat');
      },
      () => {
        if (draw) setMine((ms) => ms.filter((m) => m.id !== id));
        addUnsent(me.userId, { id, target: channelId as string, text, state: 'failed' });
        say(SEND_ERR);
      },
    );
  };

  // Sends the box's words.
  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !sendable) return;
    setStoreDraft(me.userId, draftKey, '');
    if (!live && !failSend) {
      land(newId(), text, stamp());
      say('Message sent to Programs chat');
      return;
    }
    deliver(newId(), text, true);
  };

  // Retry on a Not-sent row: the same words with the same id.
  const retrySend = (r: Unsent) => {
    if (r.state === 'sending') return;
    setUnsentState(me.userId, r.id, 'sending');
    say('Sending…');
    deliver(r.id, r.text, false);
  };

  // Remove on a Not-sent row: the row goes; focus moves to the box. Live: a refresh follows, so a message that did save
  // after all shows up in the thread.
  const remove = (r: Unsent) => {
    if (r.state !== 'failed') return;
    dropUnsent(me.userId, [r.id]);
    inputRef.current?.focus({ preventScroll: true });
    if (live) router.refresh();
  };

  let day = '';
  return (
    <section className="rf-panel ms-panel ms-chat" aria-labelledby="ms-ch">
      <div className="rf-ph ms-ph">
        <h2 id="ms-ch">{chat.title}</h2>
        <span className="ms-sub">{chat.people} people</span>
      </div>
      <div className="rf-pcard">
        <div className="ms-thread">
          {messages.length === 0 ? <p className="ms-nomsg">No messages yet.</p> : null}
          {messages.map((m) => {
            const line =
              m.day !== day ? (
                <p key={`d-${m.id}`} className="ms-day">
                  {m.day}
                </p>
              ) : null;
            day = m.day;
            return [
              line,
              grown.has(m.id) ? (
                <Fold key={m.id} open appear>
                  <Msg m={m} />
                </Fold>
              ) : (
                <Msg key={m.id} m={m} />
              ),
            ];
          })}
          {notSent.map((r) => (
            <div key={r.id} className="ms-unsent">
              <p className="ms-unsent-text">{r.text}</p>
              {r.state === 'sending' ? (
                <p className="ms-sending">Sending…</p>
              ) : (
                <p className="rf-saveerr ms-senderr">
                  <Icon name="alert" />
                  {SEND_ERR}
                </p>
              )}
              <p className="ms-unsent-acts">
                <button type="button" className="rf-btn rf-btn-gold" aria-label={`Retry: ${r.text.slice(0, 40)}`} aria-disabled={r.state === 'sending'} onClick={() => retrySend(r)}>
                  Retry
                </button>
                <button type="button" className="rf-lnk ms-remove" aria-label={`Remove: ${r.text.slice(0, 40)}`} aria-disabled={r.state === 'sending'} onClick={() => remove(r)}>
                  Remove
                </button>
              </p>
            </div>
          ))}
        </div>
        {sendable ? (
          <form className="ms-reply" autoComplete="off" onSubmit={send}>
            <input
              ref={inputRef}
              id="ms-reply-in"
              type="text"
              enterKeyHint="send"
              placeholder="Message Programs"
              aria-label="Message Programs"
              maxLength={4000}
              value={draft}
              onChange={(e) => setStoreDraft(me.userId, draftKey, e.target.value)}
            />
            <button className="ms-send" type="submit" aria-label="Send message" disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        ) : (
          <div className="ms-reply-pad" />
        )}
      </div>
    </section>
  );
}
