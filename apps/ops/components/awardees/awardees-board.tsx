'use client';

// The refreshed Awardees page (demo p-awardees, Ops Hub refresh): the title with the term or today's date, the news card
// (the one awardee who needs the person next), the current term (before the award: the meeting and the five steps that
// follow; after it: the awardees with their five steps, the one gold action and the detail beside the list on wide
// laptops, under the picked row below that), the term's total, and past awardees by term.
// Mock mode changes its own state, like the demo, and draws every demo behaviour (the reminder email included: nothing is
// sent). Live mode writes only through lib/actions/awardees.ts: ticks and unticks of steps 1, 2, 3 and 5 with the step
// control (optimistic, serialized per step; Undo is mock only), "Funds sent" (confirm first; it records a payment already
// made, never undone here) and "Record a reminder" (stores the date only; no email). A refused write drops its local value
// so the server's shows, and says "Couldn't save. Try again." in the detail; every settled refresh re-seeds from the server.
import '@/components/refresh/refresh.css';
import './awardees.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { sendReminder, setStepDone } from '@/lib/actions/awardees';
import { clock, shortDate } from '@/lib/refresh-time';
import {
  ALREADY_SENT_TEXT,
  AW_DO,
  AW_TITLES,
  alreadyMeans,
  amountLabel,
  amountWord,
  announcedWords,
  awardsSig,
  awMoney,
  chain,
  curStep,
  defaultPick,
  doneCount,
  firstName,
  mockClock,
  newsFor,
  pastTerms,
  pastTotalLabel,
  pendingWords,
  reseedErrs,
  rowLine,
  settleStep,
  stepSub,
  totalLabel,
  withOver,
  type AwErr,
  type Over,
} from '@/lib/awardees-map';
import type { AwAward, AwardeesView } from '@/lib/awardees-view';
import { AwBodySkel, AwHead } from './awardees-skeleton';
import { writeFunds, writeReminder, writeStep, type AwActions } from './awardees-writes';

type Props = { view: AwardeesView; live: boolean };

/** The words after a refused write. */
const SAVE_ERR = "Couldn't save. Try again.";
/** The words when a funds write never answered and the refresh does not show it saved (never invites a second payment). */
const UNCONFIRMED = "Couldn't confirm it saved. Reload and check Budget before trying again.";
/** The server actions live mode writes through. */
const ACTIONS: AwActions = { setStepDone, sendReminder };
/** Wide laptops: the detail sits beside the list. */
const WIDE_Q = '(min-width: 1240px)';

/** The line after an action ("Award letter sent saved 9:02 AM · Undo"): bold part, the rest, and what Undo puts back. */
type Moment = { b: string | null; rest: string; undo: { i: number; was: string | null } | null };

// The line after funds are marked sent: the demo's "$2,500 sent today, 9:02 AM" in mock; live says "marked sent" (the
// page records a payment already made; it moves no money).
function fundsMoment(a: AwAward, at: string, live: boolean): Moment {
  return { b: `${amountWord(a.amountCents)} ${live ? 'marked sent' : 'sent'}`, rest: ` today, ${at} · logged on Budget`, undo: null };
}
/** An open confirm: the reminder email (mock) or funds sent. */
type Confirm = { kind: 'remind' | 'funds'; id: string } | null;

// True on wide laptops (the detail beside the list); false on the server.
const isWide = () => typeof window !== 'undefined' && window.matchMedia(WIDE_Q).matches;
// True when the person asked the system for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The page.
export function AwardeesBoard({ view, live }: Props) {
  const router = useRouter();
  const { caps, today } = view;

  // Local changes over the server's (mock: the whole truth; live: optimistic until the refresh lands).
  const [over, setOver] = useState<Over>({});
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string | null>(() => defaultPick(view.awards));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [moment, setMoment] = useState<Record<string, Moment>>({});
  const [errs, setErrs] = useState<Record<string, AwErr>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [fundsBusy, setFundsBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [pastTerm, setPastTerm] = useState('all');
  const [wide, setWide] = useState(false);
  const [announce, setAnnounce] = useState('');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [mockPastFailed, setMockPastFailed] = useState(view.pastFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const loadFailed = live ? view.loadFailed : mockFailed;
  const pastFailed = live ? view.pastFailed : mockPastFailed;

  // Live writes still running, whether the server data predates a write, and the refresh once they settle. New server
  // data is taken in (the local changes dropped) only when nothing is running and no refresh is pending.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  // `refreshed`: a live refresh after writes has been asked for, so the next idle render re-seeds even when the server data
  // looks unchanged (a failed write's value must give way to the server's).
  const [refreshed, setRefreshed] = useState(false);
  const [seen, setSeen] = useState(view.awards);
  const idle = busy === 0 && !stale && !refreshing;
  if ((awardsSig(view.awards) !== awardsSig(seen) || refreshed) && idle) {
    setSeen(view.awards);
    setRefreshed(false);
    setOver({});
    setReminders({});
    // A save error goes once the server shows the write committed or that award changed; Undo never outlives a refresh.
    setErrs((e) => reseedErrs(e, seen, view.awards));
    setMoment((m) => Object.fromEntries(Object.entries(m).filter(([, x]) => x.undo == null)));
  }

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const seqs = useRef(new Map<string, number>());
  const failedOnce = useRef(new Set<string>());
  const actions = useRef(0);
  const focusK = useRef<string | null>(null);
  // Awards whose funds write never answered (a later "already sent" for them is this page's own earlier try).
  const fundsUnknown = useRef(new Set<string>());
  // The time shown for a funds write that is being checked.
  const fundsAt = useRef('');
  const scrollTo = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const awards = withOver(view.awards, over, reminders);
  const byId = (id: string) => awards.find((a) => a.id === id);
  const picked = pick ? byId(pick) : undefined;
  const news = loadFailed ? null : newsFor(awards, today, caps.remindEmail);

  // Follows the wide-laptop breakpoint (which copy of the detail is showing).
  useEffect(() => {
    const mq = window.matchMedia(WIDE_Q);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Clears every pending timer when the page goes.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Moves focus where the last action asked, in whichever copy of the detail is showing (side- on wide laptops, in-
  // under the row below that); the title when the target is gone, so focus never falls to the page body. Then scrolls
  // the detail into view when the news card asked for it.
  useEffect(() => {
    const root = rootRef.current;
    if (focusK.current && root) {
      const k = focusK.current.replace(/^(side|in)-/, `${isWide() ? 'side' : 'in'}-`);
      focusK.current = null;
      const el = root.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? root.querySelector<HTMLElement>('#aw-pt');
      el?.focus({ preventScroll: true });
    }
    if (scrollTo.current && root) {
      const t = isWide() ? root.querySelector('#aw-aside') : root.querySelector(`#aw-in-${scrollTo.current}`);
      scrollTo.current = null;
      t?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
  });

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  // Live "Try again": says "Awardees loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) say('Awardees loaded');
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // A funds write that timed out: once the refresh has landed, the server's step 4 says whether it saved (settled on the
  // next tick, outside the effect's own pass).
  useEffect(() => {
    if (!checking || !idle) return;
    const t = window.setTimeout(() => {
      const a = view.awards.find((x) => x.id === checking);
      setChecking(null);
      setFundsBusy(null);
      setConfirm(null);
      if (a?.done[3]) {
        setMoment((m) => ({ ...m, [a.id]: fundsMoment(a, fundsAt.current, live) }));
        say(`${amountWord(a.amountCents)} marked sent and logged on Budget`);
      } else {
        // Not shown as saved (or the refresh itself failed): the write may still have landed, so never invite a retry.
        setErrs((e) => ({ ...e, [checking]: { text: UNCONFIRMED, i: null, want: true, sticky: true } }));
        say(UNCONFIRMED);
      }
      focusK.current = 'side-sd3';
    }, 0);
    return () => window.clearTimeout(t);
  }, [checking, idle, view.awards, say, live]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // "9:02 AM": the real Eastern time in live mode; the demo's 9:00 AM plus two minutes per action in mock mode.
  const stamp = () => {
    actions.current += 1;
    return live ? clock(new Date().toISOString()) : mockClock(actions.current);
  };
  // The done time a tick stores locally: now (live), or noon on the sample day (mock).
  const nowValue = () => (live ? new Date().toISOString() : `${today}T12:00:00-05:00`);
  // Which copy of the detail the person is in: the side panel (wide laptops) or under the row.
  const where = () => (isWide() ? 'side' : 'in');

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
            if (live) {
              setRefreshed(true);
              router.refresh();
            }
          });
        }
      }, 0),
    );
    return next;
  };

  // Mock ?demo=failsave's stand-in write: the first try of each key fails after 600 ms, later tries work.
  const mockWrite = (k: string): Promise<boolean> =>
    new Promise((res) =>
      later(() => {
        const first = !failedOnce.current.has(k);
        failedOnce.current.add(k);
        res(!first);
      }, 600),
    );

  // Clears an award's save error.
  const clearErr = (id: string) =>
    setErrs((e) => {
      if (!(id in e)) return e;
      const n = { ...e };
      delete n[id];
      return n;
    });

  // Sends a step change to the database (live, or mock failsave). A refused newest write drops its local value, so the
  // server's shows (settleStep); an older write that fails is overtaken by the newer one.
  const persist = (a: AwAward, i: number, done: boolean) => {
    if (!live && !view.failFirst) return;
    const key = `${a.id}:${i}`;
    const seq = (seqs.current.get(key) ?? 0) + 1;
    seqs.current.set(key, seq);
    void enqueue(key, () => (live ? writeStep(ACTIONS, a.id, i, done) : mockWrite(key))).then((ok) => {
      if (ok || seqs.current.get(key) !== seq) return;
      const undoBtn = document.activeElement instanceof HTMLElement && document.activeElement.dataset.k?.endsWith('-undo');
      setOver((o) => settleStep(o, a.id, i, false, true));
      setMoment((m) => {
        const n = { ...m };
        delete n[a.id];
        return n;
      });
      setErrs((e) => ({ ...e, [a.id]: { text: SAVE_ERR, i, want: done } }));
      // Focus stays where the person is; only Undo, which disappears, hands it to the step's circle.
      if (undoBtn) focusK.current = `${where()}-sd${i}`;
      say(SAVE_ERR);
    });
  };

  // Ticks a step (not the funds step): drawn at once with "<step> saved 9:02 AM · Undo"; focus moves to Undo.
  const tick = (a: AwAward, i: number) => {
    if (!caps.tick || i === 3 || a.done[i]) return;
    const w = where();
    const was = a.done[i];
    setOver((o) => ({ ...o, [a.id]: { ...o[a.id], [i]: nowValue() } }));
    const at = stamp();
    setMoment((m) => ({ ...m, [a.id]: { b: AW_TITLES[i], rest: ` saved ${at}`, undo: caps.undo ? { i, was } : null } }));
    setConfirm(null);
    clearErr(a.id);
    focusK.current = caps.undo ? `${w}-undo` : `${w}-sd${i}`;
    say(`${AW_TITLES[i]}: done.${caps.undo ? ' Undo is available.' : ''}`);
    persist(a, i, true);
  };

  // Unticks a done step (never the funds step: it can't be undone here).
  const untick = (a: AwAward, i: number) => {
    if (!caps.tick || i === 3 || !a.done[i]) return;
    const w = where();
    const was = a.done[i];
    setOver((o) => ({ ...o, [a.id]: { ...o[a.id], [i]: null } }));
    const at = stamp();
    setMoment((m) => ({ ...m, [a.id]: { b: AW_TITLES[i], rest: ` marked not done, ${at}`, undo: caps.undo ? { i, was } : null } }));
    setConfirm(null);
    clearErr(a.id);
    focusK.current = `${w}-sd${i}`;
    say(`${AW_TITLES[i]}: marked not done.`);
    persist(a, i, false);
  };

  // Undo of the last tick or untick (mock only): the step goes back.
  const undo = (a: AwAward) => {
    const m = moment[a.id];
    if (!m?.undo || !caps.undo) return;
    const { i, was } = m.undo;
    setOver((o) => ({ ...o, [a.id]: { ...o[a.id], [i]: was } }));
    setMoment((x) => {
      const n = { ...x };
      delete n[a.id];
      return n;
    });
    clearErr(a.id);
    const after = { ...a, done: a.done.map((d, j) => (j === i ? was : d)) };
    focusK.current = `${where()}-sd${Math.max(0, curStep(after))}`;
    say('Undone');
    persist(a, i, was != null);
  };

  // Opens a confirm (the reminder email or funds sent); its first button takes focus.
  const openConfirm = (kind: 'remind' | 'funds', a: AwAward) => {
    if (kind === 'remind' ? !caps.remindEmail : !caps.funds) return;
    setConfirm({ kind, id: a.id });
    clearErr(a.id);
    focusK.current = `${where()}-${kind}Go`;
  };

  // "Back" on a confirm: it closes and the button that opened it takes focus.
  const back = () => {
    const kind = confirm?.kind ?? 'remind';
    setConfirm(null);
    focusK.current = `${where()}-${kind}`;
  };
  // Escape inside a confirm: the same as Back.
  const escBack = (e: { key: string; preventDefault: () => void }) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    back();
  };

  // "Email Renee" (mock only: nothing is sent): "Sending" for a moment, then "Reminder emailed to Renee today, 9:02 AM".
  const remindGo = (a: AwAward) => {
    if (!caps.remindEmail || sending) return;
    const w = where();
    setSending(a.id);
    later(() => {
      setReminders((r) => ({ ...r, [a.id]: nowValue() }));
      setConfirm(null);
      setSending(null);
      const at = stamp();
      setMoment((m) => ({ ...m, [a.id]: { b: null, rest: `Reminder emailed to ${firstName(a)} today, ${at}`, undo: null } }));
      focusK.current = `${w}-formback`;
      say(`Reminder emailed to ${a.name}`);
    }, 500);
  };

  // "Record a reminder" (live): stores today as the reminder date; emails nothing.
  const recordReminder = (a: AwAward) => {
    if (!caps.recordReminder) return;
    const was = a.reminder;
    const key = `${a.id}:reminder`;
    setReminders((r) => ({ ...r, [a.id]: nowValue() }));
    const at = stamp();
    setMoment((m) => ({ ...m, [a.id]: { b: null, rest: `Reminder recorded today, ${at}`, undo: null } }));
    clearErr(a.id);
    say('Reminder recorded');
    if (!live && !view.failFirst) return;
    const seq = (seqs.current.get(key) ?? 0) + 1;
    seqs.current.set(key, seq);
    void enqueue(key, () => (live ? writeReminder(ACTIONS, a.id) : mockWrite(key))).then((ok) => {
      if (ok || seqs.current.get(key) !== seq) return;
      setReminders((r) => {
        const n = { ...r };
        if (was) n[a.id] = was;
        else delete n[a.id];
        return n;
      });
      setMoment((m) => {
        const n = { ...m };
        delete n[a.id];
        return n;
      });
      setErrs((e) => ({ ...e, [a.id]: { text: SAVE_ERR, i: null, want: true } }));
      say(SAVE_ERR);
    });
  };

  // "Mark $2,500 sent" on the confirm: mock ticks at once; live waits for the database (money: no optimistic tick), and a
  // write that times out says it is checking until the refresh shows whether it saved.
  const fundsGo = (a: AwAward) => {
    if (!caps.funds || fundsBusy || a.done[3]) return;
    const w = where();
    const done = (at: string) => {
      setOver((o) => ({ ...o, [a.id]: { ...o[a.id], 3: nowValue() } }));
      setConfirm(null);
      setFundsBusy(null);
      setMoment((m) => ({ ...m, [a.id]: fundsMoment(a, at, live) }));
      focusK.current = `${w}-do`;
      say(`${amountWord(a.amountCents)} marked sent and logged on Budget`);
    };
    if (!live && !view.failFirst) {
      done(stamp());
      return;
    }
    setFundsBusy(a.id);
    clearErr(a.id);
    const key = `${a.id}:3`;
    const at = stamp();
    fundsAt.current = at;
    void enqueue(key, () => (live ? writeFunds(ACTIONS, a.id) : mockWrite(key).then((ok) => (ok ? { kind: 'saved' as const } : { kind: 'refused' as const, message: SAVE_ERR })))).then((r) => {
      if (r.kind === 'saved') return done(at);
      if (r.kind === 'already') {
        // This page's own earlier unanswered try logged it: saved. Otherwise someone else marked it: say so, never "today".
        if (alreadyMeans(fundsUnknown.current.has(a.id)) === 'saved') return done(at);
        setFundsBusy(null);
        setConfirm(null);
        setErrs((e) => ({ ...e, [a.id]: { text: ALREADY_SENT_TEXT, i: null, want: true, sticky: true } }));
        focusK.current = `${w}-sd3`;
        say(ALREADY_SENT_TEXT);
        return;
      }
      if (r.kind === 'refused') {
        setFundsBusy(null);
        setErrs((e) => ({ ...e, [a.id]: { text: r.message, i: 3, want: true } }));
        focusK.current = `${w}-fundsGo`;
        say(r.message);
        return;
      }
      fundsUnknown.current.add(a.id);
      setChecking(a.id);
      say('Checking whether it saved');
    });
  };

  // A row: on phones and mid laptops it opens or closes the detail under it; on wide laptops it fills the side panel.
  const pickRow = (id: string) => {
    setPick((p) => (p === id && !isWide() ? null : id));
    setConfirm(null);
    focusK.current = `row-${id}`;
  };

  // The news card: the awardee opens (Nudge also opens the reminder confirm) and the detail scrolls into view.
  const goNews = () => {
    if (!news) return;
    setPick(news.id);
    const a = byId(news.id);
    if (news.go === 'nudge' && a && caps.remindEmail) {
      setConfirm({ kind: 'remind', id: news.id });
      focusK.current = `${where()}-remindGo`;
    } else {
      // "Open": focus stays on the card (the demo), the detail scrolls into view.
      setConfirm(null);
    }
    scrollTo.current = news.id;
  };

  // "Try again" on a load error: mock shows the skeleton for 900 ms, then the page; live reloads the server data.
  const retry = (section: 'page' | 'past') => {
    if (live) {
      startRetry(() => router.refresh());
      return;
    }
    if (section === 'past') {
      setMockPastFailed(false);
      focusK.current = 'past-sel';
      say('Past awardees loaded');
      return;
    }
    setReloading(true);
    later(() => {
      setMockFailed(false);
      setReloading(false);
      say('Awardees loaded');
    }, 900);
  };

  const liveRegion = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (reloading || retrying) {
    return (
      <div className="rf aw" data-state="loading" aria-busy="true" ref={rootRef}>
        <h1 className="rf-sr">Awardees</h1>
        {liveRegion}
        <AwHead loading />
        <AwBodySkel />
      </div>
    );
  }

  const term = view.cycle?.term ?? '';
  const after = view.awards.length > 0;
  const pdate = after && !loadFailed ? shortDate(today) : term;

  // The gold action, the confirm and the moment for one awardee (`w`: which copy of the detail).
  const actionSection = (a: AwAward, w: 'side' | 'in') => {
    const c = curStep(a);
    const k = (s: string) => `${w}-${s}`;
    const m = moment[a.id];
    const err = errs[a.id];
    const mail = a.email ? (
      <a className="rf-lnk" href={`mailto:${a.email}`} data-k={k('mail')}>
        Call or email
      </a>
    ) : null;
    const momentLine = m ? (
      <p className="aw-moment">
        <span className="aw-tick" aria-hidden="true">
          <Icon name="check" />
        </span>
        {m.b ? <b>{m.b}</b> : null}
        {m.rest}
        {m.undo ? (
          <>
            &nbsp;·&nbsp;
            <button type="button" className="rf-lnk" data-k={k('undo')} onClick={() => undo(a)}>
              Undo
            </button>
          </>
        ) : null}
      </p>
    ) : null;
    const errLine = err ? (
      <p className="rf-saveerr aw-saveerr">
        <Icon name="alert" />
        {err.text}
      </p>
    ) : null;
    if (c < 0) {
      return (
        <div className="aw-dt-s">
          {momentLine}
          {m ? null : <p className="aw-vn aw-alldone">All five steps are done.</p>}
          {mail ? <div className="aw-act aw-gap">{mail}</div> : null}
        </div>
      );
    }
    let main: ReactNode = null;
    let conf: ReactNode = null;
    if (c === 1) {
      const formBack = (gold: boolean) => (
        <button type="button" className={gold ? 'rf-btn rf-btn-gold' : 'rf-lnk'} data-k={k('formback')} onClick={() => tick(a, 1)}>
          {gold ? <Icon name="check" /> : null}
          {gold ? <span>{AW_DO[1]}</span> : AW_DO[1]}
        </button>
      );
      if (caps.remindEmail) {
        main = (
          <>
            <button type="button" className="rf-btn rf-btn-gold" data-k={k('remind')} onClick={() => openConfirm('remind', a)}>
              <Icon name="send" />
              <span>Send another reminder</span>
            </button>
            {caps.tick ? formBack(false) : null}
          </>
        );
      } else if (caps.tick) {
        main = (
          <>
            {formBack(true)}
            {caps.recordReminder ? (
              <button type="button" className="rf-lnk" data-k={k('record')} onClick={() => recordReminder(a)}>
                Record a reminder
              </button>
            ) : null}
          </>
        );
      }
      if (confirm?.kind === 'remind' && confirm.id === a.id && caps.remindEmail) {
        const busyNow = sending === a.id;
        conf = (
          <div className="aw-confirm" role="group" aria-labelledby={k('cfR')} onKeyDown={escBack}>
            <h3 id={k('cfR')}>Email {firstName(a)} the acceptance form reminder?</h3>
            <p>The same reminder email again, with the link to the acceptance form in the Portal.</p>
            <p className="aw-to">To {a.email}</p>
            <div className="aw-cact">
              <button type="button" className="rf-btn rf-btn-gold" data-k={k('remindGo')} aria-disabled={busyNow || undefined} onClick={() => remindGo(a)}>
                <Icon name="send" />
                <span>{busyNow ? 'Sending' : `Email ${firstName(a)}`}</span>
              </button>
              <button type="button" className="rf-lnk" data-k={k('back')} onClick={back}>
                Back
              </button>
            </div>
          </div>
        );
      }
    } else if (c === 3) {
      const label = a.amountCents == null ? 'Mark funds sent' : `Mark ${awMoney(a.amountCents)} sent`;
      if (caps.funds) {
        main = (
          <button type="button" className="rf-btn rf-btn-gold" data-k={k('funds')} onClick={() => openConfirm('funds', a)}>
            <Icon name="money" />
            <span>{label}</span>
          </button>
        );
      }
      if (confirm?.kind === 'funds' && confirm.id === a.id && caps.funds) {
        const busyNow = fundsBusy === a.id;
        conf = (
          <div className="aw-confirm" role="group" aria-labelledby={k('cfF')} onKeyDown={busyNow ? undefined : escBack}>
            <h3 id={k('cfF')}>
              Mark {amountWord(a.amountCents)} sent to {a.name}?
            </h3>
            <p>
              This logs {amountWord(a.amountCents)} on Budget as the {a.award} payment.
            </p>
            {live ? <p>This records a payment you already made. It does not send money.</p> : null}
            <p className="aw-warn">It can&apos;t be undone here.</p>
            <div className="aw-cact">
              <button type="button" className="rf-btn rf-btn-gold" data-k={k('fundsGo')} aria-disabled={busyNow || undefined} onClick={() => fundsGo(a)}>
                <Icon name="money" />
                <span>{busyNow ? (checking === a.id ? 'Checking whether it saved…' : 'Saving…') : label}</span>
              </button>
              {busyNow ? null : (
                <button type="button" className="rf-lnk" data-k={k('back')} onClick={back}>
                  Back
                </button>
              )}
            </div>
            {errLine}
          </div>
        );
      }
    } else if (caps.tick) {
      main = (
        <button type="button" className="rf-btn rf-btn-gold" data-k={k('do')} onClick={() => tick(a, c)}>
          <Icon name="check" />
          <span>{AW_DO[c]}</span>
        </button>
      );
    }
    return (
      <div className="aw-dt-s">
        {conf ? null : (
          <div className="aw-act">
            {main}
            {mail}
          </div>
        )}
        {conf}
        {conf ? null : errLine}
        {momentLine}
      </div>
    );
  };

  // The detail: the name, the five steps (each a circle that ticks or unticks), the action, the comment (mock only).
  const detail = (a: AwAward, w: 'side' | 'in') => {
    const c = curStep(a);
    return (
      <div className="aw-dt">
        <div className="aw-dt-h">
          <h2>{a.name}</h2>
          <p className="aw-cd">{a.code}</p>
        </div>
        <div className="aw-dt-s aw-steps-s">
          <h3>Awardee steps · {doneCount(a)} of 5 done</h3>
          <ol className="aw-vs">
            {a.done.map((d, i) => {
              const locked = i === 3 && !!d;
              // The funds circle works only when funds are the step now (it opens the confirm there); before that it is
              // switched off with a reason, still reachable.
              const early = i === 3 && !d && caps.funds && caps.tick && i !== c;
              const can = caps.tick && (i === 3 ? !d && caps.funds && !early : true);
              const label = `Step ${i + 1}, ${AW_TITLES[i]}: ${d ? 'done' : 'not done'}`;
              const mark = d ? <Icon name="check" /> : i + 1;
              return (
                <li key={i} className={d ? 'aw-done' : i === c ? 'aw-now' : undefined}>
                  {can || locked || early ? (
                    <button
                      type="button"
                      className="aw-sd"
                      data-k={`${w}-sd${i}`}
                      aria-pressed={!!d}
                      aria-disabled={locked || !can || undefined}
                      aria-describedby={early ? `${w}-sd3-why` : undefined}
                      aria-label={label}
                      onClick={() => {
                        if (locked || !can) return;
                        if (d) untick(a, i);
                        else if (i === 3) openConfirm('funds', a);
                        else tick(a, i);
                      }}
                    >
                      {mark}
                    </button>
                  ) : (
                    <span className="aw-sd" role="img" aria-label={label}>
                      {mark}
                    </span>
                  )}
                  {early ? (
                    <span className="rf-sr" id={`${w}-sd3-why`}>
                      Mark the earlier steps first.
                    </span>
                  ) : null}
                  <span className="aw-tx">
                    <b>{AW_TITLES[i]}</b>
                    <span className="aw-vn">{stepSub(a, i, today, !caps.remindEmail)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        {actionSection(a, w)}
        {a.comment ? (
          <div className="aw-dt-s">
            <div className="aw-cmt">
              <span className="aw-av" aria-hidden="true">
                {a.comment.initials}
              </span>
              <div>
                <b>{a.comment.by}</b>
                <p>{a.comment.text}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // The row's follow-up line ("Funds · due Mon Dec 14").
  const followUp = (a: AwAward) => {
    const l = rowLine(a);
    if (l.kind === 'done') return <b>All five done</b>;
    if (l.kind === 'wait') {
      return (
        <span className="aw-wt">
          <Icon name="clock" />
          <span>
            <b>Acceptance form</b> · waiting
          </span>
        </span>
      );
    }
    if (l.kind === 'funds') {
      return l.due ? (
        <>
          <b>Funds</b> · due <span className="aw-nowrap">{l.due}</span>
        </>
      ) : (
        <>
          <b>Funds</b> next
        </>
      );
    }
    return (
      <>
        <b>{l.step}</b> next
      </>
    );
  };

  // One awardee's row (and, when picked, the detail under it below wide laptops).
  const row = (a: AwAward) => {
    const isPick = a.id === pick;
    const c = curStep(a);
    return (
      <div key={a.id} className={`aw-aw${isPick ? ' aw-pick' : ''}`}>
        <button type="button" className="aw-ah" data-k={`row-${a.id}`} aria-expanded={isPick} aria-controls={wide ? 'aw-aside' : isPick ? `aw-in-${a.id}` : undefined} onClick={() => pickRow(a.id)}>
          <span className={`aw-kt${a.kind === 'main' || c === 1 ? ' aw-gi' : ''}`} aria-hidden="true">
            <Icon name="award" />
          </span>
          <span className="aw-who">
            <span className="aw-nm">{a.name}</span>
            <span className="aw-cd">{a.code}</span>
          </span>
          <span className="aw-award">
            <span className="aw-tag">{a.award}</span>
            {a.note ? <span>{a.note}</span> : null}
          </span>
          <span className="aw-amt">{amountLabel(a.amountCents)}</span>
          <span className="aw-fu">
            <span className="aw-steps" role="img" aria-label={`${doneCount(a)} of 5 steps done`}>
              {a.done.map((d, i) => (
                <span key={i} className={d ? 'aw-on' : i === c ? 'aw-now' : undefined} />
              ))}
            </span>
            <span className="aw-fl">{followUp(a)}</span>
          </span>
        </button>
        {isPick ? (
          <div className="aw-inrow" id={`aw-in-${a.id}`}>
            {detail(a, 'in')}
          </div>
        ) : null}
      </div>
    );
  };

  // The current term after the award: the list, the total and the detail.
  const current = () => (
    <section className="aw-block" aria-labelledby="aw-cur-h">
      <div className="aw-sec-h">
        <h2 id="aw-cur-h">{term || 'This term'}</h2>
        <p>{announcedWords(view.cycle)}</p>
      </div>
      <div className="aw-work">
        <section className="aw-card" aria-label={`${term || 'This term'} awardees`}>
          <div className="aw-cols" aria-hidden="true">
            <span />
            <span>Awardee</span>
            <span>Award</span>
            <span>Amount</span>
            <span>Follow-up</span>
          </div>
          {awards.map(row)}
          <p className="aw-tot">
            <b>{totalLabel(awards)}</b>
            <span className="aw-mbar" aria-hidden="true">
              {awards.map((a) => (
                <span key={a.id} className={a.kind === 'extra' ? 'aw-x' : undefined} style={{ flex: a.amountCents ?? 0 }} />
              ))}
            </span>
          </p>
        </section>
        <aside className="aw-card aw-aside" id="aw-aside" aria-label="Awardee detail">
          {picked ? detail(picked, 'side') : null}
        </aside>
      </div>
    </section>
  );

  // The current term before the award: when the board chooses, when students hear, and the five steps that follow.
  const pending = () => {
    const c = view.cycle;
    if (!c) return null;
    const p = pendingWords(c);
    return (
      <section className="aw-block" aria-labelledby="aw-cur-h">
        <div className="aw-sec-h">
          <h2 id="aw-cur-h">{c.term}</h2>
          {c.mainAward ? (
            <p>
              {c.mainAward}
              {c.mainCents != null ? ` · ${awMoney(c.mainCents)}` : ''}
            </p>
          ) : null}
        </div>
        <div className="aw-card">
          <div className="aw-card-in aw-pending">
            <p className="aw-when">
              The board chooses at the selection meeting
              {p.meeting ? (
                <>
                  {' '}
                  at <b className="aw-nowrap">{p.meeting}</b>
                </>
              ) : null}
              .
              {p.hear ? (
                <>
                  {' '}
                  Students hear on <b className="aw-nowrap">{p.hear}</b>.
                </>
              ) : null}
            </p>
            <div>
              <p className="aw-hint">Then each awardee goes through five steps here</p>
              <ol className="aw-hsteps">
                {AW_TITLES.map((t) => (
                  <li key={t}>
                    <span className="aw-seg" />
                    <b>{t}</b>
                  </li>
                ))}
              </ol>
            </div>
            <p>
              <Link className="rf-lnk" href="/scholarships/selection" data-k="go-sel">
                <span>Open Selection</span>
                <Icon name="chev" />
              </Link>
            </p>
          </div>
        </div>
      </section>
    );
  };

  // Past awardees by term, with the term picker; or that section's own load error.
  const pastSection = () => {
    if (pastFailed) {
      return (
        <section className="aw-block" aria-labelledby="aw-past-h">
          <div className="aw-sec-h">
            <h2 id="aw-past-h">Past awardees</h2>
          </div>
          <div className="aw-card">
            <div className="aw-load-err" role="alert">
              <p>
                <Icon name="alert" />
                Past awardees didn&apos;t load.
              </p>
              <button type="button" className="rf-btn" data-k="past-retry" onClick={() => retry('past')}>
                Try again
              </button>
            </div>
          </div>
        </section>
      );
    }
    if (view.past.length === 0) return null;
    const terms = pastTerms(view.past);
    const shown = terms.filter((t) => pastTerm === 'all' || t.term === pastTerm);
    return (
      <section className="aw-block" aria-labelledby="aw-past-h">
        <div className="aw-sec-h">
          <h2 id="aw-past-h">Past awardees</h2>
        </div>
        <div className="aw-card">
          <div className="aw-pfil">
            <label className={`aw-fchip${pastTerm === 'all' ? '' : ' aw-on'}`}>
              <span className="aw-k">Term</span>
              <span className="aw-nowrap">{pastTerm === 'all' ? 'All past' : pastTerm}</span>
              <Icon name="down" />
              <select aria-label="Term" data-k="past-sel" value={pastTerm} onChange={(e) => {
                  setPastTerm(e.target.value);
                  focusK.current = 'past-sel';
                }}>
                <option value="all">All past ({view.past.length})</option>
                {terms.map((t) => (
                  <option key={t.term} value={t.term}>
                    {t.term} ({t.rows.length})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shown.map((t) => (
            <div key={t.term}>
              <div className="aw-term-h">
                <b>{t.term}</b>
                <span className="aw-mbar" aria-hidden="true">
                  {t.rows.map((p) => (
                    <span key={p.id} className={p.main ? undefined : 'aw-x'} style={{ flex: p.amountCents ?? 0 }} />
                  ))}
                </span>
                <span>{pastTotalLabel(t)}</span>
              </div>
              {t.rows.map((p) => (
                <div key={p.id} className="aw-pr">
                  <span className={`aw-kt${p.main ? ' aw-gi' : ''}`} aria-hidden="true">
                    <Icon name="award" />
                  </span>
                  <span className="aw-l">{p.label}</span>
                  <span className="aw-a">{p.award}</span>
                  <span className="aw-m">{amountLabel(p.amountCents)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const newsCard = news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.cta} gold={news.gold} onClick={goNews} /> : null;

  if (loadFailed) {
    return (
      <div className="rf aw" ref={rootRef}>
        {liveRegion}
        <AwHead pdate={term} />
        <section className="aw-card">
          <div className="aw-load-err" role="alert">
            <p>
              <Icon name="alert" />
              Awardees didn&apos;t load.
            </p>
            <button type="button" className="rf-btn" data-k="retry" onClick={() => retry('page')}>
              Try again
            </button>
          </div>
        </section>
      </div>
    );
  }

  const empty = !after && view.past.length === 0 && !pastFailed;
  return (
    <div className="rf aw" ref={rootRef}>
      {liveRegion}
      <AwHead pdate={pdate} news={newsCard} />
      {empty ? (
        <section className="aw-card">
          <div className="aw-none">
            <p>Awards show here once the board records them on Selection. Past awards entered for history show here too.</p>
            <Link className="rf-lnk" href="/scholarships/selection" data-k="go-sel">
              <span>Open Selection</span>
              <Icon name="chev" />
            </Link>
          </div>
        </section>
      ) : (
        <>
          {after ? current() : pending()}
          {pastSection()}
        </>
      )}
    </div>
  );
}
