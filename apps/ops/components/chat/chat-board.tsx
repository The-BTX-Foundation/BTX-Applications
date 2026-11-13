'use client';

// Board chat (Ops Hub refresh; demo apps/design/ops-refresh/directions/p-chat). One window: the channel list (All areas,
// the four areas, Direct), the thread with day dividers and the "N new" line, the Pinned list (its own column on wide
// laptops, a fold under the thread head below 1360px) and the composer with "Post to" in All areas. Phone: a channel
// picker opens the channels as a sheet, search opens under it, and the composer rides above the keyboard.
// Mock mode keeps every change in this component (the demo's behaviour). Live mode writes through lib/chat-actions.ts:
// send (then the push call), open a direct conversation on its first message, and mark channels read when they open.
// Only what `caps` allows is drawn or written.
import '@/components/refresh/refresh.css';
import './chat.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Icon, type IconName } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { StateLine } from '@/components/refresh/state-line';
import { Fold, isPhone } from '@/components/refresh/fold';
import { clock } from '@/lib/refresh-time';
import { markRead, openDirect, postMessage, sendBudget } from '@/lib/chat-actions';
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
import {
  ALL,
  afterStart,
  bodyParts,
  buildThread,
  countLabel,
  dayTitle,
  inView,
  draftFor,
  laterStamps,
  markReadLocal,
  markStamps,
  matches,
  newestServerAt,
  newFromOthers,
  newMessageId,
  nextUp,
  readStamps,
  splitFor,
  totalUnread,
  unreadOf,
  viewCapped,
  viewIds,
  viewScope,
  viewStart,
  type Stamps,
} from '@/lib/chat-map';
import type { ChatChannel, ChatMessage, ChatView } from '@/lib/chat-view';
import { ChatWinSkeleton } from './chat-skeleton';

/** The area channels' marks, by areas.slug. */
const AREA_ICON: Record<string, IconName> = { scholarships: 'cap', money: 'money', programs: 'flag', outreach: 'mega' };
/** How long "Sent 9:14 AM · Undo" stays under a sent message. */
const SENT_MS = 6000;

/** `failSend`: mock mode's ?demo=failsend (every send fails after ~600 ms; its Retry saves). Never set in live mode. */
type Props = { view: ChatView; live: boolean; failSend?: boolean };
type Divider = { firstId: string; count: number } | null;
type Scroll = 'divider' | 'end' | 'keep' | null;

// A message's text, drawn: bold parts, names/codes/amounts that never break, web addresses that may break after a slash.
function Body({ text, names }: { text: string; names: string[] }) {
  return (
    <>
      {bodyParts(text, names).map((p, i) => {
        let el: React.ReactNode = p.text;
        if (p.kind === 'nowrap') el = <span className="rf-nowrap">{p.text}</span>;
        if (p.kind === 'url')
          el = p.text.split(/(?<=\/)/).map((piece, k) => (
            <Fragment key={k}>
              {k ? <wbr /> : null}
              {piece}
            </Fragment>
          ));
        return p.bold ? <b key={i}>{el}</b> : <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

// The page.
export function ChatBoard({ view, live, failSend = false }: Props) {
  const router = useRouter();
  const { caps, me, today } = view;
  // The store outside the board (Not-sent rows, drafts) belongs to one person: a board drawn for someone else empties it
  // first, so nobody sees or retries another person's words. The same person drawn again keeps everything.
  claimChatStore(me.userId);
  const [channels, setChannels] = useState<ChatChannel[]>(view.channels);
  const [messages, setMessages] = useState<ChatMessage[]>(view.messages);
  // Live writes still running, whether the server data on hand predates a write, and the refresh after the writes settle.
  // New server data is taken in only when no write is running, the data is not stale and no refresh is pending.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sig = `${view.channels.map((c) => `${c.key}:${c.id}:${c.lastReadAt}:${c.unreadExtra}`).join('|')}#${view.messages.map((m) => m.id).join('|')}`;
  const [seenSig, setSeenSig] = useState(sig);
  // Bumped when a refresh brings messages from others: the thread then follows to the newest one if the reader was near
  // the bottom (within 80px), and otherwise stays where it is.
  const [jump, setJump] = useState(0);
  // The server's `now` that came with the messages on hand (it moves with them, never ahead of them): read stamps cap at it.
  const [seenNow, setSeenNow] = useState(view.now);
  if (sig !== seenSig && busy === 0 && !stale && !refreshing) {
    setSeenSig(sig);
    setSeenNow(view.now);
    if (newFromOthers(messages, view.messages, me.userId)) setJump((j) => j + 1);
    setChannels(view.channels);
    setMessages(view.messages);
  }
  const [sel, setSel] = useState<string>(ALL);
  // The "N new" line is worked out when a view opens (before it is marked read), so it stays while you read.
  // All areas with a capped channel counts only what it shows (see viewScope).
  const [divider, setDivider] = useState<Divider>(() => {
    const sc = viewScope(view.channels, view.messages, view.capped, viewIds(view.channels, ALL), true, me.userId);
    return splitFor(view.channels, sc.messages, sc.ids, me.userId);
  });
  const [search, setSearch] = useState('');
  // One draft per view (All areas, each area, each direct conversation): text never moves to another view by switching.
  // Kept in the outside store, so a board drawn anew (a failed refresh changes the page) keeps what was typed.
  const drafts = useSyncExternalStore(subscribeUnsent, () => draftsSnapshot(me.userId), draftsServerSnapshot);
  const draft = draftFor(drafts, sel);
  // Sets this view's draft (an empty one is dropped).
  const setDraft = (text: string) => setStoreDraft(me.userId, sel, text);
  const areas = channels.filter((c) => c.kind === 'area');
  const directs = channels.filter((c) => c.kind === 'direct');
  const [postTo, setPostTo] = useState<string>(() => {
    const a = view.channels.filter((c) => c.kind === 'area');
    return (a.find((c) => c.area === 'scholarships') ?? a[0])?.key ?? '';
  });
  const [pinsOpen, setPinsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const [recent, setRecent] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [kb, setKb] = useState(false);
  const [retrying, startRetry] = useTransition();
  // Live sends waiting on the database: the targets whose composer is locked ("Sending…").
  const [sending, setSending] = useState<string[]>([]);
  // Live messages that did not save ("Not sent" rows), kept outside the board so they survive it being drawn anew.
  const unsent = useSyncExternalStore(subscribeUnsent, () => unsentSnapshot(me.userId), unsentServerSnapshot);

  const minute = useRef(0); // mock clock: minutes after view.now (the demo's 9:14, 9:15 ...)
  const seq = useRef(0);
  const mockTried = useRef(new Set<string>()); // ?demo=failsend: message ids whose first (failing) try has run
  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const recentTimer = useRef(0);
  const scrollMode = useRef<Scroll>('divider');
  const stick = useRef(false);
  const near = useRef(true); // the reader is within 80px of the newest message
  const sheetRef = useRef<HTMLElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const qOpenRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLInputElement>(null);

  const names = useMemo(() => new Map(view.people.map((p) => [p.userId, p.displayName])), [view.people]);
  const nameList = useMemo(() => view.people.map((p) => p.displayName), [view.people]);
  const initials = useMemo(() => new Map(view.people.map((p) => [p.userId, p.initials])), [view.people]);
  const current = sel === ALL ? null : (channels.find((c) => c.key === sel) ?? null);
  const title = current ? current.name : 'All areas';
  const peopleCount = current ? current.people : (areas[0]?.people ?? 0);
  // Where the composer sends: the open channel, or the "Post to" area in All areas.
  const targetKey = current?.key ?? postTo;
  // A refresh that shows a Not-sent row's id saved drops the row: it is simply the real message now.
  useEffect(() => {
    dropUnsent(me.userId, view.messages.map((m) => m.id));
  }, [view.messages, me.userId]);

  /* ---------- small helpers ---------- */

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);
  // Mock mode's clock for new messages and read markers: the demo's 9:14 AM, then a minute per send. Live mode never
  // stamps from the browser's clock (read times come from loaded messages, the server's `now` or the saved message).
  const mockNow = () => new Date(Date.parse(view.now) + minute.current * 60_000).toISOString();
  // Runs a live write after every earlier write with the same key, counting it as running until it settles; when the
  // last one settles, one refresh fetches fresh server data (the sidebar's unread count follows).
  const enqueue = <T,>(key: string, write: () => Promise<T>): Promise<T> => {
    const prev = queue.current.get(key) ?? Promise.resolve();
    const next = prev.then(write, write);
    queue.current.set(key, next);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    // One tick later, so the caller's own .then (rollback or not) has run first.
    void next.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(key) === next) queue.current.delete(key);
        running.current -= 1;
        setBusy((b) => b - 1);
        if (running.current === 0) {
          startRefresh(() => {
            setStale(false);
            router.refresh();
          });
        }
      }, 0),
    );
    return next;
  };

  /* ---------- reading: opening a view works out its "N new" line first, then marks it read ---------- */

  // Marks channels read here at their own stamps, and live in chat_read_markers (put back as they were if the database
  // says no). A stamp never moves a marker backwards.
  function markViewRead(stamps: Stamps) {
    const ids = Object.keys(stamps);
    if (!ids.length) return;
    const write = laterStamps(channels, stamps);
    // What the markers were, taken from the latest list (this can run from a send that finished later).
    let before = new Map<string, ChatChannel>();
    setChannels((cs) => {
      before = new Map(cs.filter((c) => c.id && ids.includes(c.id)).map((c) => [c.id as string, c]));
      return markStamps(cs, laterStamps(cs, stamps));
    });
    if (!live || !caps.markRead) return;
    void enqueue('read', () => markRead(write, me.userId)).then((ok) => {
      if (ok) return;
      // The markers did not save: the counts come back (the server still counts these as unread). No error line: the
      // person did not ask to save anything, and the next open tries again.
      setChannels((cs) => cs.map((c) => (c.id && before.has(c.id) ? { ...c, lastReadAt: before.get(c.id)!.lastReadAt, unreadExtra: before.get(c.id)!.unreadExtra } : c)));
    });
  }

  // Opens a view (All areas, an area or a direct conversation). Its own draft shows in the box.
  function open(key: string) {
    setSearch('');
    // All areas with a capped channel reads only what it shows, and marks read only the channels with no unread message
    // hidden before its start (the others keep their badges).
    const sc = viewScope(channels, messages, view.capped, viewIds(channels, key), key === ALL, me.userId);
    setDivider(splitFor(channels, sc.messages, sc.ids, me.userId));
    setSel(key);
    scrollMode.current = 'divider';
    // Live: each channel up to its newest shown server message (or the server's time that came with these messages),
    // never past that time plus the grace; mock: the demo's clock.
    const at = mockNow();
    markViewRead(live ? readStamps(channels, sc.messages, sc.stampIds, seenNow) : Object.fromEntries(sc.stampIds.map((id) => [id, at])));
  }

  // The channels a send from this view may mark read: in All areas only those with no unread message hidden before the
  // view's start (see viewScope); in any other view, its own channel.
  const sendReadIds = (): string[] =>
    sel === ALL ? viewScope(channels, messages, view.capped, viewIds(channels, ALL), true, me.userId).stampIds : viewIds(channels, sel);

  /* ---------- sending: lands at the bottom with "Sent 9:14 AM · Undo"; the news card moves on ---------- */

  // Adds a message at the bottom of the thread (with the one-time flash) and keeps the newest message in view. The box
  // gets focus back only if focus is still in the thread or the composer (not if the person moved to search or the sheet).
  function land(msg: ChatMessage) {
    setMessages((ms) => (ms.some((m) => m.id === msg.id) ? ms : [...ms, msg]));
    setFlash(msg.id);
    scrollMode.current = 'end';
    const at = document.activeElement;
    if (at === document.body || compRef.current?.contains(at) || msgsRef.current?.contains(at)) draftRef.current?.focus({ preventScroll: true });
  }

  // Shows "Sent 9:14 AM" under a saved message for a few seconds and says "Sent to <target>" (the one live region).
  function showSent(id: string, targetName: string) {
    setRecent(id);
    window.clearTimeout(recentTimer.current);
    recentTimer.current = window.setTimeout(() => {
      scrollMode.current = 'keep';
      setRecent(null);
    }, SENT_MS);
    say(`Sent to ${targetName}`);
  }

  // Live: the channel to post in, opening the direct conversation on its first message (within the send's budget).
  async function channelFor(target: ChatChannel, signal: AbortSignal): Promise<string> {
    if (target.id) return target.id;
    const known = channels.find((c) => c.key === target.key)?.id;
    if (known) return known;
    if (!live) {
      // Mock (?demo=failsend): a new direct conversation takes its list key as its id, as the plain mock send does.
      setChannels((cs) => cs.map((c) => (c.key === target.key ? { ...c, id: target.key } : c)));
      return target.key;
    }
    if (!caps.openDirect || !target.otherUserId) throw new Error('no channel');
    // The first message to someone opens the direct conversation (or finds it, if it exists already).
    const opened = await openDirect(target.otherUserId, signal);
    setChannels((cs) => cs.map((c) => (c.key === target.key ? { ...c, id: opened } : c)));
    return opened;
  }

  // Sends the draft to the open channel (or, in All areas, to the "Post to" area).
  function send() {
    const text = draft.trim();
    if (!text) {
      draftRef.current?.focus();
      return;
    }
    if (!caps.send) return;
    const target = current ?? areas.find((c) => c.key === postTo) ?? null;
    if (!target) return;
    // One send at a time per target: its composer stays locked ("Sending…") until the database answers.
    if (sending.includes(target.key)) return;

    if (!live && !failSend) {
      // Mock: the message lands at the demo's clock and the views it was sent from are read up to it.
      const readIds = sendReadIds();
      const at = mockNow();
      minute.current = Math.min(45, minute.current + 1);
      const msg: ChatMessage = { id: `n${++seq.current}`, channelId: target.id ?? target.key, authorId: me.userId, isBot: false, body: text, taskId: null, createdAt: at };
      if (!target.id) setChannels((cs) => cs.map((c) => (c.key === target.key ? { ...c, id: target.key } : c)));
      setChannels((cs) => markReadLocal(cs, sel === ALL ? readIds : [...readIds, msg.channelId], at));
      setDraft('');
      land(msg);
      showSent(msg.id, target.name);
      return;
    }

    // Live. This view's box clears and the target's composer locks before the write is queued, so a second press cannot
    // post the same words twice; anything typed while it waits stays in the box. Every new send gets a new id.
    const tk = target.key;
    const id = newMessageId();
    // After it saves, the target is read only up to the newest server message already loaded in it now (never past
    // messages that arrive later and have not been seen; your own message never counts as unread).
    // In All areas a target with an unread message hidden before the view's start is not marked read at all.
    const readUpTo = target.id && (sel !== ALL || sendReadIds().includes(target.id)) ? newestServerAt(messages, target.id, seenNow) : null;
    setDraft('');
    setSending((s) => [...s, tk]);
    say('Sending…');
    void deliver(target, text, id, true).then(
      (cid) => {
        if (readUpTo) markViewRead({ [cid]: readUpTo });
      },
      () => undefined,
    );
  }

  // Live: posts `text` with message id `id` to the target (one 15-second budget for the whole send). A new send is drawn
  // at once with "Sending…" under it (`draw`); a Retry keeps its Not-sent row ("Sending…") until the answer. Saved, it
  // shows "Sent ..."; refused or timed out, it becomes (again) a "Not sent" row at the bottom of that target's thread
  // (the box is never touched). Resolves with the channel id once saved.
  function deliver(target: ChatChannel, text: string, id: string, draw: boolean): Promise<string> {
    const tk = target.key;
    const signal = sendBudget();
    const write = async () => {
      const cid = await channelFor(target, signal);
      // The browser's time here is only where it sits until the saved time comes back; it is never a read stamp.
      if (draw) land({ id, channelId: cid, authorId: me.userId, isBot: false, body: text, taskId: null, createdAt: live ? new Date().toISOString() : mockNow(), pending: true });
      // postMessage also asks the server to push "Board chat" to the channel's other members (once, after it saved).
      const saved = live ? await postMessage(cid, text, { id, signal }) : await mockPost(id);
      return { cid, saved };
    };
    // Live writes queue per target and refresh after; the mock demo (?demo=failsend) runs at once and never refreshes.
    const run = live ? enqueue(`send:${tk}`, write) : write();
    return run
      .then(
        ({ cid: ch, saved }) => {
          const msg: ChatMessage = { id, channelId: ch, authorId: me.userId, isBot: false, body: text, taskId: null, createdAt: saved.createdAt };
          if (draw) setMessages((ms) => ms.map((m) => (m.id === id ? msg : m)));
          else land(msg);
          dropUnsent(me.userId, [id]);
          showSent(id, target.name);
          return ch;
        },
        (err) => {
          if (draw) setMessages((ms) => ms.filter((m) => m.id !== id));
          addUnsent(me.userId, { id, target: tk, text, state: 'failed' });
          // Said once, through the page's one polite region (the row itself is not an alert, so switching channels or a
          // board drawn anew never reads it again).
          say("Couldn't save. Try again.");
          throw err;
        },
      )
      .finally(() => setSending((s) => s.filter((k) => k !== tk)));
  }

  // Mock ?demo=failsend's stand-in for postMessage: after ~600 ms the first try of a message id fails and a later try
  // (Retry, same id) saves at the demo's clock.
  async function mockPost(id: string): Promise<{ id: string; createdAt: string }> {
    await new Promise((r) => window.setTimeout(r, 600));
    if (!mockTried.current.has(id)) {
      mockTried.current.add(id);
      throw new Error('demo: not saved');
    }
    const at = mockNow();
    minute.current = Math.min(45, minute.current + 1);
    return { id, createdAt: at };
  }

  // Retry on a Not-sent row: the same words with the same id (a first try that saved after all is not posted twice).
  function retry(row: Unsent) {
    if (row.state === 'sending' || sending.includes(row.target)) return;
    const target = channels.find((c) => c.key === row.target);
    if (!target) return;
    setUnsentState(me.userId, row.id, 'sending');
    setSending((s) => [...s, row.target]);
    say('Sending…');
    void deliver(target, row.text, row.id, false).catch(() => undefined);
  }

  // Remove on a Not-sent row: the row goes; focus moves to the box. Live: a refresh follows, so a message that did save
  // after all (its answer was lost) shows up again in the thread.
  function removeUnsent(row: Unsent) {
    dropUnsent(me.userId, [row.id]);
    draftRef.current?.focus({ preventScroll: true });
    if (live) startRefresh(() => router.refresh());
  }

  // Undo on "Sent ...": takes the message back and puts its words in the box again (mock only: caps.unsend).
  function unsend(id: string) {
    if (!caps.unsend || live) return;
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    setMessages((ms) => ms.filter((x) => x.id !== id));
    window.clearTimeout(recentTimer.current);
    setRecent(null);
    setDraft(m.body);
    scrollMode.current = 'keep';
    draftRef.current?.focus();
    say('Message taken back. It is in the box again.');
  }

  /* ---------- scrolling: the "N new" line or the newest message in view; stays at the bottom while you are there ---------- */

  useLayoutEffect(() => {
    const box = msgsRef.current;
    const mode = scrollMode.current;
    scrollMode.current = null;
    if (!box || !mode || mode === 'keep') return;
    if (mode === 'end') box.scrollTop = box.scrollHeight;
    else {
      const nl = box.querySelector<HTMLElement>('.ch-newline');
      box.scrollTop = nl ? Math.max(0, nl.offsetTop - box.offsetTop - 8) : box.scrollHeight;
    }
    stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    near.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }, [sel, messages, search, divider, recent]);
  // A refresh brought messages from others: follow to the newest one only if the reader was near the bottom (where they
  // were before the new messages drew, as last measured on scroll); otherwise the position stays.
  useLayoutEffect(() => {
    const box = msgsRef.current;
    if (!jump || !box || !near.current) return;
    box.scrollTop = box.scrollHeight;
    stick.current = true;
  }, [jump]);
  // Keep the newest message in view when the box changes size (keyboard, composer growing, window resize).
  useEffect(() => {
    const box = msgsRef.current;
    if (!box) return;
    const onScroll = () => {
      const gap = box.scrollHeight - box.scrollTop - box.clientHeight;
      stick.current = gap < 24;
      near.current = gap < 80;
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => {
      if (stick.current) box.scrollTop = box.scrollHeight;
    });
    ro.observe(box);
    return () => {
      box.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);
  // The flash on a just-sent message runs once.
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [flash]);
  useEffect(() => () => window.clearTimeout(recentTimer.current), []);

  /* ---------- the composer grows with its text (to 140px) ---------- */

  useLayoutEffect(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [draft]);

  /* ---------- phone keyboard: the tab bar steps aside and the composer rides on top of the keyboard ---------- */

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => document.documentElement.style.setProperty('--ch-vh', `${vv.height}px`);
    fit();
    vv.addEventListener('resize', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      document.documentElement.style.removeProperty('--ch-vh');
    };
  }, []);

  /* ---------- the channel sheet (phone) ---------- */

  // Opens or closes the sheet; focus goes to the open channel inside it, and back to the picker after.
  function showSheet(on: boolean) {
    setSheetOpen(on);
    if (on) window.setTimeout(() => (sheetBodyRef.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? sheetCloseRef.current)?.focus({ preventScroll: true }), 40);
    else pickRef.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') showSheet(false);
      // The sheet is modal: Tab and Shift+Tab go round its own controls and never reach the page behind it.
      const box = sheetRef.current;
      if (e.key !== 'Tab' || !box) return;
      const stops = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!stops.length) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !box.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !box.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // The sheet exists only on phones: when the window grows past the phone width it closes, so the Tab trap above can
    // never hold focus on a sheet that is no longer shown.
    const wide = window.matchMedia('(min-width: 760px)');
    const onWide = () => {
      if (wide.matches) setSheetOpen(false);
    };
    wide.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [sheetOpen]);

  /* ---------- drawing ---------- */

  // Some channel in this view has older messages than the ones loaded. In All areas the timeline starts where the
  // latest-starting capped channel starts, so no channel has a hidden gap in the middle.
  const ids = viewIds(channels, sel);
  const capHere = viewCapped(view.capped, ids);
  const start = sel === ALL ? viewStart(messages, view.capped, ids) : null;
  const searching = Boolean(search.trim());
  const visible = messages
    .filter((m) => inView(m, sel, channels))
    // Search finds every loaded message, also those from before the start (the note under the results says so).
    .filter((m) => searching || afterStart(m, start))
    .filter((m) => matches(m, search, names));
  // The Not-sent rows of this view's targets (the open one, or every area in All areas), unless already saved.
  const shownIds = new Set(messages.map((m) => m.id));
  const notSent = unsentIn(unsent, sel === ALL ? areas.map((c) => c.key) : [sel]).filter((r) => !shownIds.has(r.id));
  const items = buildThread(visible, today, searching ? null : divider);
  const news = nextUp(channels, messages, me.userId, sel, Boolean(divider));
  const pins = view.pins.filter((p) => (current ? p.channelId === current.id : p.channelId === null));
  const placeholder = current ? `Message ${current.name}` : 'Message the board';
  const postName = areas.find((c) => c.key === postTo)?.name ?? '';
  const canSend = Boolean(draft.trim());
  // This target's last send is still waiting on the database: Send is off and reads "Sending…".
  const busyHere = sending.includes(targetKey);

  // One channel button (the laptop list and the phone sheet draw the same buttons).
  const chanBtn = (key: string, label: string, mark: React.ReactNode, n: number, inSheet: boolean) => {
    const cur = sel === key;
    return (
      <button
        key={key}
        type="button"
        className="ch-chn"
        aria-current={cur ? 'true' : undefined}
        onClick={() => {
          open(key);
          if (inSheet) showSheet(false);
        }}
      >
        {mark}
        <span className="ch-lab">{label}</span>
        {n ? (
          <span className={`ch-count${countLabel(n).length > 2 ? ' ch-wide' : ''}`}>
            {countLabel(n)}
            <span className="rf-sr"> unread</span>
          </span>
        ) : null}
      </button>
    );
  };
  // The channel list.
  const chans = (inSheet: boolean) => (
    <>
      {chanBtn(
        ALL,
        'All areas',
        <span className="ch-ct" aria-hidden="true">
          <Icon name="chat" />
        </span>,
        totalUnread(channels, messages, me.userId),
        inSheet,
      )}
      {areas.map((c) =>
        chanBtn(
          c.key,
          c.name,
          <span className="ch-ct" aria-hidden="true">
            <Icon name={AREA_ICON[c.area ?? ''] ?? 'chat'} />
          </span>,
          unreadOf(c, messages, me.userId),
          inSheet,
        ),
      )}
      {directs.length ? <p className="ch-grp">Direct</p> : null}
      {directs.map((c) =>
        chanBtn(
          c.key,
          c.name,
          <span className="ch-av" aria-hidden="true">
            {c.initials}
          </span>,
          unreadOf(c, messages, me.userId),
          inSheet,
        ),
      )}
    </>
  );
  // The Pinned list (read-only).
  const pinList = (
    <ul className="ch-pins">
      {pins.length ? (
        pins.map((p) => (
          <li key={p.id}>
            <Icon name="pin" />
            <span>{p.label}</span>
          </li>
        ))
      ) : (
        <li className="ch-pn-none">Nothing pinned yet.</li>
      )}
    </ul>
  );
  const pinLabel = pins.length ? `Pinned ${pins.length}` : 'Pinned';
  // The fold toggle beside the thread title (laptops below 1360px) and in the phone's picker row.
  const pinLnk = (
    <button type="button" className="rf-lnk ch-pin-lnk" aria-expanded={pinsOpen} aria-controls="ch-pinfold" onClick={() => setPinsOpen((o) => !o)}>
      {pinLabel}
      <Icon name="down" />
    </button>
  );
  // Closes the phone search and clears it.
  const closeSearch = () => {
    setQOpen(false);
    scrollMode.current = 'end';
    setSearch('');
    qOpenRef.current?.focus();
  };
  // Types into either search box (they share one search).
  const onSearch = (v: string) => {
    scrollMode.current = 'end';
    setSearch(v);
  };

  return (
    <div className={`rf ch-pg${kb ? ' ch-kb' : ''}`}>
      <header className="rf-head ch-head">
        <div>
          <div className="rf-ptitle">
            <h1>Board chat</h1>
            <span className="rf-pdate">{view.dateLabel}</span>
          </div>
          <div className="ch-news">
            {news && !view.threadFailed ? <NewsCard icon="chat" kicker={news.kicker} title={news.title} go="Read" gold onClick={() => open(news.key)} /> : null}
          </div>
        </div>
        <label className="rf-search">
          <Icon name="search" />
          <input type="search" placeholder="Search messages" aria-label="Search messages" autoComplete="off" value={search} onChange={(e) => onSearch(e.target.value)} />
        </label>
      </header>

      {view.threadFailed ? (
        <div className="ch-win ch-errbox">
          <StateLine kind="error" retrying={retrying} skeleton={<ChatWinSkeleton />} onRetry={() => startRetry(() => router.refresh())}>
            Board chat didn&apos;t load.
          </StateLine>
        </div>
      ) : (
        <div className="ch-win ch-main">
          <nav className="ch-chans" aria-label="Channels">
            {chans(false)}
          </nav>

          <section className="ch-thread" aria-labelledby="ch-thname">
            <div className="ch-th-head">
              <h2>
                <span id="ch-thname">{title}</span>
                <span className="ch-ppl">{peopleCount} people</span>
              </h2>
              {pinLnk}
            </div>
            {/* phone: channel picker, pinned, search */}
            <div className="ch-chbar">
              <button ref={pickRef} type="button" className="ch-chpick" aria-haspopup="dialog" onClick={() => showSheet(true)}>
                <span>{title}</span>
                <Icon name="down" />
              </button>
              <span className="ch-grow" />
              {pinLnk}
              <button
                ref={qOpenRef}
                type="button"
                className="ch-iconbtn"
                aria-label="Search messages"
                aria-expanded={qOpen}
                aria-controls="ch-qfield"
                onClick={() => {
                  setQOpen(true);
                  window.setTimeout(() => qRef.current?.focus(), 0);
                }}
              >
                <Icon name="search" />
              </button>
            </div>
            <div className="ch-qfield" id="ch-qfield" hidden={!qOpen}>
              <Icon name="search" />
              <input ref={qRef} type="search" placeholder="Search messages" aria-label="Search messages" autoComplete="off" value={search} onChange={(e) => onSearch(e.target.value)} />
              <button type="button" className="ch-iconbtn" aria-label="Close search" onClick={closeSearch}>
                <Icon name="x" />
              </button>
            </div>
            <Fold open={pinsOpen} className="ch-pinfold" id="ch-pinfold">
              {pinList}
            </Fold>

            {/* design-check reads an author's initials beside the first amount in the thread as a fact said twice; they are
                avatars on chat messages, not a restated number. */}
            <div
              className="ch-msgs"
              ref={msgsRef}
              role="log"
              aria-live="off"
              aria-label="Messages"
              tabIndex={0}
              data-design-keep="Avatar initials (DM, KD) sit beside amounts inside chat messages: sample message text, not a restated fact"
            >
              {capHere && !searching && items.length ? <p className="ch-day">Older messages aren&apos;t shown here.</p> : null}
              {items.length === 0 && !notSent.length ? (
                <p className="rf-none">{searching ? 'No messages match.' : messages.length ? 'No messages here yet.' : 'Start with a note to the board.'}</p>
              ) : (
                items.map((it) => {
                  if (it.kind === 'day')
                    return (
                      <p key={it.key} className="ch-day">
                        {it.label}
                      </p>
                    );
                  if (it.kind === 'new')
                    return (
                      <p key={it.key} className="ch-newline">
                        {countLabel(it.count)} new
                      </p>
                    );
                  const first = it.lines[0];
                  const mine = it.authorId === me.userId;
                  const bot = first.isBot || it.authorId === null;
                  const who = bot ? 'BTX' : mine ? 'You' : (names.get(it.authorId ?? '') ?? 'Former member');
                  const ch = channels.find((c) => c.id === it.channelId);
                  return (
                    <div key={it.key} className="ch-mg">
                      <span className={`rf-avatar rf-round ch-mav${mine ? ' ch-me' : ''}${bot ? ' ch-bot' : ''}`} aria-hidden="true">
                        {bot ? <Icon name="bell" /> : (initials.get(it.authorId ?? '') ?? '?')}
                      </span>
                      <div className="ch-mb">
                        <p className="ch-from">
                          <b>{who}</b>
                          {sel === ALL && ch ? <span className="ch-ar">{ch.name}</span> : null}
                          <span className="ch-tm" title={dayTitle(first.createdAt)}>
                            {clock(first.createdAt)}
                          </span>
                        </p>
                        {it.lines.map((m, i) => (
                          <div key={m.id} className={`ch-line${m.authorId === me.userId ? ' ch-mine' : ''}${flash === m.id ? ' ch-flashin' : ''}`} title={clock(m.createdAt)}>
                            {i ? (
                              <span className="ch-tm2" aria-hidden="true">
                                {clock(m.createdAt)}
                              </span>
                            ) : null}
                            <span>
                              <Body text={m.body} names={nameList} />
                            </span>
                            {m.taskId ? (
                              <span className="ch-task">
                                <Link className="rf-lnk" href="/tasks">
                                  Open task
                                </Link>
                              </span>
                            ) : null}
                            {m.pending ? (
                              <span className="ch-sentline">Sending…</span>
                            ) : recent === m.id ? (
                              <span className="ch-sentline">
                                <span className="ch-tick" aria-hidden="true">
                                  <Icon name="check" />
                                </span>
                                Sent {clock(m.createdAt)}
                                {caps.unsend && !live ? (
                                  <>
                                    &nbsp;·&nbsp;
                                    <button type="button" className="rf-lnk" onClick={() => unsend(m.id)}>
                                      Undo
                                    </button>
                                  </>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
              {/* Not sent: the words stay at the bottom of their thread with the error line, Retry and Remove. */}
              {notSent.map((r) => (
                <div key={r.id} className="ch-unsent">
                  {sel === ALL ? <p className="ch-unsent-to">To {areas.find((c) => c.key === r.target)?.name ?? ''}</p> : null}
                  <p className="ch-unsent-text">
                    <Body text={r.text} names={nameList} />
                  </p>
                  {r.state === 'sending' ? (
                    <p className="ch-sentline">Sending…</p>
                  ) : (
                    <p className="rf-saveerr ch-senderr">
                      <Icon name="alert" />
                      Couldn&apos;t save. Try again.
                    </p>
                  )}
                  <p className="ch-unsent-acts">
                    <button type="button" className="rf-btn rf-btn-gold" aria-label={`Retry: ${r.text.slice(0, 40)}`} aria-disabled={r.state === 'sending'} onClick={() => retry(r)}>
                      Retry
                    </button>
                    <button
                      type="button"
                      className="rf-lnk ch-remove"
                      aria-label={`Remove: ${r.text.slice(0, 40)}`}
                      aria-disabled={r.state === 'sending'}
                      onClick={() => r.state === 'failed' && removeUnsent(r)}
                    >
                      Remove
                    </button>
                  </p>
                </div>
              ))}
              {capHere && searching ? <p className="ch-capnote">Search covers only the messages loaded here.</p> : null}
            </div>

            {caps.send ? (
              <form
                ref={compRef}
                className="ch-comp"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                {current ? null : (
                  <label className="ch-postto">
                    <em>Post to</em>
                    <b>{postName}</b>
                    <Icon name="down" />
                    <select
                      aria-label="Post to"
                      value={postTo}
                      onChange={(e) => {
                        setPostTo(e.target.value);
                      }}
                    >
                      {areas.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="ch-field">
                  <textarea
                    ref={draftRef}
                    rows={1}
                    enterKeyHint="send"
                    maxLength={4000}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      // Laptop: Enter sends, Shift+Enter is a new line. Phone: the keyboard's send key submits the form.
                      if (e.key === 'Enter' && !e.shiftKey && !isPhone()) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    onFocus={() => {
                      if (isPhone()) setKb(true);
                    }}
                    onBlur={() =>
                      window.setTimeout(() => {
                        if (document.activeElement !== draftRef.current) setKb(false);
                      }, 120)
                    }
                  />
                  {busyHere ? (
                    <button className="ch-send ch-busy" type="submit" disabled>
                      Sending…
                    </button>
                  ) : (
                    <button className={`ch-send${canSend ? ' ch-go' : ''}`} type="submit" aria-label="Send" aria-disabled={!canSend}>
                      <Icon name="send" />
                    </button>
                  )}
                </div>
              </form>
            ) : null}
          </section>

          <aside className="ch-pinside" aria-labelledby="ch-pinh">
            <div className="ch-ph">
              <h2 id="ch-pinh">Pinned</h2>
            </div>
            {pinList}
          </aside>
        </div>
      )}

      {/* Phone: the channels as a sheet */}
      <div className={`ch-scrim${sheetOpen ? ' ch-on' : ''}`} onClick={() => showSheet(false)} aria-hidden="true" />
      <section ref={sheetRef} className={`ch-sheet${sheetOpen ? ' ch-on' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ch-shtitle">
        <div className="ch-sh-head">
          <div className="ch-grab" aria-hidden="true" />
          <button ref={sheetCloseRef} type="button" className="ch-iconbtn ch-sh-close" aria-label="Close" onClick={() => showSheet(false)}>
            <Icon name="x" />
          </button>
          <h2 className="ch-sh-title" id="ch-shtitle">
            Channels
          </h2>
        </div>
        <div className="ch-sh-body" ref={sheetBodyRef}>
          {view.threadFailed ? null : chans(true)}
          <p className="ch-ppl">
            {peopleCount} people in {title}
          </p>
        </div>
      </section>

      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
