'use client';

// "What needs you" on Today: interview booking drawn as one step per student, the one gold action ("Remind the 16") to its
// right, "See who" opening the names, and once the reminder goes out "Reminded today, 9:14 AM · Undo" plus the suggestion
// line. The Remind button is drawn only when `canRemind` (caps.remind): live mode has no student-reminder send yet.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookingNeeds } from '@/lib/today-view';
import { clock, dueWord, fullDate } from '@/lib/today-time';
import { Fold } from './parts';
import { TdIcon } from './td-icons';

type Props = {
  needs: BookingNeeds;
  today: string;
  canRemind: boolean;
  /** Tells the board the reminder went out (true) or was undone (false), so the Mine count follows. */
  onReminded: (sent: boolean) => void;
  say: (m: string) => void;
};

// The card.
export function NeedsCard({ needs, today, canRemind, onReminded, say }: Props) {
  const left = needs.total - needs.booked;
  const [sentAt, setSentAt] = useState<string | null>(needs.remindedAt);
  const [sending, setSending] = useState(false);
  const [who, setWho] = useState(false);
  const sendRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<'undo' | 'send' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const sent = sentAt !== null;

  // Keeps the gold button the same width while it says "Sending…" (nothing jumps).
  useLayoutEffect(() => {
    const b = sendRef.current;
    if (!b) return;
    const fit = () => {
      b.style.minWidth = '';
      if (b.offsetWidth) b.style.minWidth = `${b.offsetWidth}px`;
    };
    fit();
    void document.fonts?.ready.then(fit);
  }, []);

  // Moves focus after the card changes (to Undo once sent, back to the button once undone).
  useEffect(() => {
    if (focusNext.current === 'undo') undoRef.current?.focus({ preventScroll: true });
    if (focusNext.current === 'send') sendRef.current?.focus({ preventScroll: true });
    focusNext.current = null;
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Mock send: the demo's 0.8 s "Sending…", then the card moves on to "Reminded today".
  const remind = () => {
    if (sending) return;
    setSending(true);
    timer.current = window.setTimeout(() => {
      setSending(false);
      setSentAt(new Date().toISOString());
      onReminded(true);
      focusNext.current = 'undo';
      say(`Reminder sent to ${left} students`);
    }, 800);
  };
  // Undo the reminder (mock only, like the send).
  const undo = () => {
    setSentAt(null);
    onReminded(false);
    focusNext.current = 'send';
    say('Reminder undone');
  };

  const steps = Array.from({ length: needs.total }, (_, i) => i < needs.booked);
  const cls = `td-needs${sent ? ' td-sent' : ''}${canRemind ? '' : ' td-noact'}`;
  return (
    <section className={cls} aria-labelledby="td-nh">
      <div className="td-n-top">
        <h2 id="td-nh">{needs.title}</h2>
        {needs.dueOn ? (
          <span className="td-n-due" title={`Due ${fullDate(needs.dueOn)}`}>
            {dueWord(today, needs.dueOn)}
          </span>
        ) : null}
      </div>
      <div className="td-bk">
        <div className="rf-bar" role="img" aria-label={`${needs.booked} of ${needs.total} booked`} title={`${needs.booked} of ${needs.total} booked`}>
          {steps.map((on, i) => (
            <span key={i} className={on ? 'rf-on' : undefined} />
          ))}
        </div>
        {canRemind ? (
          <div className="td-bk-act">
            <button type="button" ref={sendRef} className="rf-btn rf-btn-gold" onClick={remind} disabled={sending}>
              <TdIcon name="send" />
              <span>{sending ? 'Sending…' : `Remind the ${left}`}</span>
            </button>
          </div>
        ) : null}
        <p className="td-bk-lab" role="status">
          <span className="td-la">
            <b>{left} to go</b>
          </span>
          <span className="td-lb">
            <span className="td-tick">
              <TdIcon name="check" />
            </span>
            Reminded today, {sentAt ? clock(sentAt) : ''}
            {canRemind ? (
              <>
                &nbsp;·&nbsp;
                <button type="button" ref={undoRef} className="rf-lnk" onClick={undo}>
                  Undo
                </button>
              </>
            ) : null}
          </span>
          {needs.unbooked.length > 0 ? (
            <button type="button" className="rf-lnk" aria-expanded={who} aria-controls="td-who" onClick={() => setWho((w) => !w)}>
              {who ? 'Hide names' : 'See who'}
              <TdIcon name="down" />
            </button>
          ) : null}
        </p>
      </div>
      {needs.suggestion ? (
        <Fold open={sent}>
          <p className="td-sugg">
            <TdIcon name="bell" />
            {needs.suggestion}
          </p>
        </Fold>
      ) : null}
      {needs.unbooked.length > 0 ? (
        <Fold open={who} id="td-who">
          <div className="td-who">
            <h3>Not booked yet</h3>
            <ul className="td-names">
              {needs.unbooked.map((s) => (
                <li key={s.id} className={s.name.length >= 24 ? 'td-long' : undefined}>
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        </Fold>
      ) : null}
    </section>
  );
}
