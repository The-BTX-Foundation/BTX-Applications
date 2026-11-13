'use client';

// The refreshed Mentorship page (demo p-mentorship, Ops Hub refresh 2026-11-11): the title with the program's status, the
// news card (the step that is next), the phone's Programs links, "Where it stands" (the setup checklist as numbered steps,
// the step that is now tinted gold and holding its one action) and the Programs chat.
// Mock mode changes its own state, like the demo. Live mode writes one thing: a step's status (mentorship-writes.ts),
// optimistic, serialized per step, Undo writing back the exact status the step had before the tick (guarded: only while the
// row still holds what the tick set). A refused write drops the local tick so the server's value shows and says "Couldn't
// save. Try again." in that row; a missed Undo guard says "Changed by someone else" and refreshes. "Share the application" exists only in mock mode (there is no mentor application table).
import '@/components/refresh/refresh.css';
import './mentorship.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { clock } from '@/lib/refresh-time';
import { chain, headline, mockClock, newsFor, nextStep, progress, settleTick, shownStatus, statusFor, stepsSig, stepWord, withTicks, type MsWriteResult } from '@/lib/mentorship-map';
import type { MentorshipView, MsStep, TaskStatus } from '@/lib/mentorship-view';
import { MentorshipChat } from './mentorship-chat';
import { MsChatSkel, MsHead, MsListSkel, MsSecnav } from './mentorship-skeleton';
import { setStepStatus } from './mentorship-writes';

type Props = { view: MentorshipView; live: boolean };

/** The words after a refused write. */
const SAVE_ERR = "Couldn't save. Try again.";
/** The words after Undo found the step already changed by someone else (nothing was written). */
const CHANGED = 'Changed by someone else';

/**
 * The last action and what Undo puts back: a step's tick (its done value and exact status before the tick, and the status
 * the tick set, which Undo's write is guarded on), or the shared application.
 */
type Recent = { kind: 'step'; id: string; text: string; was: boolean; wasStatus: TaskStatus; setTo: TaskStatus } | { kind: 'share'; was: string | null } | null;

// True when the person asked the system for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// "Done 9:14 AM · Undo": the moment after an action, right where it happened.
function After({ text, undo, onUndo }: { text: string; undo: boolean; onUndo: () => void }) {
  return (
    <span className="ms-after">
      <span className="ms-tk" aria-hidden="true">
        <Icon name="check" />
      </span>
      {text}
      {undo ? (
        <>
          &nbsp;·&nbsp;
          <button type="button" className="rf-lnk" data-x="undo" onClick={onUndo}>
            Undo
          </button>
        </>
      ) : null}
    </span>
  );
}

// The page.
export function MentorshipBoard({ view, live }: Props) {
  const router = useRouter();
  const { caps, today } = view;

  // Local ticks laid over the server's steps (mock: the whole truth; live: optimistic until the refresh lands).
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [recent, setRecent] = useState<Recent>(null);
  const [shared, setShared] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const loadFailed = live ? view.loadFailed : mockFailed;

  // Live writes still running, whether the server data predates a write, and the refresh once they settle. New server
  // steps are taken in (the local ticks dropped) only when nothing is running and no refresh is pending.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [seenSig, setSeenSig] = useState(() => stepsSig(view.steps));
  const sig = stepsSig(view.steps);
  if (sig !== seenSig && busy === 0 && !stale && !refreshing) {
    setSeenSig(sig);
    setOver({});
    setErr(null);
  }

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const seqs = useRef(new Map<string, number>());
  const failedOnce = useRef(new Set<string>());
  const actions = useRef(0);
  const focusSel = useRef<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const steps = withTicks(view.steps, over);
  const nx = nextStep(steps);
  const { done, total } = progress(steps);
  const news = loadFailed ? null : newsFor(steps, shared != null, caps.share);
  const canAsk = caps.send && !view.chat.failed && view.chat.channelId != null;

  // Clears every pending timer when the page goes.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Moves focus where the last action asked (after the render that drew the target).
  useEffect(() => {
    if (!focusSel.current) return;
    const root = rootRef.current;
    const el = focusSel.current.map((s) => root?.querySelector<HTMLElement>(s)).find(Boolean);
    focusSel.current = null;
    el?.focus({ preventScroll: true });
  });

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  // Live "Try again": says "Loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) say('Loaded');
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // "9:14 AM": the real Eastern time in live mode; the demo's 9:14 AM plus one minute per action in mock mode.
  const stamp = () => (live ? clock(new Date().toISOString()) : mockClock(actions.current++));

  // Lights a row gold for a moment.
  const flashRow = (id: string) => {
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(id));
    later(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  // Runs a write after every earlier write on the same key, counting it as running until it settles. When the last one
  // settles, one refresh fetches fresh server data (live only).
  const enqueue = <T,>(k: string, write: () => Promise<T>): Promise<T> => {
    const next = chain(queue.current, k, write);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    void next.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(k) === next) queue.current.delete(k);
        running.current -= 1;
        setBusy((b) => b - 1);
        if (running.current === 0) {
          startRefresh(() => {
            setStale(false);
            if (live) router.refresh();
          });
        }
      }, 0),
    );
    return next;
  };

  // Writes one step's status (live, scoped to the loaded checklist; `expect` guards Undo), or mock ?demo=failsave's
  // stand-in (the first try of each step fails after 600 ms).
  const writeStep = (id: string, status: TaskStatus, expect?: TaskStatus): Promise<MsWriteResult> => {
    if (live) return view.checklistId ? setStepStatus({ id, checklistId: view.checklistId, status, expect }) : Promise.resolve('failed');
    return new Promise((res) =>
      later(() => {
        const first = !failedOnce.current.has(id);
        failedOnce.current.add(id);
        res(first ? 'failed' : 'ok');
      }, 600),
    );
  };

  // Sends a step status to the database (live, or mock failsave). Only the newest action on a step acts on the answer: a
  // refused write drops the local tick (the server's value shows) and says so in the row; a missed Undo guard says
  // "Changed by someone else". The refresh after the queue settles brings the server's value either way.
  const persist = (id: string, status: TaskStatus, expect?: TaskStatus) => {
    if (!live && !view.failFirst?.save) return;
    const seq = (seqs.current.get(id) ?? 0) + 1;
    seqs.current.set(id, seq);
    void enqueue(`step:${id}`, () => writeStep(id, status, expect)).then((res) => {
      const newest = seqs.current.get(id) === seq;
      if (res === 'ok' || !newest) return;
      const row = rootRef.current?.querySelector(`[data-row="${id}"]`);
      const hadFocus = row != null && row.contains(document.activeElement);
      const text = res === 'changed' ? CHANGED : SAVE_ERR;
      setOver((o) => settleTick(o, id, res, newest));
      setRecent((r) => (r && r.kind === 'step' && r.id === id ? null : r));
      setErr({ id, text });
      // Focus stays where the person is; only a control that disappears (Undo) hands it to the step's check.
      if (hadFocus) focusSel.current = [`[data-row="${id}"] .ms-check`];
      say(text);
    });
  };

  // Ticks or unticks a step: drawn at once with "Done 9:14 AM · Undo"; focus moves to Undo.
  const tick = (step: MsStep) => {
    if (!caps.tick || step.approval) return;
    const doneNow = !step.done;
    const after = withTicks(view.steps, { ...over, [step.id]: doneNow });
    setOver((o) => ({ ...o, [step.id]: doneNow }));
    const setTo = statusFor(step, doneNow);
    setRecent({ kind: 'step', id: step.id, text: `${doneNow ? 'Done' : 'Reopened'} ${stamp()}`, was: step.done, wasStatus: shownStatus(step), setTo });
    setErr((e) => (e?.id === step.id ? null : e));
    setPop(step.id);
    focusSel.current = caps.undo ? [`[data-row="${step.id}"] [data-x="undo"]`, `[data-row="${step.id}"] .ms-check`] : [`[data-row="${step.id}"] .ms-check`];
    say(doneNow ? `Step done. ${headline(after, shared != null, caps.share)}` : 'Step reopened');
    persist(step.id, setTo);
  };

  // Undo of the last action: a step goes back (live writes the exact status it had before the tick, guarded on the status
  // the tick set); the shared application is taken back.
  const undo = () => {
    const r = recent;
    if (!r) return;
    setRecent(null);
    say('Undone');
    if (r.kind === 'share') {
      setShared(r.was);
      focusSel.current = ['[data-x="share"]'];
      return;
    }
    if (!steps.some((x) => x.id === r.id)) return;
    setOver((o) => ({ ...o, [r.id]: r.was }));
    setErr((e) => (e?.id === r.id ? null : e));
    focusSel.current = [`[data-row="${r.id}"] .ms-check`];
    flashRow(r.id);
    persist(r.id, r.wasStatus, r.setTo);
  };

  // "Share the application" (mock only): "Sharing…" for a moment, then "Application shared today, 9:14 AM · Undo".
  const share = () => {
    if (!caps.share || sharing) return;
    setSharing(true);
    later(() => {
      const was = shared;
      setShared(`today, ${stamp()}`);
      setRecent({ kind: 'share', was });
      setSharing(false);
      focusSel.current = ['[data-x="undo"]'];
      say('Mentor application shared');
    }, 600);
  };

  // "See it" on the news card: the step scrolls into view, lights up, and its check takes focus.
  const seeStep = (id: string) => {
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-row="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashRow(id);
    row.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
  };

  // "Ask in Programs chat" (no steps yet): the reply box scrolls into view and takes focus.
  const ask = () => {
    const el = document.getElementById('ms-reply-in');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };

  // "Try again" on the load error: mock shows the skeleton for 900 ms, then the page; live reloads the server data.
  const retry = () => {
    if (live) {
      startRetry(() => router.refresh());
      return;
    }
    setReloading(true);
    later(() => {
      setMockFailed(false);
      setReloading(false);
      say('Loaded');
    }, 900);
  };

  const live_ = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (reloading || retrying) {
    return (
      <div className="rf ms" data-state="loading" aria-busy="true" ref={rootRef}>
        <h1 className="rf-sr">Mentorship</h1>
        {live_}
        <MsHead loading />
        <MsSecnav />
        <div className="rf-board ms-board">
          <div className="rf-col">
            <MsListSkel />
          </div>
          <div className="rf-col">
            <MsChatSkel />
          </div>
        </div>
      </div>
    );
  }

  // One step's row (the now step wraps it in the gold band with its action under it).
  const stepRow = (s: MsStep, i: number) => {
    const isNow = s === nx;
    const word = stepWord(s, isNow, today);
    const r = recent;
    const afterText = r && r.kind === 'step' && r.id === s.id ? r.text : null;
    const meta =
      (s.unassigned && !s.done) || (s.sub && !s.done) || afterText != null || s.approval || err?.id === s.id ? (
        <span className="ms-meta">
          {s.unassigned && !s.done ? (
            <span className="ms-who">
              <span className="ms-ini" aria-hidden="true" />
              No owner
            </span>
          ) : null}
          {s.sub && !s.done ? <span>{s.sub}</span> : null}
          {s.approval ? (
            <Link className="rf-lnk" href="/finance/budget/approval">
              Review
            </Link>
          ) : null}
          {afterText != null ? <After text={afterText} undo={caps.undo} onUndo={undo} /> : null}
        </span>
      ) : null;
    const row = (
      <div className={`ms-row${s.done ? ' ms-done' : ''}${isNow ? ' ms-is-now' : ''}${flash === s.id ? ' ms-flash' : ''}`} data-row={s.id}>
        {s.approval || !caps.tick ? (
          <span className={`ms-check ms-static${s.done ? ' ms-on' : ''}`} aria-hidden="true">
            <span className="ms-num">{i + 1}</span>
            <Icon name="check" />
          </span>
        ) : (
          <button
            type="button"
            className={`ms-check${pop === s.id ? ' ms-pop' : ''}`}
            aria-pressed={s.done}
            aria-label={`Done, step ${i + 1}: ${s.title}`}
            onClick={() => tick(s)}
            onAnimationEnd={() => setPop(null)}
          >
            <span className="ms-num" aria-hidden="true">
              {i + 1}
            </span>
            <Icon name="check" />
          </button>
        )}
        <div className="ms-main">
          <span className="ms-eb">
            <span className="ms-st">Step {i + 1}</span>
            <span className={`ms-due${word.muted ? ' ms-muted' : ''}`} title={word.title}>
              {word.text}
            </span>
          </span>
          <span className="ms-t">{s.title}</span>
          {meta}
          {err?.id === s.id ? (
            <span className="rf-saveerr ms-saveerr">
              <Icon name="alert" />
              {err.text}
            </span>
          ) : null}
        </div>
      </div>
    );
    if (!isNow) return <li key={s.id}>{row}</li>;
    if (!s.share || !caps.share) {
      return (
        <li key={s.id}>
          <div className="ms-now">{row}</div>
        </li>
      );
    }
    return (
      <li key={s.id}>
        <div className="ms-now">
          {row}
          <div className="ms-now-in">
            <p className="ms-share-row">
              {shared != null ? (
                <After text={`Application shared ${shared}`} undo={r?.kind === 'share'} onUndo={undo} />
              ) : (
                <button type="button" className="rf-btn rf-btn-gold" data-x="share" disabled={sharing} onClick={share}>
                  <Icon name="share" />
                  <span>{sharing ? 'Sharing…' : 'Share the application'}</span>
                </button>
              )}
            </p>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="rf ms" ref={rootRef}>
      {live_}
      <MsHead status={view.status} news={news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go="See it" gold={news.gold} onClick={() => seeStep(news.id)} /> : null} />
      <MsSecnav />
      <div className={`rf-board ms-board${loadFailed ? ' ms-solo' : ''}`}>
        <div className="rf-col">
          <section className="rf-panel ms-panel" aria-labelledby={loadFailed ? undefined : 'ms-lh'} aria-label={loadFailed ? 'Where it stands' : undefined}>
            {loadFailed ? (
              <div className="rf-pcard">
                <div className="ms-err" role="alert">
                  <div>
                    <b>Mentorship program didn&apos;t load.</b>
                    <p>Check your connection, then try again.</p>
                  </div>
                  <button type="button" className="rf-btn" onClick={retry}>
                    <Icon name="refresh" />
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rf-ph ms-ph">
                  <h2 id="ms-lh">Where it stands</h2>
                  {total ? (
                    <span className="ms-prog">
                      <span className="ms-bar" role="img" aria-label={`${done} of ${total} steps done`}>
                        {steps.map((s) => (
                          <span key={s.id} className={s.done ? 'ms-on' : s === nx ? 'ms-cur' : ''} />
                        ))}
                      </span>
                      <b>
                        {done} of {total}
                      </b>
                    </span>
                  ) : null}
                </div>
                <div className="rf-pcard">
                  {total ? (
                    <ul className="ms-items">{steps.map(stepRow)}</ul>
                  ) : (
                    <p className="ms-none">
                      No steps yet.
                      {canAsk ? (
                        <button type="button" className="rf-lnk" onClick={ask}>
                          Ask in Programs chat
                        </button>
                      ) : null}
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
        {loadFailed ? null : (
          <div className="rf-col">
            <MentorshipChat chat={view.chat} me={view.me} canSend={caps.send} live={live} failSend={!live && !!view.failFirst?.send} stamp={stamp} say={say} enqueue={enqueue} />
          </div>
        )}
      </div>
    </div>
  );
}
