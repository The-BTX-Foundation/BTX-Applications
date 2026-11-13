'use client';

// The Programs chat panel of the Certifications page (demo p-certifications, "Programs chat"): day lines, the messages,
// and the field to write. Mock mode keeps a sent message in its own state, like the demo. Live mode posts to the programs
// area channel with lib/chat-actions.ts postMessage (an id made in the browser, so a Retry never posts twice; 15 seconds
// at most). A message that did not save is never put back in the field: it stays in the thread as a "Not sent" row with
// Retry and Remove, kept in the shared Not-sent store (lib/chat-unsent.ts), which belongs to one signed-in person.
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { postMessage, sendBudget } from '@/lib/chat-actions';
import { addUnsent, claimChatStore, dropUnsent, setUnsentState, subscribeUnsent, unsentIn, unsentServerSnapshot, unsentSnapshot } from '@/lib/chat-unsent';
import { newId } from '@/lib/tasks-ids';
import type { CertChat, CertMsg } from '@/lib/cert-view';

/**
 * The Not-sent store's key when there is no channel id: rows are otherwise keyed by the Programs channel's id, like the
 * Mentorship page and the Chat page, so a message that did not send shows on all three.
 */
export const CERT_CHAT_TARGET = 'cert:programs';

type Props = {
  chat: CertChat;
  /** The viewer's staff id (owns the Not-sent rows) and initials (their avatar). */
  me: string;
  meInitials: string;
  live: boolean;
  /** True when the composer is drawn (mock always; live when the person may post to a real channel). */
  canPost: boolean;
  /** Mock `?demo=failsave`: every send fails, to show the Not-sent row. */
  failSave: boolean;
  /** "9:14 AM" for a message sent now. */
  stamp: () => string;
  /** Reads a message to screen readers (the page's one live region). */
  say: (m: string) => void;
  /** Live: fetch fresh server data after a message saved. */
  onSaved: () => void;
  /** "Try again" on the chat's own load error. */
  onRetry: () => void;
};

// One message: avatar, name and time, the words; `children` adds the Not-sent line.
function Msg({ m, meInitials, children }: { m: Pick<CertMsg, 'who' | 'initials' | 'bot' | 'mine' | 'time' | 'text'>; meInitials: string; children?: React.ReactNode }) {
  return (
    <div className={`cf-msg${m.bot ? ' cf-bot' : ''}`}>
      <span className="rf-avatar rf-round" aria-hidden="true">
        {m.bot ? <Icon name="flag" /> : m.mine ? meInitials : m.initials}
      </span>
      <div>
        <p className="cf-from">
          <b>{m.who}</b>
          {m.time ? <span>{m.time}</span> : null}
        </p>
        <p className="cf-txt">{m.text}</p>
        {children}
      </div>
    </div>
  );
}

// The day line above message `i` of `list`: its day when it differs from the message before (else null).
const dayLine = (list: Pick<CertMsg, 'day'>[], i: number) => (i === 0 || list[i - 1].day !== list[i].day ? list[i].day : null);

// The panel.
export function CertChatPanel({ chat, me, meInitials, live, canPost, failSave, stamp, say, onSaved, onRetry }: Props) {
  const [text, setText] = useState('');
  // Messages sent from this page that the server data does not list yet.
  const [sent, setSent] = useState<CertMsg[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  claimChatStore(me);
  const store = useSyncExternalStore(subscribeUnsent, () => unsentSnapshot(me), unsentServerSnapshot);
  const target = chat.channelId ?? CERT_CHAT_TARGET;
  const unsent = unsentIn(store, [target]);
  const writes = live || failSave;
  const serverIds = new Set(chat.messages.map((m) => m.id));
  // A refresh that lists a Not-sent message's id (it saved after all) drops its remembered row.
  useEffect(() => {
    const saved = unsent.filter((r) => serverIds.has(r.id) && r.state === 'failed');
    if (saved.length) dropUnsent(me, saved.map((r) => r.id));
  });

  // Posts one message (or fails: the mock's ?demo=failsave, or a refused or timed-out live insert).
  const post = async (id: string, body: string): Promise<boolean> => {
    if (!live) return new Promise((r) => window.setTimeout(() => r(false), 300));
    if (!chat.channelId) return false;
    try {
      await postMessage(chat.channelId, body, { id, signal: sendBudget() });
      return true;
    } catch {
      return false;
    }
  };

  // Sends what was typed: drawn at once; a failure moves it to a Not-sent row (never back into the field).
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    const id = writes ? newId() : `local-${Date.now()}`;
    const msg: CertMsg = { id, day: 'Today', who: 'You', initials: meInitials, bot: false, mine: true, time: stamp(), text: v };
    setSent((list) => [...list, msg]);
    setText('');
    if (!writes) {
      say('Message sent to Programs chat');
      return;
    }
    void post(id, v).then((ok) => {
      if (ok) {
        say('Message sent to Programs chat');
        onSaved();
        return;
      }
      setSent((list) => list.filter((x) => x.id !== id));
      addUnsent(me, { id, target, text: v, state: 'failed' });
      say("Message not sent. Couldn't save. Try again.");
    });
  };

  // Retry of a Not-sent row: the same words with the same id (a first try that saved after all counts as saved).
  const retry = (id: string, body: string) => {
    setUnsentState(me, id, 'sending');
    void post(id, body).then((ok) => {
      if (!ok) {
        setUnsentState(me, id, 'failed');
        say("Message not sent. Couldn't save. Try again.");
        return;
      }
      dropUnsent(me, [id]);
      setSent((list) => [...list, { id, day: 'Today', who: 'You', initials: meInitials, bot: false, mine: true, time: stamp(), text: body }]);
      say('Message sent to Programs chat');
      onSaved();
    });
  };

  // Remove of a Not-sent row; focus goes to the field.
  const remove = (id: string) => {
    dropUnsent(me, [id]);
    inputRef.current?.focus();
    say('Message removed');
  };

  const extra = sent.filter((m) => !serverIds.has(m.id));
  // A Not-sent row whose id the server now lists saved after all: it is drawn once, as a saved message.
  const pending = unsent.filter((u) => !serverIds.has(u.id));
  const all = [...chat.messages, ...extra];

  return (
    <section className="rf-panel cf-chat" aria-labelledby="cf-chh">
      <div className="rf-ph">
        <h2 id="cf-chh">{chat.title}</h2>
        {chat.failed ? null : <span className="cf-sub">{chat.people} people</span>}
      </div>
      <div className="rf-pcard">
        {chat.failed ? (
          <div className="cf-err" role="alert">
            <div>
              <b>Programs chat didn&apos;t load.</b>
              <p>Check your connection, then try again.</p>
            </div>
            <button type="button" className="rf-btn" onClick={onRetry}>
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className={canPost ? undefined : 'cf-noreply'}>
              {chat.capped ? <p className="cf-chatnote">Older messages aren&apos;t shown here.</p> : null}
              {!chat.channelId && !chat.messages.length ? <p className="cf-chatnote cf-alone">There is no Programs chat yet.</p> : null}
              {chat.messages.map((m, i) => {
                const line = dayLine(chat.messages, i);
                return (
                  <div key={m.id}>
                    {line ? <p className="cf-day">{line}</p> : null}
                    <Msg m={m} meInitials={meInitials} />
                  </div>
                );
              })}
              {extra.map((m, i) => {
                const line = dayLine(all, chat.messages.length + i);
                return (
                  <Fold key={m.id} open appear>
                    {line ? <p className="cf-day">{line}</p> : null}
                    <Msg m={m} meInitials={meInitials} />
                  </Fold>
                );
              })}
              {pending.map((u) => (
                <Msg key={u.id} m={{ who: 'You', initials: meInitials, bot: false, mine: true, time: '', text: u.text }} meInitials={meInitials}>
                  <p className="cf-unsent">
                    {u.state === 'sending' ? (
                      'Sending…'
                    ) : (
                      <>
                        <span>Not sent. Couldn&apos;t save. Try again.</span>
                        <button type="button" className="rf-lnk" onClick={() => retry(u.id, u.text)}>
                          Retry
                        </button>
                        <button type="button" className="rf-lnk" onClick={() => remove(u.id)}>
                          Remove
                        </button>
                      </>
                    )}
                  </p>
                </Msg>
              ))}
            </div>
            {canPost ? (
              <form className="cf-reply" onSubmit={submit} autoComplete="off">
                <input
                  ref={inputRef}
                  type="text"
                  enterKeyHint="send"
                  placeholder="Message Programs"
                  aria-label="Message Programs"
                  maxLength={4000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="cf-send" type="submit" aria-label="Send message" disabled={!text.trim()}>
                  <Icon name="send" />
                </button>
              </form>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
