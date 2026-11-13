'use client';

// The Cycle page's Scholarships chat panel (the real Scholarships area channel): day lines, the newest messages, and a
// box to write. Mock mode adds the sent message at once, like the demo. Live mode posts it with lib/chat-actions.ts
// postMessage and a browser-made id (a retry of the same message never posts twice); a send that did not save leaves its
// words in a "Not sent" row (Retry, Remove) kept in lib/chat-unsent.ts under the person's id and the channel id, so the
// same row also shows on the Chat page. The draft lives in the same store, so it survives the panel being drawn anew.
// Nothing here emails anyone: a message goes only to the board's Scholarships channel.
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold, Nw } from '@/components/refresh/fold';
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
import type { CyChat } from '@/lib/cycle-view';
import type { MsMessage } from '@/lib/mentorship-view';
import { newId } from '@/lib/tasks-ids';
import { CyChatSkel } from './cycle-skeleton';

type Props = {
  chat: CyChat;
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
/** The words after a send that saved. */
const SENT = 'Message sent to Scholarships chat.';

// "Ada Okafor (APP-2026-00011)": a name before an application code, and the code alone; each kept on one line.
const CODE = /((?:[A-Z][\w'’-]+ )+[A-Z][\w'’-]+(?= \(APP-)|APP-\d{4}-\d{5})/g;

// A message's words with names, codes, dates and amounts kept on one line.
function Words({ text, names }: { text: string; names: string[] }) {
  const parts = text.split(CODE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rf-nowrap">
            {p}
          </span>
        ) : (
          <Fragment key={i}>
            <Nw text={p} names={names} />
          </Fragment>
        ),
      )}
    </>
  );
}

// One message: the face (the BTX mark for the bot), name and time, the words.
function Msg({ m, names }: { m: MsMessage; names: string[] }) {
  return (
    <div className={`cy-msg${m.bot ? ' cy-bot' : ''}${m.mine ? ' cy-mine' : ''}`}>
      <span className="cy-av" aria-hidden="true">
        {m.bot ? <Icon name="auto" /> : m.initials}
      </span>
      <div className="cy-mb">
        <p className="cy-from">
          <b>{m.who}</b>
          <span>{m.time}</span>
        </p>
        <p className="cy-txt">
          <Words text={m.text} names={names} />
        </p>
      </div>
    </div>
  );
}

// The panel.
export function CycleChat({ chat, me, canSend, live, failSend, stamp, say, enqueue }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Messages sent from this panel since it loaded (dropped once the server's list has them).
  const [mine, setMine] = useState<MsMessage[]>([]);
  const [grown, setGrown] = useState<Set<string>>(() => new Set());
  // "Try again" on the chat's load error: true only while the refresh runs.
  const [retrying, startRetry] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const tried = useRef(new Set<string>());

  claimChatStore(me.userId);
  const unsent = useSyncExternalStore(subscribeUnsent, () => unsentSnapshot(me.userId), unsentServerSnapshot);
  const drafts = useSyncExternalStore(subscribeUnsent, () => draftsSnapshot(me.userId), draftsServerSnapshot);

  const channelId = chat.failed ? null : chat.channelId;
  const draftKey = `cy:${channelId ?? 'none'}`;
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
      <section className="rf-panel cy-panel cy-chat" aria-labelledby="cy-ch">
        <div className="rf-ph cy-ph">
          <h2 id="cy-ch">{chat.title}</h2>
        </div>
        <div className="rf-pcard cy-chat-err">
          <StateLine kind="error" retrying={retrying} skeleton={<CyChatSkel />} onRetry={retry}>
            Scholarships chat didn&apos;t load.
          </StateLine>
        </div>
      </section>
    );
  }

  const messages = [...chat.messages, ...mine.filter((m) => !serverIds.has(m.id))];
  const names = [...new Set(messages.filter((m) => !m.bot && m.who !== 'You').map((m) => m.who))];
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
        say(SENT);
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
      say(SENT);
      return;
    }
    deliver(newId(), text, true);
  };

  // Retry on a Not-sent row: the same words with the same id.
  const retrySend = (r: Unsent) => {
    if (r.state === 'sending') return;
    setUnsentState(me.userId, r.id, 'sending');
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
    <section className="rf-panel cy-panel cy-chat" aria-labelledby="cy-ch">
      <div className="rf-ph cy-ph">
        <h2 id="cy-ch">{chat.title}</h2>
        <span className="cy-r">{chat.people} people</span>
      </div>
      <div className="rf-pcard">
        <div className="cy-thread">
          {chat.capped && messages.length ? <p className="cy-chatnote">Older messages aren&apos;t shown here.</p> : null}
          {messages.length === 0 ? <p className="cy-nomsg">No messages yet.</p> : null}
          {messages.map((m) => {
            const line =
              m.day !== day ? (
                <p key={`d-${m.id}`} className="cy-day">
                  {m.day}
                </p>
              ) : null;
            day = m.day;
            return [
              line,
              grown.has(m.id) ? (
                <Fold key={m.id} open appear>
                  <Msg m={m} names={names} />
                </Fold>
              ) : (
                <Msg key={m.id} m={m} names={names} />
              ),
            ];
          })}
          {notSent.map((r) => (
            <div key={r.id} className="cy-unsent">
              <p className="cy-unsent-text">{r.text}</p>
              {r.state === 'sending' ? (
                <p className="cy-sending">Sending…</p>
              ) : (
                <p className="rf-saveerr cy-senderr">
                  <Icon name="alert" />
                  {SEND_ERR}
                </p>
              )}
              <p className="cy-unsent-acts">
                <button type="button" className="rf-btn rf-btn-gold" aria-label={`Retry: ${r.text.slice(0, 40)}`} aria-disabled={r.state === 'sending'} onClick={() => retrySend(r)}>
                  Retry
                </button>
                <button type="button" className="rf-lnk cy-remove" aria-label={`Remove: ${r.text.slice(0, 40)}`} aria-disabled={r.state === 'sending'} onClick={() => remove(r)}>
                  Remove
                </button>
              </p>
            </div>
          ))}
        </div>
        {sendable ? (
          <form className="cy-reply" autoComplete="off" onSubmit={send}>
            <input
              ref={inputRef}
              id="cy-reply-in"
              type="text"
              enterKeyHint="send"
              placeholder="Message Scholarships"
              aria-label="Message Scholarships"
              maxLength={4000}
              value={draft}
              onChange={(e) => setStoreDraft(me.userId, draftKey, e.target.value)}
            />
            <button className="cy-send" type="submit" aria-label="Send" disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        ) : (
          <div className="cy-reply-pad" />
        )}
      </div>
    </section>
  );
}
