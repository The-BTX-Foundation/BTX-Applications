'use client';

// The refreshed Outreach Plan page (demo p-outreach-plan, Ops Hub refresh 2026-11-12): the title and date, the news card
// ("Next up"), what needs the person (a caption to nudge, then an item with no owner), this month drawn as marks on a line
// over its list, the channels, and next month's list with "Plan a post or issue" in place.
// Mock mode changes its own state, like the demo (nudge, pick an owner with Undo, adds with day words, names and the
// channel, the N key). Live mode draws only the controls with a real write behind them (view.caps): adding a post. That
// write is optimistic, serialized per record, and taken back with "Couldn't save. Try again." when the database says no
// (components/oplan/oplan-writes.ts).
import '@/components/refresh/refresh.css';
import './oplan.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold, foldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { PageHeader } from '@/components/refresh/page-header';
import { chain } from '@/lib/goals-figures';
import { addedWhere, byDate, settleFailedAdds, type PnFailedAdd, firstName, inMonth, nextUpItem, nudgeText, ownerlessItem, personOf, squares, statusOf, waitingItem } from '@/lib/oplan-map';
import { readLine, type PnDismissed } from '@/lib/oplan-parse';
import { dayOf, headerDate, linePos, monthKey, monthLong, nextMonthKey, pnRel, weekMarks } from '@/lib/oplan-time';
import { clock, daysFrom, easternDay, fullDate, MO, shortDate } from '@/lib/refresh-time';
import { newId, retryIds } from '@/lib/tasks-ids';
import { shouldReseed } from '@/lib/tasks-reseed';
import type { PnChan, PnChannel, PnItem, PnView } from '@/lib/oplan-view';
import { OplanSecNav, OplanSkelBoard } from './oplan-skeleton';
import { insertPost } from './oplan-writes';

/** The words after a refused write. */
export const SAVE_ERR = "Couldn't save. Try again.";
/** The words when there is no Instagram channel to add a post to (live). */
export const NOT_CONNECTED = 'Not connected yet.';

/** Where each channel's own page is. */
const OPEN_HREF: Record<PnChannel, string> = { Instagram: '/outreach/instagram', Newsletter: '/outreach/newsletter' };

// The retry memory for a new post (a failed add's id is reused for the same words within two minutes).
const postIds = retryIds();
// The time now in milliseconds (for the retry memory; read in event handlers only).
const nowMs = () => Date.now();

type Props = { view: PnView; live: boolean; failSave?: boolean };

// The nudge: no draft, the draft open, the draft closing (Cancel), or sent.
type Nudge = { state: 'none' | 'draft' | 'closing' | 'sent'; editing: boolean; text: string; sending: boolean; at: string };
const NO_NUDGE: Nudge = { state: 'none', editing: false, text: '', sending: false, at: '' };

// The last owner picked (mock), drawn as "Keith Dawson owns X. Saved 9:15 AM · Undo".
type Assigned = { id: string; name: string; title: string; at: string };

// The signature of the server's data: a change means fresh data to take in.
const sigOf = (v: PnView) => JSON.stringify([v.items.map((x) => [x.id, x.date, x.owner, x.posted, x.steps, x.sections, x.title]), v.channels.map((c) => [c.id, c.owner, c.target, c.k, c.line])]);

// The small mark of a channel.
const chIcon = (ch: PnChannel) => (ch === 'Newsletter' ? 'mail' : 'image');

// A name kept on one line, as the demo draws it; a very long name may wrap (it would run past a phone's edge).
const Nw = ({ text }: { text: string }) => (text.length <= 24 ? <span className="pn-nowrap">{text}</span> : <>{text}</>);

// The steps as five little bars (gold = done).
function Steps({ n, of = 5, label }: { n: number; of?: number; label: string }) {
  return (
    <span className="pn-steps" role="img" aria-label={label}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? 'pn-on' : undefined} />
      ))}
    </span>
  );
}

// The page.
export function OplanBoard({ view, live, failSave = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, me, people } = view;
  // The Eastern day. Mock mode keeps the sample's day; live mode moves it on each minute while the page stays open, so
  // relative words ("Tomorrow"), the past-row rule and the typed line's day words never use the day the page loaded.
  const [liveDay, setLiveDay] = useState(view.today);
  const today = live ? liveDay : view.today;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setLiveDay(easternDay(new Date().toISOString())), 60_000);
    return () => window.clearInterval(t);
  }, [live]);
  const now = monthKey(today);
  const next = nextMonthKey(now);
  const [items, setItems] = useState(view.items);
  const [nudge, setNudge] = useState<Nudge>(NO_NUDGE);
  const [assigned, setAssigned] = useState<Assigned | null>(null);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [dismissed, setDismissed] = useState<PnDismissed>({ date: false, owner: false });
  const [forceCh, setForceCh] = useState<PnChannel | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Bumped per refusal: the alert line is drawn anew, so each refusal is read once (by the alert, not the live region).
  const [errN, setErrN] = useState(0);
  // Adds reported as failed, until fresh server data shows whether they saved after all (a timed-out answer).
  const [failedAdds, setFailedAdds] = useState<PnFailedAdd[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();

  // Live writes still running, whether the server data on hand predates a write, and the refresh once they settle. New
  // server data is taken in only when no write is running, the data is not stale and no refresh is pending.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sig = sigOf(view);
  const [seenSig, setSeenSig] = useState(sig);
  // The server data is taken in after a new list and after EVERY settled refresh (lib/tasks-reseed.ts shouldReseed, as
  // the Tasks and Certifications pages), never while a write runs, the data is stale or a refresh is on its way.
  if (shouldReseed({ sigChanged: sig !== seenSig, refreshed, goneListed: false, busy, stale, refreshing })) {
    setSeenSig(sig);
    setRefreshed(false);
    setItems(view.items);
    // An add reported as failed that the server lists did save (a lost answer): no error, and its words leave the box,
    // so Enter cannot make a second post.
    if (failedAdds.length) {
      const r = settleFailedAdds(failedAdds, new Set(view.items.map((x) => x.id)), addText);
      setFailedAdds(r.left);
      if (r.clearErr) setSaveErr(null);
      if (r.box !== addText) setAddText(r.box);
    }
  }
  // Ids the server now lists are on the board: the same words typed again on purpose are a new post, not a retry.
  useEffect(() => {
    postIds.forget(view.items.map((x) => x.id));
  }, [view]);

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Where focus goes after the next render: the first of these selectors that exists.
  const focusSel = useRef<string[] | null>(null);
  // A row to flash (gold) or ring (the news card's jump) after the next render.
  const markRow = useRef<{ id: string; kind: 'pn-flash' | 'pn-ring'; scroll: boolean } | null>(null);
  const minute = useRef(14);
  const timers = useRef<number[]>([]);
  // Latest items, for rollbacks inside write callbacks that outlive a render.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Runs `fn` after `ms` (cleared if the page goes away).
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  // After each render: move focus where the last action asked (never to the page body), then flash or ring a row.
  useEffect(() => {
    const root = rootRef.current;
    if (focusSel.current) {
      const el = focusSel.current.map((s) => root?.querySelector<HTMLElement>(s)).find(Boolean);
      focusSel.current = null;
      el?.focus({ preventScroll: true });
    }
    const m = markRow.current;
    if (m) {
      markRow.current = null;
      const row = root?.querySelector<HTMLElement>(`[data-row="${m.id}"]`);
      if (row) {
        if (m.scroll) {
          row.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          row.focus({ preventScroll: true });
        }
        row.classList.remove('pn-flash', 'pn-ring');
        // Reading the width restarts the animation when the same row is marked again.
        void row.offsetWidth;
        row.classList.add(m.kind);
      }
    }
  });

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback(
    (m: string) => {
      setAnnounce('');
      later(() => setAnnounce(m), 30);
    },
    [later],
  );

  // "9:14 AM": the real Eastern time in live mode; in mock mode the demo's clock (9:14 AM, a minute later per action).
  const stamp = useCallback(() => {
    if (live) return clock(new Date().toISOString());
    const m = minute.current++;
    return `9:${String(m).padStart(2, '0')} AM`;
  }, [live]);

  // Fetches fresh server data (live only), in a transition so the board keeps its state until it lands.
  const refresh = useCallback(() => {
    if (!live) return;
    startRefresh(() => {
      setStale(false);
      setRefreshed(true);
      router.refresh();
    });
  }, [live, router]);

  // Runs a write after every earlier write on the same record, counting it as running until it settles. When the last
  // one settles, one refresh fetches fresh server data. Mock mode: nothing to write (true), or a refusal with ?demo=failsave.
  const run = (k: string, write: () => Promise<boolean>): Promise<boolean> => {
    if (!live && !failSave) return Promise.resolve(true);
    const job = live ? write : () => new Promise<boolean>((r) => window.setTimeout(() => r(false), 300));
    const p = chain(queue.current, k, job);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    void p.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(k) === p) queue.current.delete(k);
        running.current -= 1;
        setBusy((b) => b - 1);
        if (running.current === 0) {
          if (live) refresh();
          else setStale(false);
        }
      }, 0),
    );
    return p;
  };

  // ---------- What needs you ----------
  const waiting = caps.nudge ? waitingItem(items, today) : null;
  const ownerless = caps.pickOwner ? ownerlessItem(items, today) : null;
  const waitingOpen = !!waiting && nudge.state !== 'sent';
  const upNext = view.loadFailed ? null : nextUpItem(items, today, waitingOpen, !!ownerless);
  const waitName = personOf(people, waiting?.waitOn ?? null)?.name ?? '';

  // "Nudge Keith": opens the draft message; the cursor goes to Send.
  const openNudge = () => {
    if (!waiting) return;
    setNudge((n) => ({ ...n, state: 'draft', text: n.text || nudgeText(waiting, people, today) }));
    focusSel.current = ['[data-x="nsend"]'];
  };

  // Edit: the message becomes a field with the cursor at its end.
  const editNudge = () => {
    const ta = rootRef.current?.querySelector<HTMLTextAreaElement>('textarea.pn-dtext');
    if (ta) {
      ta.focus();
      return;
    }
    setNudge((n) => ({ ...n, editing: true }));
    later(() => {
      const t = rootRef.current?.querySelector<HTMLTextAreaElement>('textarea.pn-dtext');
      if (!t) return;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }, 0);
  };

  // Cancel: the draft folds away, then the message is forgotten; focus goes back to "Nudge Keith".
  const cancelNudge = () => {
    setNudge((n) => ({ ...n, state: 'closing' }));
    later(() => {
      setNudge(NO_NUDGE);
      focusSel.current = ['[data-x="nudge"]', '#pn-needs'];
    }, foldMs());
  };

  // Send: "Sending…" for a moment, then "Nudged Keith in Board chat, 9:14 AM." (mock: no message is sent anywhere).
  const sendNudge = () => {
    if (!waiting) return;
    const ta = rootRef.current?.querySelector<HTMLTextAreaElement>('textarea.pn-dtext');
    const text = ta ? ta.value.trim() || nudgeText(waiting, people, today) : nudge.text;
    setNudge((n) => ({ ...n, text, sending: true }));
    later(() => {
      // The time is read once, outside the updater (React may run an updater twice).
      const at = stamp();
      setNudge((n) => ({ ...n, state: 'sent', editing: false, sending: false, at }));
      focusSel.current = ['.pn-pick', '#pn-needs'];
      say(`Nudge sent to ${waitName}`);
    }, 450);
  };

  // Picks an owner for the item with no owner: "Keith Dawson owns X. Saved 9:15 AM · Undo" (mock).
  const pickOwner = (personId: string) => {
    const o = ownerless;
    const p = personOf(people, personId);
    if (!o || !p) return;
    setItems((list) => list.map((x) => (x.id === o.id ? { ...x, owner: personId } : x)));
    setAssigned({ id: o.id, name: p.name, title: o.title, at: stamp() });
    markRow.current = { id: o.id, kind: 'pn-flash', scroll: false };
    focusSel.current = ['[data-x="unassign"]'];
    say(`${p.name} owns ${o.title}`);
  };

  // A pick button: its person id is on the button (one handler for all the picks).
  const onPick = (e: MouseEvent<HTMLButtonElement>) => pickOwner(e.currentTarget.dataset.id ?? '');

  // Undo: the item has no owner again and its picks come back.
  const unassign = () => {
    const a = assigned;
    if (!a) return;
    setItems((list) => list.map((x) => (x.id === a.id ? { ...x, owner: null } : x)));
    setAssigned(null);
    markRow.current = { id: a.id, kind: 'pn-flash', scroll: false };
    focusSel.current = ['.pn-pick', '#pn-needs'];
    say('Owner removed');
  };

  // ---------- Jumps: a mark on the month line, and the news card ----------
  const jumpTo = (id: string, kind: 'pn-flash' | 'pn-ring') => {
    markRow.current = { id, kind, scroll: true };
    // Nothing else changes, so draw once more to run the effect.
    setAnnounce((a) => a);
    const root = rootRef.current;
    const row = root?.querySelector<HTMLElement>(`[data-row="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row.classList.remove('pn-flash', 'pn-ring');
    void row.offsetWidth;
    row.classList.add(kind);
    row.focus({ preventScroll: true });
    markRow.current = null;
  };

  // ---------- Plan a post or issue ----------
  const parsed = useMemo(() => {
    if (caps.parse) return readLine(today, addText, people, dismissed, caps.addIssue);
    const t = addText.replace(/\s+/g, ' ').trim();
    return { title: t ? t[0].toUpperCase() + t.slice(1) : '', due: null, owner: null, channel: 'Instagram' as PnChannel };
  }, [caps.parse, caps.addIssue, today, addText, people, dismissed]);
  const channel: PnChannel = caps.addIssue ? (forceCh ?? parsed.channel) : 'Instagram';

  // Opens the field and puts the cursor in it.
  const openAdd = useCallback(() => {
    setAdding(true);
    focusSel.current = ['[data-k="add:in"]'];
  }, []);

  // Closes the field (clearing it when asked).
  const closeAdd = (clear: boolean) => {
    setAdding(false);
    if (clear) {
      setAddText('');
      setDismissed({ date: false, owner: false });
      setForceCh(null);
    }
  };

  // Shows a save line under next month's list; its role="alert" reads it once (a new key per refusal reads it again).
  const refused = (m: string) => {
    setSaveErr(m);
    setErrN((n) => n + 1);
  };

  // Enter adds the item where its date puts it (this month, next month, or "No date yet"), flashes it and says where.
  const addItem = (e: FormEvent) => {
    e.preventDefault();
    // Live mode reads the Eastern day now, so "tomorrow" typed after midnight means the right day.
    const day = live ? easternDay(new Date().toISOString()) : today;
    if (day !== today) setLiveDay(day);
    const p = caps.parse && day !== today ? readLine(day, addText, people, dismissed, caps.addIssue) : parsed;
    if (!p.title) return;
    if (live && !view.instagramId) {
      refused(NOT_CONNECTED);
      return;
    }
    const title = p.title.slice(0, 200);
    const typed = addText;
    const key = `${title}|${p.due ?? ''}|${p.owner ?? ''}|${me}`;
    const id = live || failSave ? postIds.take(key, nowMs()) : `n-${newId()}`;
    const it: PnItem = { id, ch: channel, title, date: p.due, owner: p.owner, posted: false, postedWord: channel === 'Newsletter' ? 'Sent' : 'Posted', steps: 0, sections: null, waitOn: null, slug: null, note: null };
    setItems((list) => [...list, it]);
    setAddText('');
    setDismissed({ date: false, owner: false });
    setForceCh(null);
    setSaveErr(null);
    setLastAdded(id);
    markRow.current = { id, kind: 'pn-flash', scroll: false };
    focusSel.current = ['[data-k="add:in"]'];
    say(addedWhere(day, p.due));
    void run(`post:${id}`, () => insertPost({ id, channelId: view.instagramId ?? '', title, postOn: p.due, ownerId: p.owner })).then((ok) => {
      if (ok) {
        postIds.done(key);
        return;
      }
      postIds.fail(key, id, nowMs());
      setItems((list) => list.filter((x) => x.id !== id));
      // Remembered until fresh server data shows whether this add saved after all.
      setFailedAdds((f) => [...f, { id, words: typed.trim() }]);
      // The typed line comes back as it was (date and name words included), unless something new was typed since, in an
      // open field with the cursor in it (the field may have closed while the write ran).
      setAddText((t) => (t ? t : typed));
      setAdding(true);
      focusSel.current = ['[data-k="add:in"]'];
      refused(SAVE_ERR);
    });
  };

  // Escape closes the field and clears it; focus goes back to "Plan a post or issue".
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeAdd(true);
    focusSel.current = ['#pn-add-open', '#pn-nh'];
  };

  // Leaving the field closes it (the words stay for next time); not when the move is to a chip or the form itself.
  const onAddBlur = () => {
    later(() => {
      const form = rootRef.current?.querySelector('#pn-add-form');
      if (form && form.contains(document.activeElement)) return;
      setAdding(false);
    }, 150);
  };

  // Removing a date or owner chip stops that part being read; the channel chip switches channel. The cursor stays.
  const tapChip = (kind: 'date' | 'owner' | 'channel') => {
    if (kind === 'channel') setForceCh(channel === 'Newsletter' ? 'Instagram' : 'Newsletter');
    else setDismissed((d) => ({ ...d, [kind]: true }));
    focusSel.current = ['[data-k="add:in"]'];
  };

  // The N key opens the field (mock; not while typing).
  useEffect(() => {
    if (!caps.nKey || !caps.addPost) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      openAdd();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [caps.nKey, caps.addPost, openAdd]);

  // Nothing planned at all: the field opens at once (the demo's empty state).
  const startEmpty = useRef(view.items.length === 0 && !view.loadFailed && caps.addPost);
  useEffect(() => {
    if (!startEmpty.current) return;
    startEmpty.current = false;
    openAdd();
  }, [openAdd]);

  // "Try again" on a load error: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // ---------- Drawing ----------
  // A person: the initials circle (yours gold) and the name; nobody is a dashed "?" with "No owner".
  const who = (id: string | null) => {
    const p = personOf(people, id);
    if (!p) {
      return (
        <span className="pn-who pn-none">
          <span className="pn-av" aria-hidden="true">
            ?
          </span>
          No owner
        </span>
      );
    }
    return (
      <span className={`pn-who${p.id === me ? ' pn-me' : ''}`}>
        <span className="pn-av" aria-hidden="true">
          {p.initials}
        </span>
        {p.name}
      </span>
    );
  };

  // A row's progress: Posted (or Sent), the issue's sections, the post's steps, or "Not started".
  const progress = (it: PnItem) => {
    const st = statusOf(it);
    if (st.kind === 'posted') {
      return (
        <span className="pn-postd">
          <Icon name="check" />
          {st.word}
        </span>
      );
    }
    if (st.kind === 'sections') {
      return (
        <>
          <Steps n={st.done} of={st.of} label={`${st.done} of ${st.of} sections done`} />
          <span>
            {st.done} of {st.of} sections
          </span>
        </>
      );
    }
    if (st.kind === 'none') return <b>Not started</b>;
    return (
      <>
        <Steps n={st.n} label={`${st.n} of 5 steps done`} />
        <span>{st.n} of 5 steps</span>
      </>
    );
  };

  // One item row.
  const row = (it: PnItem) => {
    const gone = !!it.date && daysFrom(today, it.date) < 0;
    return (
      <div key={it.id} className={`pn-prow${it.posted ? ' pn-isposted' : ''}${gone ? ' pn-gone' : ''}`} data-row={it.id} tabIndex={-1}>
        <span className="pn-kt" aria-hidden="true">
          <Icon name={chIcon(it.ch)} />
        </span>
        <div>
          <span className="pn-eb">
            <span className={`pn-when${gone ? ' pn-soft' : ''}`} title={it.date ? fullDate(it.date) : 'No date yet'}>
              {pnRel(today, it.date)}
            </span>
            <span className="pn-kw">{it.ch}</span>
          </span>
          <span className="pn-t">{it.title}</span>
          <span className="pn-meta">
            {who(it.owner)}
            {it.note ? <span className="pn-note">{it.note}</span> : null}
            <Link className="rf-lnk" href={OPEN_HREF[it.ch]}>
              Open<span className="rf-sr"> {it.title}</span>
            </Link>
          </span>
        </div>
        <span className="pn-st">{progress(it)}</span>
      </div>
    );
  };

  // A list split into groups (each with its icon and label), rows in date order.
  const list = (pool: PnItem[], groups: [string, 'cal' | 'check' | 'wait', (it: PnItem) => boolean][]) => (
    <>
      {groups.map(([label, icon, test]) => {
        const its = pool.filter(test).sort(byDate);
        if (!its.length) return null;
        return [
          <div key={`g-${label}`} className="pn-grp">
            <Icon name={icon} />
            {label}
          </div>,
          ...its.map(row),
        ];
      })}
    </>
  );

  // The month line: the base, the past in ink up to today, the week labels, "Today", one mark per item.
  const monthLine = () => {
    const nowItems = items.filter((it) => inMonth(it, now)).sort(byDate);
    const t = linePos(now, dayOf(today));
    const seen = new Set<string>();
    return (
      <div className="pn-mline">
        <span className="pn-base" />
        <span className="pn-past" style={{ width: `${t}%` }} />
        {weekMarks(now).map((w) => (
          <span key={w.day} className={`pn-wk${w.edge ? ` pn-${w.edge}` : ''}`} style={{ left: `${linePos(now, w.day)}%` }}>
            {w.label}
          </span>
        ))}
        <span className="pn-now" style={{ left: `${t}%` }}>
          <span>Today</span>
        </span>
        {nowItems.map((it) => {
          const d = it.date as string;
          const tied = seen.has(d);
          seen.add(d);
          const cls = `pn-mk${it.posted ? ' pn-posted' : ''}${it.ch === 'Newsletter' ? ' pn-nl' : ''}${tied ? ' pn-tied' : ''}${it.id === lastAdded ? ' pn-new' : ''}`;
          return (
            <button
              key={it.id}
              type="button"
              className={cls}
              style={{ left: `${linePos(now, dayOf(d))}%` }}
              title={`${it.title} · ${shortDate(d)}`}
              aria-label={`${it.title}, ${it.ch}, ${fullDate(d)}${it.posted ? ', posted' : ''}`}
              onClick={() => jumpTo(it.id, 'pn-flash')}
            />
          );
        })}
      </div>
    );
  };

  // One channel row.
  const chanRow = (c: PnChan) => {
    if (c.kind === 'instagram') {
      const q = squares(items, now, c.target);
      return (
        <li key={c.id} className="pn-chan">
          <span className="pn-cn">
            <span className="pn-kt" aria-hidden="true">
              <Icon name="image" />
            </span>
            {c.name}
          </span>
          <span className="pn-cm">
            <span className="pn-sq" role="img" aria-label={`${q.posted} of ${q.count} ${monthLong(now)} posts posted`}>
              {q.boxes.map((b, i) => (
                <span key={i} className={`${b.on ? 'pn-on' : ''}${b.over ? ' pn-over' : ''}`.trim() || undefined} />
              ))}
            </span>
            <span className="pn-ml">
              <span>
                {q.posted} of {q.count} posted{c.target != null ? ` · target ${c.target} a month` : ''}
              </span>
              {who(c.owner)}
            </span>
          </span>
        </li>
      );
    }
    return (
      <li key={c.id} className="pn-chan">
        <span className="pn-cn">
          <span className="pn-kt" aria-hidden="true">
            <Icon name={c.kind === 'newsletter' ? 'mail' : 'mega'} />
          </span>
          {c.name}
        </span>
        <span className="pn-cm">
          <span className="pn-k">{c.k}</span>
          <span className="pn-ml">
            <span>{c.line}</span>
            {who(c.owner)}
          </span>
        </span>
      </li>
    );
  };

  // The Needs card's content (null when nothing needs the person).
  const needs = (): ReactNode => {
    const w = waiting;
    if (w && nudge.state !== 'sent') {
      const draftOpen = nudge.state === 'draft';
      return (
        <>
          <div className="pn-ntop">
            <h2 id="pn-nh">
              <Icon name="wait" />
              <span>
                Waiting on <Nw text={`${waitName}'s`} /> caption
              </span>
            </h2>
            <span className="pn-ndue" title={`Posts ${fullDate(w.date as string)}`}>
              Posts {pnRel(today, w.date).toLowerCase()}
            </span>
          </div>
          <div className="pn-nbody">
            <div className="pn-nwhat">
              <span className="pn-t">{w.title}</span>
              <span className="pn-m">
                <span className="pn-ty">
                  <Icon name="image" />
                  Instagram
                </span>
                <Steps n={w.steps} label={`${w.steps} of 5 steps done`} />
                <span>{w.steps} of 5 steps</span>
              </span>
            </div>
            <div className="pn-nact" hidden={draftOpen}>
              <button type="button" className="rf-btn rf-btn-gold" data-x="nudge" aria-expanded={false} aria-controls="pn-draft" onClick={openNudge}>
                <Icon name="send" />
                <span>Nudge {firstName(waitName)}</span>
              </button>
            </div>
          </div>
          <Fold open={draftOpen} id="pn-draft">
            <div className="pn-draft">
              <span className="pn-dl">
                To <Nw text={waitName} /> in Board chat
              </span>
              {nudge.editing ? (
                <textarea className="pn-dtext" rows={3} aria-label={`Message to ${waitName}`} defaultValue={nudge.text} />
              ) : (
                <p className="pn-dtext">{nudge.text}</p>
              )}
              <div className="pn-dact">
                <button type="button" className="rf-btn rf-btn-gold" data-x="nsend" disabled={nudge.sending} onClick={sendNudge}>
                  <Icon name="send" />
                  <span>{nudge.sending ? 'Sending…' : 'Send'}</span>
                </button>
                <button type="button" className="rf-lnk" onClick={editNudge}>
                  Edit
                </button>
                <button type="button" className="rf-lnk" onClick={cancelNudge}>
                  Cancel
                </button>
              </div>
            </div>
          </Fold>
        </>
      );
    }
    const o = ownerless;
    const parts: ReactNode[] = [];
    if (w && nudge.state === 'sent') {
      parts.push(
        <p key="nudged" className="pn-done" role="status">
          <span className="pn-tick">
            <Icon name="check" />
          </span>
          <span>
            Nudged <Nw text={firstName(waitName)} /> in Board chat, {nudge.at}.
          </span>
        </p>,
      );
    }
    if (assigned) {
      parts.push(
        <p key="assigned" className="pn-done" role="status">
          <span className="pn-tick">
            <Icon name="check" />
          </span>
          <span>
            <Nw text={assigned.name} /> owns {assigned.title}. Saved {assigned.at}&nbsp;·&nbsp;
            {caps.undo ? (
              <button type="button" className="rf-lnk" data-x="unassign" onClick={unassign}>
                Undo
              </button>
            ) : null}
          </span>
        </p>,
      );
    }
    if (o) {
      parts.push(
        <div key="o-top" className="pn-ntop">
          <h2 id="pn-nh">
            <Icon name="people" />
            <span>No owner yet</span>
          </h2>
          <span className="pn-ndue" title={fullDate(o.date as string)}>
            {pnRel(today, o.date)}
          </span>
        </div>,
        <div key="o-what" className="pn-nwhat pn-gap">
          <span className="pn-t">{o.title}</span>
          <span className="pn-m">
            <span className="pn-ty">
              <Icon name={chIcon(o.ch)} />
              {o.ch}
            </span>
            <span>Who takes it?</span>
          </span>
        </div>,
        <div key="o-picks" className="pn-picks" role="group" aria-label="Pick an owner">
          {people.map((p) => (
            <button key={p.id} type="button" className="pn-pick" data-id={p.id} onClick={onPick}>
              {p.name}
              {p.id === me ? <span> (you)</span> : null}
            </button>
          ))}
        </div>,
      );
    } else if (w && nudge.state === 'sent') {
      parts.push(
        <p key="sugg" className="pn-sugg">
          <Icon name="bell" />
          Ask again tomorrow at 9 AM if the caption isn&apos;t in
        </p>,
      );
    }
    return parts.length ? parts : null;
  };

  const needsBody = view.loadFailed ? null : needs();
  const nowItems = items.filter((it) => inMonth(it, now));
  const laterItems = items.filter((it) => !inMonth(it, now));
  const chipX = (
    <svg className="rf-i pn-x" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
  const ownerP = personOf(people, parsed.owner);
  const hasText = !!addText.trim();

  // The load error (demo=error, or a failed live read): the header, the tabs and the card; Try again reloads.
  if (view.loadFailed) {
    return (
      <div className="rf pn" ref={rootRef}>
        <PageHeader title="Outreach" date={headerDate(today)} />
        <OplanSecNav />
        {retrying ? (
          <div aria-busy="true">
            <OplanSkelBoard />
          </div>
        ) : (
          <section className="pn-loaderr" role="alert" aria-labelledby="pn-errh">
            <p>
              <b id="pn-errh">
                <Icon name="alert" />
                Outreach plan didn&apos;t load.
              </b>
              <span>Check your connection, then try again.</span>
            </p>
            <button type="button" className="rf-btn" onClick={retry}>
              Try again
            </button>
          </section>
        )}
        <p className="rf-sr" aria-live="polite">
          {announce}
        </p>
      </div>
    );
  }

  return (
    <div className="rf pn" ref={rootRef}>
      <PageHeader title="Outreach" date={headerDate(today)}>
        {upNext ? <NewsCard icon={chIcon(upNext.ch)} kicker={`Next up · ${pnRel(today, upNext.date)}`} title={upNext.title} go="See it" onClick={() => jumpTo(upNext.id, 'pn-ring')} /> : null}
      </PageHeader>
      <OplanSecNav />
      <div className="rf-board pn-board pn-real">
        <div className="rf-col pn-cola">
          {needsBody ? (
            <section className="pn-needs" id="pn-needs" aria-label="What needs you" tabIndex={-1}>
              {needsBody}
            </section>
          ) : null}
          <section className="rf-panel pn-month" aria-labelledby="pn-mh">
            <div className="rf-ph">
              <h2 id="pn-mh">{monthLong(now)}</h2>
              <span className="pn-legend" aria-hidden="true">
                <span>
                  <i className="pn-lg pn-posted" />
                  Posted
                </span>
                <span>
                  <i className="pn-lg" />
                  Planned
                </span>
                <span>
                  <i className="pn-lg pn-sqr" />
                  Newsletter
                </span>
              </span>
            </div>
            <div className="rf-pcard">
              {monthLine()}
              <div className="pn-list">
                {nowItems.length ? (
                  list(nowItems, [
                    ['Coming up', 'cal', (it) => !it.posted],
                    ['Posted', 'check', (it) => it.posted],
                  ])
                ) : (
                  <div className="pn-empty">
                    <p>Nothing planned for {monthLong(now)} yet.</p>
                    {caps.addPost ? (
                      <button type="button" className="rf-lnk" onClick={openAdd}>
                        Plan a post or issue
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
        <div className="rf-col pn-colb">
          <section className="rf-panel pn-chans" aria-labelledby="pn-chh">
            <div className="rf-ph">
              <h2 id="pn-chh">Channels</h2>
            </div>
            <div className="rf-pcard">
              <ul>{view.channels.map(chanRow)}</ul>
            </div>
          </section>
          <section className="rf-panel pn-next" aria-labelledby="pn-xh">
            <div className="rf-ph">
              <h2 id="pn-xh" tabIndex={-1}>
                {monthLong(next)}
              </h2>
            </div>
            <div className="rf-pcard">
              <div className="pn-list">
                {list(laterItems, [
                  ['Planned', 'cal', (it) => !!it.date],
                  ['No date yet', 'wait', (it) => !it.date],
                ])}
              </div>
              {caps.addPost ? (
                <div className="pn-add">
                  {!adding ? (
                    <button type="button" className="pn-add-open" id="pn-add-open" onClick={openAdd}>
                      <span className="pn-plus">
                        <Icon name="plus" />
                      </span>
                      <span className="pn-lab">{caps.addIssue ? 'Plan a post or issue' : 'Plan a post'}</span>
                      {caps.nKey ? (
                        <span className="pn-kbd" aria-hidden="true">
                          N
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <form className="pn-add-form" id="pn-add-form" onSubmit={addItem} autoComplete="off">
                      <div className="pn-add-field">
                        <span className="pn-plus" aria-hidden="true">
                          <Icon name="plus" />
                        </span>
                        <input
                          type="text"
                          enterKeyHint="done"
                          maxLength={200}
                          aria-label={caps.addIssue ? 'New item. Words like dec 4, a first name or newsletter set the date, owner and channel.' : 'New post. Words like dec 4 or a first name set the date and owner.'}
                          placeholder={`e.g. Giving Tuesday thanks ${MO[Number(next.slice(5)) - 1].toLowerCase()} 2 camila`}
                          data-k="add:in"
                          value={addText}
                          onChange={(e) => {
                            setAddText(e.target.value);
                            if (!e.target.value.trim()) {
                              setDismissed({ date: false, owner: false });
                              setForceCh(null);
                            }
                          }}
                          onKeyDown={onAddKey}
                          onBlur={onAddBlur}
                        />
                        <span className="pn-add-hint">Enter to add</span>
                      </div>
                      <div className="pn-chips">
                        {caps.parse && parsed.due ? (
                          <button key={`d-${parsed.due}`} type="button" className="pn-pchip pn-new" aria-label={`Date ${shortDate(parsed.due)}. Remove`} onMouseDown={(e) => e.preventDefault()} onClick={() => tapChip('date')}>
                            <Icon name="cal" />
                            {shortDate(parsed.due)}
                            {chipX}
                          </button>
                        ) : null}
                        {caps.parse && ownerP ? (
                          <button key={`o-${ownerP.id}`} type="button" className="pn-pchip pn-new" aria-label={`Owner ${ownerP.name}. Remove`} onMouseDown={(e) => e.preventDefault()} onClick={() => tapChip('owner')}>
                            {ownerP.name}
                            {chipX}
                          </button>
                        ) : hasText ? (
                          <span className="pn-pchip pn-soft">No owner yet</span>
                        ) : null}
                        {hasText && caps.addIssue ? (
                          <button key={`c-${channel}`} type="button" className="pn-pchip pn-new" aria-label={`Channel ${channel}. Remove`} onMouseDown={(e) => e.preventDefault()} onClick={() => tapChip('channel')}>
                            <Icon name={chIcon(channel)} />
                            {channel}
                            {chipX}
                          </button>
                        ) : hasText ? (
                          <span className="pn-pchip">
                            <Icon name="image" />
                            Instagram
                          </span>
                        ) : null}
                      </div>
                    </form>
                  )}
                </div>
              ) : null}
              {saveErr ? (
                <p key={errN} className="pn-err" role="alert">
                  <Icon name="alert" />
                  {saveErr}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
