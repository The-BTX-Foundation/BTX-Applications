'use client';

// The refreshed Newsletter page (demo p-newsletter, Ops Hub refresh 2026-11-12): the title, the news card (the section that
// is next, or "Ready to send"), the phone's Outreach links, the issue (its sections as a numbered checklist, the next one
// edged gold with its actions, the sending line, the facts) and the email preview (folded behind Show on the phone).
// Mock mode changes its own state, like the demo. Live mode writes ONE thing: a section's status (newsletter-writes.ts),
// optimistic, serialized per section, Undo writing the exact earlier status back; a refused write puts the section back
// and says "Couldn't save. Try again." in that row.
// NOTHING on this page sends the newsletter or emails anyone live: "Send to N subscribers", its confirm, "Nudge" and "Past
// issues" are drawn only when `caps` allows them, and the live loader never allows them (lib/newsletter-live.ts).
import '@/components/refresh/refresh.css';
import './newsletter.css';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Fold, foldMs, prefersReducedMotion } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { clock, fullDate, shortDate } from '@/lib/refresh-time';
import {
  allDone,
  chain,
  firstName,
  isDone,
  leftWords,
  mockClock,
  newsFor,
  nextSection,
  nudgeText,
  progress,
  reopenStatus,
  reseed,
  sectionsSig,
  sendLine,
  settleWrite,
  undoStatus,
  waitWord,
  withStatus,
  type NlSaveErr,
} from '@/lib/newsletter-map';
import type { NlOwner, NlSection, NlStatus, NlView } from '@/lib/newsletter-view';
import { NlBoardSkel, NlHead, NlSecnav } from './newsletter-skeleton';
import { setSectionStatus } from './newsletter-writes';

type Props = { view: NlView; live: boolean };

/** The words after a refused write. */
const SAVE_ERR = "Couldn't save. Try again.";

/** The last tick and what Undo puts back: the section, what the tick made it, the time, its status before, and its pin. */
type Recent = { id: string; done: boolean; at: string; was: NlStatus; wasPinned: boolean } | null;

// An owner with their initials circle (gold when it is the signed-in person); "No owner" with a dashed circle.
function Who({ owner }: { owner: NlOwner | null }) {
  if (!owner) {
    return (
      <span className="nl-who nl-none">
        <span className="nl-av" aria-hidden="true">
          ?
        </span>
        No owner
      </span>
    );
  }
  return (
    <span className={`nl-who${owner.mine ? ' nl-me' : ''}`}>
      <span className="nl-av" aria-hidden="true">
        {owner.initials}
      </span>
      {owner.name}
    </span>
  );
}

// The gold done tick.
const Tk = () => (
  <span className="nl-tk" aria-hidden="true">
    <Icon name="check" />
  </span>
);

// The page.
export function NewsletterBoard({ view, live }: Props) {
  const router = useRouter();
  const { caps, today, issue, facts } = view;

  // Local statuses laid over the server's sections (mock: the whole truth; live: optimistic until the refresh lands).
  const [over, setOver] = useState<Record<string, NlStatus>>({});
  // Mock sample only: the section pinned as next (the demo's `next: true`), cleared when it is ticked done.
  const [pinned, setPinned] = useState<string | null>(() => view.sections.find((s) => s.pinned)?.id ?? null);
  const [recent, setRecent] = useState<Recent>(null);
  // The refused write whose "Couldn't save" line shows (its section and the status it tried to save).
  const [err, setErr] = useState<NlSaveErr>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [ring, setRing] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  // Mock only: the nudge draft (which section, editing, its words, sending) and the nudges sent.
  const [nudgeId, setNudgeId] = useState<string | null>(null);
  const [nudgeShown, setNudgeShown] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [nSending, setNSending] = useState(false);
  const [nudged, setNudged] = useState<Record<string, string>>({});
  // Mock only: the send confirm, sending, and the time it was sent.
  const [confirm, setConfirm] = useState(false);
  const [confirmShown, setConfirmShown] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [pastNote, setPastNote] = useState(false);
  // The email preview: open on laptops, folded on the phone ('auto' = by the screen, so the server draws no flash).
  const [pv, setPv] = useState<'auto' | boolean>('auto');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const loadFailed = live ? view.loadFailed : mockFailed;

  // Live writes still running, whether the server data predates a write, and the refresh once they settle. New server
  // sections are taken in (the local statuses dropped) only when nothing is running and no refresh is pending.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [seenSig, setSeenSig] = useState(() => sectionsSig(view.sections));
  const sig = sectionsSig(view.sections);
  // Only data that actually arrived (a new signature) replaces the local statuses; a refresh that brought nothing new
  // leaves them. A "Couldn't save" whose write turns out to have committed goes away.
  if (sig !== seenSig && busy === 0 && !stale && !refreshing) {
    const next = reseed(view.sections, err);
    setSeenSig(sig);
    setOver(next.over);
    if (next.err !== err) setErr(next.err);
  }

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const seqs = useRef(new Map<string, number>());
  const failedOnce = useRef(new Set<string>());
  // The open status each section had before this page ticked it done (so an untick never clobbers 'writing').
  const prevOpen = useRef<Record<string, NlStatus>>({});
  const actions = useRef(0);
  const focusSel = useRef<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const sections = withStatus(view.sections, over);
  const nx = sentAt ? null : nextSection(sections, pinned, today);
  const { done, total } = progress(sections);
  const ready = allDone(sections);
  const news = loadFailed || !issue ? null : newsFor(sections, pinned, today, issue.previewTitle, sentAt != null);

  // Clears every pending timer when the page goes.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // The preview follows the screen again whenever it crosses the phone width (the demo's PHONE listener).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const sync = () => setPv('auto');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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

  // Each finished "Try again" (live: the refresh settled) counts once, so a retry that fails again is announced again and
  // focus lands on Try again (never on the page body).
  const [tries, setTries] = useState(0);
  const [wasRetrying, setWasRetrying] = useState(false);
  if (retrying !== wasRetrying) {
    setWasRetrying(retrying);
    if (!retrying) setTries((n) => n + 1);
  }

  // Live "Try again": says "Newsletter loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) {
      say('Newsletter loaded');
      rootRef.current?.querySelector<HTMLElement>('#nl-ih')?.focus({ preventScroll: true });
    }
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // The load error is read once through the page's one live region (the card itself carries no role).
  useEffect(() => {
    if (!loadFailed) return;
    const t = window.setTimeout(() => {
      say("Newsletter didn't load. Check your connection, then try again.");
      if (tries > 0) rootRef.current?.querySelector<HTMLElement>('[data-x="retry"]')?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadFailed, tries, say]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // "9:14 AM": the real Eastern time in live mode; the demo's 9:14 AM plus one minute per action in mock mode.
  const stamp = () => (live ? clock(new Date().toISOString()) : mockClock(actions.current++));

  // Lights a row for a moment.
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

  // Writes one section's status (live), or mock ?demo=failsave's stand-in (the first try of each section fails after 600 ms).
  const writeStatus = (id: string, status: NlStatus): Promise<boolean> => {
    if (live) return setSectionStatus(id, status);
    return new Promise((res) =>
      later(() => {
        const first = !failedOnce.current.has(id);
        failedOnce.current.add(id);
        res(!first);
      }, 600),
    );
  };

  // Sends a status to the database (live, or mock failsave). A refused write drops the local status so the server's value
  // wins; only the newest action on a section rolls back.
  const persist = (id: string, status: NlStatus, pinBefore: string | null) => {
    if (!live && !view.failFirst) return;
    const seq = (seqs.current.get(id) ?? 0) + 1;
    seqs.current.set(id, seq);
    void enqueue(`sec:${id}`, () => writeStatus(id, status)).then((ok) => {
      const newest = seqs.current.get(id) === seq;
      if (ok || !newest) return;
      const row = rootRef.current?.querySelector(`[data-row="${id}"]`);
      const hadFocus = row != null && (row.contains(document.activeElement) || rootRef.current?.querySelector('[data-x="undo"]') === document.activeElement);
      setOver((o) => settleWrite(o, id, ok, newest));
      setPinned(pinBefore);
      setRecent((r) => (r && r.id === id ? null : r));
      setErr({ id, status });
      // Focus stays where the person is; only a control that disappears (Undo, Mark done) hands it to the section's check.
      if (hadFocus) focusSel.current = [`[data-row="${id}"] .nl-check`];
      say(SAVE_ERR);
    });
  };

  // Ticks or unticks a section ("Mark done" ticks): drawn at once with "Marked done 9:14 AM · Undo"; focus moves to Undo.
  const setDone = (s: NlSection, v: boolean) => {
    if (!caps.tick || sentAt) return;
    const was = s.status;
    if (v && !isDone(s)) prevOpen.current[s.id] = s.status;
    const status: NlStatus = v ? 'done' : reopenStatus(prevOpen.current, s.id);
    const wasPinned = pinned === s.id;
    const pinBefore = pinned;
    if (v && wasPinned) setPinned(null);
    setOver((o) => ({ ...o, [s.id]: status }));
    setRecent({ id: s.id, done: v, at: stamp(), was, wasPinned });
    setErr((e) => (e?.id === s.id ? null : e));
    setPop(v ? s.id : null);
    flashRow(s.id);
    focusSel.current = caps.undo ? ['[data-x="undo"]', `[data-row="${s.id}"] .nl-check`] : [`[data-row="${s.id}"] .nl-check`];
    say(`${s.title}: ${v ? 'done' : 'not done'}`);
    persist(s.id, status, pinBefore);
  };

  // Undo of the last tick: the section goes back to its exact earlier status (live writes it), and its pin comes back.
  const undo = () => {
    const r = recent;
    if (!r) return;
    const s = sections.find((x) => x.id === r.id);
    setRecent(null);
    say('Undone');
    if (!s) return;
    const pinBefore = pinned;
    if (r.wasPinned) setPinned(r.id);
    const back = undoStatus(r);
    setOver((o) => ({ ...o, [r.id]: back }));
    setErr((e) => (e?.id === r.id ? null : e));
    focusSel.current = [`[data-row="${r.id}"] .nl-check`];
    flashRow(r.id);
    persist(r.id, back, pinBefore);
  };

  // "Nudge <first>" (mock only): opens or closes the drafted Board chat message; Send takes focus.
  const toggleNudge = (s: NlSection) => {
    if (!caps.nudge || !s.owner) return;
    if (nudgeId === s.id) {
      closeNudge(s.id, false);
      return;
    }
    setText((t) => t || nudgeText(s.owner!.name, issue?.month ?? null, issue?.sendOn ?? null, s.title));
    setNudgeShown(s.id);
    setNudgeId(s.id);
    later(() => rootRef.current?.querySelector<HTMLElement>('[data-x="nsend"]')?.focus({ preventScroll: true }), 30);
  };

  // Folds the draft away; after the fold, the draft is cleared and focus goes to Nudge (Cancel) or Mark done (Send).
  const closeNudge = (id: string, sent: boolean, owner?: string) => {
    setNudgeId(null);
    later(() => {
      setNudgeShown(null);
      setEditing(false);
      setText('');
      setNSending(false);
      if (sent) {
        setNudged((n) => ({ ...n, [id]: stamp() }));
        focusSel.current = ['[data-x="done"]'];
        say(`Nudge sent to ${owner}`);
      } else {
        focusSel.current = ['[data-x="nudge"]'];
      }
    }, foldMs());
  };

  // Send on the draft (mock only): "Sending…" for a moment, then the draft folds and "Nudged 9:15 AM" shows on the row.
  const sendNudge = (s: NlSection) => {
    if (!caps.nudge || nSending || !s.owner) return;
    const words = text.trim() || nudgeText(s.owner.name, issue?.month ?? null, issue?.sendOn ?? null, s.title);
    setText(words);
    setNSending(true);
    later(() => closeNudge(s.id, true, s.owner!.name), 450);
  };

  // "Send to N subscribers" (mock only, never live): opens the confirm; Back folds it; the confirm's Send "sends".
  const openConfirm = () => {
    if (!caps.send) return;
    setConfirmShown(true);
    setConfirm(true);
    later(() => rootRef.current?.querySelector<HTMLElement>('[data-x="sendgo"]')?.focus({ preventScroll: true }), 30);
  };
  const closeConfirm = () => {
    setConfirm(false);
    later(() => {
      setConfirmShown(false);
      focusSel.current = ['[data-x="send"]'];
    }, foldMs());
  };
  const sendIssue = () => {
    if (!caps.send || sending) return;
    setSending(true);
    later(() => {
      setConfirm(false);
      setConfirmShown(false);
      setSending(false);
      setSentAt(stamp());
      setRecent(null);
      focusSel.current = ['#nl-ih'];
      say(`Sent to ${facts.subscribers} subscribers`);
    }, 900);
  };

  // "See it" on the news card: the section (or the sending box) scrolls into view, rings gold for a moment, takes focus.
  const seeIt = (id: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(id === 'send' ? '.nl-send' : `[data-row="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setRing(null);
    window.requestAnimationFrame(() => setRing(id));
    later(() => setRing((r) => (r === id ? null : r)), 1800);
    el.focus({ preventScroll: true });
  };

  // "Past issues" (mock only): there is no past-issues screen yet.
  const past = () => {
    setPastNote(true);
    say('Past issues: not connected yet.');
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
      focusSel.current = ['#nl-ih'];
      say('Newsletter loaded');
    }, 900);
  };

  const liveRegion = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (reloading || retrying) {
    return (
      <div className="rf nl" data-state="loading" aria-busy="true" ref={rootRef}>
        <h1 className="rf-sr">Newsletter</h1>
        {liveRegion}
        <NlHead loading />
        <NlSecnav />
        <NlBoardSkel />
      </div>
    );
  }

  const pastLink = caps.pastIssues ? (
    <>
      <button type="button" className="rf-lnk nl-past" onClick={past}>
        Past issues
      </button>
      {pastNote ? <span className="nl-note">Past issues: not connected yet.</span> : null}
    </>
  ) : null;

  // The panel's load error (the demo's "Newsletter didn't load." card).
  if (loadFailed) {
    return (
      <div className="rf nl" ref={rootRef}>
        {liveRegion}
        <NlHead extra={pastLink} />
        <NlSecnav />
        <section className="nl-err">
          <p>
            <b>
              <Icon name="alert" />
              Newsletter didn&apos;t load.
            </b>
            <span>Check your connection, then try again.</span>
          </p>
          <button type="button" className="rf-btn" data-x="retry" onClick={retry}>
            Try again
          </button>
        </section>
      </div>
    );
  }

  // One section: the check, its line, title and meta, its actions (the next one only), the nudge draft and the moment line.
  const secRow = (s: NlSection, i: number) => {
    const num = i + 1;
    const isNext = nx != null && nx.id === s.id;
    const doneNow = isDone(s);
    const nudgeable = isNext && caps.nudge && s.owner != null && !s.owner.mine;
    const showMoment = recent != null && recent.id === s.id;
    const cls = `nl-sec${doneNow ? ' nl-done' : ''}${isNext ? ' nl-next' : ''}${flash === s.id ? ' nl-flash' : ''}${ring === s.id ? ' nl-ring' : ''}`;
    return [
      <div key={s.id} className={cls} data-row={s.id} tabIndex={-1}>
        {caps.tick ? (
          <button
            type="button"
            className={`nl-check${pop === s.id ? ' nl-pop' : ''}`}
            aria-pressed={doneNow}
            aria-label={`Done, section ${num}: ${s.title}`}
            disabled={sentAt != null}
            onClick={() => setDone(s, !doneNow)}
            onAnimationEnd={() => setPop(null)}
          >
            <span className="nl-num" aria-hidden="true">
              {num}
            </span>
            <Icon name="check" />
          </button>
        ) : (
          <span className={`nl-check nl-static${doneNow ? ' nl-on' : ''}`} aria-hidden="true">
            <span className="nl-num">{num}</span>
            <Icon name="check" />
          </span>
        )}
        <div className="nl-main">
          <span className="nl-eb">
            <span className="nl-st">Section {num}</span>
            {doneNow ? <span className="nl-kw">Done</span> : isNext ? <span className="nl-kw nl-isnext">Next</span> : null}
          </span>
          <span className="nl-t">{s.title}</span>
          <span className="nl-meta">
            <Who owner={s.owner} />
            {s.waits && !doneNow ? (
              <span className="nl-waiting" title={fullDate(s.waits)}>
                <Icon name="wait" />
                <span>
                  {s.waitNote ?? 'Can be written from'}
                  {s.waitNote ? ', ' : ' '}
                  <span className="rf-nowrap">{waitWord(today, s.waits)}</span>
                </span>
              </span>
            ) : null}
            {nudged[s.id] ? (
              <span className="nl-nudged">
                <Icon name="check" />
                Nudged {nudged[s.id]}
              </span>
            ) : null}
          </span>
          {err?.id === s.id ? (
            <span className="rf-saveerr nl-saveerr">
              <Icon name="alert" />
              {SAVE_ERR}
            </span>
          ) : null}
        </div>
        <div className="nl-sa">
          {isNext && caps.tick ? (
            <button type="button" className="rf-btn rf-btn-gold" data-x="done" onClick={() => setDone(s, true)}>
              <Icon name="check" />
              <span>Mark done</span>
            </button>
          ) : null}
          {nudgeable && !nudged[s.id] ? (
            <button type="button" className="nl-nudge" data-x="nudge" aria-expanded={nudgeId === s.id} onClick={() => toggleNudge(s)}>
              Nudge {firstName(s.owner!.name)}
            </button>
          ) : null}
        </div>
      </div>,
      nudgeable && nudgeShown === s.id ? (
        <Fold key={`${s.id}-n`} open={nudgeId === s.id} appear>
          <div className="nl-sub-in">
            <div
              className="nl-draft"
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                closeNudge(s.id, false);
              }}
            >
              <span className="nl-dl">
                To <span className="rf-nowrap">{s.owner!.name}</span> in Board chat
              </span>
              {editing ? (
                <textarea className="nl-dtext" rows={3} aria-label={`Message to ${s.owner!.name}`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              ) : (
                <p className="nl-dtext">{text}</p>
              )}
              <div className="nl-dact">
                <button type="button" className="rf-btn" data-x="nsend" disabled={nSending} onClick={() => sendNudge(s)}>
                  <Icon name="send" />
                  <span>{nSending ? 'Sending…' : 'Send'}</span>
                </button>
                <button type="button" className="rf-lnk" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="rf-lnk" onClick={() => closeNudge(s.id, false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Fold>
      ) : null,
      showMoment ? (
        <p key={`${s.id}-m`} className="nl-moment">
          <Tk />
          {recent.done ? 'Marked done' : 'Marked not done'} {recent.at}
          {caps.undo ? (
            <>
              &nbsp;·&nbsp;
              <button type="button" className="rf-lnk" data-x="undo" onClick={undo}>
                Undo
              </button>
            </>
          ) : null}
        </p>
      ) : null,
    ];
  };

  // The sending line under the sections. The send button and its confirm exist only when caps.send (mock): never live.
  const sendBox = () => {
    if (!total || !issue) return null;
    const subs = facts.subscribers ?? '';
    if (sentAt) {
      return (
        <div className="nl-send" tabIndex={-1}>
          <p className="nl-doneline">
            <Tk />
            <span>
              Sent to {subs} subscribers today, {sentAt}.
            </span>
          </p>
        </div>
      );
    }
    // A send day before today shows late ("Planned for Oct 30, passed"); live never promises a send from here.
    const line = sendLine(today, issue.sendOn, live, total - done);
    const lateTag = line.late ? (
      <span className="rf-late nl-late" title={issue.sendOn ? fullDate(issue.sendOn) : undefined}>
        {line.text}
      </span>
    ) : null;
    if (!ready && (line.late || live)) {
      return (
        <div className="nl-send">
          <p className="nl-sl">
            <Icon name="mail" />
            {lateTag ?? <span>{line.text}</span>}
          </p>
        </div>
      );
    }
    if (!ready) {
      return (
        <div className="nl-send">
          <p className="nl-sl">
            <Icon name="mail" />
            <span>
              Sends{' '}
              {issue.sendOn ? (
                <>
                  <span className="rf-nowrap" title={fullDate(issue.sendOn)}>
                    {shortDate(issue.sendOn)}
                  </span>{' '}
                </>
              ) : null}
              once the last {leftWords(total - done)} done
            </span>
          </p>
        </div>
      );
    }
    const cls = `nl-send nl-ready${ring === 'send' ? ' nl-ring' : ''}`;
    if (facts.subscribers === '0') {
      return (
        <div className={cls} tabIndex={-1}>
          <div className="nl-sr-top">
            <b>Every section is done</b>
          </div>
          <p className="nl-sl nl-ink">
            <Icon name="alert" />
            <span>No subscribers yet, so there is no one to send it to.</span>
          </p>
        </div>
      );
    }
    if (!caps.send) {
      // Live: nothing on this page may send the newsletter (owner rule 3b), so no send control is drawn.
      return (
        <div className={cls} tabIndex={-1}>
          <div className="nl-sr-top">
            <b>Every section is done</b>
            {lateTag}
          </div>
          <p className="nl-sl">
            <Icon name="mail" />
            <span>Sending from here is not connected yet.</span>
          </p>
        </div>
      );
    }
    return (
      <div className={cls} tabIndex={-1}>
        <div className="nl-sr-top">
          <b>Every section is done</b>
          {confirmShown ? null : (
            <button type="button" className="rf-btn rf-btn-gold" data-x="send" onClick={openConfirm}>
              <Icon name="send" />
              <span>Send to {subs} subscribers</span>
            </button>
          )}
        </div>
        {confirmShown ? (
          <Fold open={confirm} appear>
            <div
              className="nl-confirm"
              role="group"
              aria-label="Confirm sending"
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || sending) return;
                e.preventDefault();
                closeConfirm();
              }}
            >
              <p>
                This emails the {issue.month ? `${issue.month} issue` : 'issue'} to <b>{subs} subscribers</b>. Once sent, it can&apos;t be called back.
              </p>
              <dl>
                <dt>Subject</dt>
                <dd>{issue.previewTitle}</dd>
                <dt>To</dt>
                <dd>{subs} subscribers</dd>
                <dt>From</dt>
                <dd>{facts.tool}</dd>
              </dl>
              <div className="nl-dact">
                <button type="button" className="rf-btn rf-btn-gold" data-x="sendgo" disabled={sending} onClick={sendIssue}>
                  <Icon name="send" />
                  <span>{sending ? 'Sending…' : `Send to ${subs} subscribers`}</span>
                </button>
                <button type="button" className="rf-lnk" onClick={closeConfirm}>
                  Back
                </button>
              </div>
            </div>
          </Fold>
        ) : null}
      </div>
    );
  };

  const pvOpen = pv !== false;
  const pvCls = pv === 'auto' ? ' nl-pv-auto' : '';

  return (
    <div className="rf nl" ref={rootRef}>
      {liveRegion}
      <NlHead
        extra={pastLink}
        news={news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go="See it" gold={news.gold} onClick={() => seeIt(news.id)} /> : null}
      />
      <NlSecnav />
      <div className={`nl-board${issue ? '' : ' nl-solo'}`}>
        <section className="rf-panel nl-panel" aria-labelledby="nl-ih">
          <div className="rf-ph nl-ph">
            <h2 id="nl-ih" tabIndex={-1}>
              {issue ? issue.heading : 'Next issue'}
            </h2>
            {issue ? (
              <span className="nl-r" data-design-keep="Who owns the issue, drawn by the demo even when the issue has no sections yet">
                {total ? (
                  <>
                    <span className="nl-steps" role="img" aria-label={`${done} of ${total} sections done`}>
                      {sections.map((s) => (
                        <span key={s.id} className={isDone(s) ? 'nl-on' : undefined} />
                      ))}
                    </span>
                    <span>
                      <b>
                        {done} of {total}
                      </b>{' '}
                      done
                    </span>
                  </>
                ) : null}
                <Who owner={issue.owner} />
              </span>
            ) : null}
          </div>
          <div className="rf-pcard">
            <div className="nl-secs">
              {!issue ? (
                <div className="nl-empty">
                  <p>No issue planned yet.</p>
                </div>
              ) : total ? (
                sections.map(secRow)
              ) : (
                <div className="nl-empty">
                  <p>The {issue.month ? `${issue.month} issue` : 'issue'} has no sections yet.</p>
                </div>
              )}
            </div>
            {sendBox()}
            <p className="nl-facts">
              <span>
                Subscribers <b>{facts.subscribers ?? "Couldn't count"}</b>
              </span>
              <span>
                Last issue <b>{facts.lastIssue}</b>
              </span>
              <span>
                Sent from <b>{facts.tool}</b>
              </span>
            </p>
          </div>
        </section>

        {issue ? (
          <section className="rf-panel nl-panel nl-prev" aria-labelledby="nl-pvh">
            <div className="rf-ph nl-ph">
              <h2 id="nl-pvh">Email preview</h2>
              {/* Drawn only on the phone, where 'auto' means folded. */}
              <button type="button" className="rf-lnk nl-pv-tog" aria-expanded={pv === true} aria-controls="nl-pv" onClick={() => setPv(pv !== true)}>
                {pv === true ? 'Hide' : 'Show'}
                <Icon name="down" />
              </button>
            </div>
            <Fold open={pvOpen} className={`nl-pv${pvCls}`} id="nl-pv">
              <div className="nl-mail">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/btx-logo-on-light.webp" alt="The BTX Foundation" width={96} height={42} />
                <h3>{issue.previewTitle}</h3>
                {issue.intro ? (
                  <p className="nl-intro" data-design-keep="The issue's own opening line inside the email preview: newsletter content the demo draws, not an explainer">
                    {issue.intro}
                  </p>
                ) : null}
                <ul>
                  {sections.map((s) => (
                    <li key={s.id} className={isDone(s) ? undefined : 'nl-unwritten'}>
                      <b>{s.title}</b>
                      <span>{s.blurb}</span>
                    </li>
                  ))}
                </ul>
                <p className="nl-unsub">
                  You&apos;re receiving this because you support The BTX Foundation. <u>Unsubscribe</u>.
                </p>
              </div>
            </Fold>
          </section>
        ) : null}
      </div>
    </div>
  );
}
