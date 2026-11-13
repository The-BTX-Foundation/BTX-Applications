'use client';

// The refreshed Board members page (route /people; demo apps/design/ops-refresh/directions/p-people). It draws the view the
// server loaded (lib/people-view-loader.ts) and owns what changes on screen:
// - the gold nudge for the board member who has been away longest (3+ days, never the viewer): a drafted message, Edit,
//   one gold Send. Live mode sends it as a direct message in Board chat (components/people/people-writes.ts) and says
//   "Sent" only after the message saved; a failed send keeps the words with Retry. There is no Undo in live mode (no unsend).
// - one row per member (role, open work, last sign-in); a row opens their open tasks and interviews in place on a laptop
//   and in a bottom sheet on the phone (focus kept inside, Escape and the scrim close it, focus goes back to the row).
// - "Give admin rights" / "Remove admin rights" with a confirm panel. The button says "Saving…" until the server answers;
//   only then is the change drawn ("· Undo" is a second change) and announced, once. Shown only to a viewer with admin
//   rights and never on their own row (lib/people-map.ts canChangeRole); the server action re-reads the caller's role from
//   the auth server and refuses everything else (lib/people-actions.ts). A refusal shows the server's reason; no answer in
//   time says so and claims nothing. Each write carries a sequence number, so a late answer never undoes a newer change.
// - the "What admin rights add" list (right column, or folded under the list), and the admin-only test push (phone).
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fold, useFoldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { clock, daysFrom, dueTitle, fullDate, rel, shortDate, weekday, atDay } from '@/lib/refresh-time';
import {
  NO_ROLE_CHANGES,
  calloutPerson,
  canStartRole,
  shownRole,
  takeIn,
  NO_WORK,
  RIGHTS,
  RIGHTS_NOTE,
  canChangeRole,
  changedLine,
  cnt,
  draftNudge,
  firstName,
  isOld,
  lastTitle,
  lastWord,
  nudgeBox,
  offeredRole,
  peopleDemo,
  settleRole,
  staleOf,
  startRole,
  summary,
  taskCount,
  type NudgeSend,
  type RoleState,
} from '@/lib/people-map';
import { claimNudgeWords, nudgeWordsServerSnapshot, nudgeWordsSnapshot, sendKeepingWords, setNudgeWords, subscribeNudgeWords } from '@/lib/people-unsent';
import type { PeoplePerson, PeopleTask, PeopleView, PeopleWork } from '@/lib/people-view';
import { ADMIN_RIGHTS_LIST, type StaffRole } from '@/lib/role';
import { useInApp } from '@/lib/use-in-app';
import { changeRoleLive, sendNudgeLive, type RoleResult } from './people-writes';
import '@/components/refresh/refresh.css';
import './people.css';

type Props = { view: PeopleView; live: boolean; role: StaffRole; demo?: string };

/** The last rights change, for "Keith Dawson now has admin rights, 9:15 AM · Undo". */
type Changed = { id: string; to: StaffRole; at: string; undone: boolean };

const NOT_SENT = 'Not sent. Check your connection and try again.';
const MOCK_REFUSED = "The admin rights didn't change. Try again.";
const RIGHTS_CHANGED = 'Your admin rights changed. Reload to see what you can do now.';

// The gold tick before a done line.
const Tick = () => (
  <span className="bm-tick">
    <Icon name="check" />
  </span>
);

// The page.
export function PeopleBoard({ view, live, role, demo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const inApp = useInApp();
  const ms = useFoldMs();
  const { caps, me, today } = view;
  const flags = peopleDemo(demo, live);
  const isAdmin = role === 'admin';

  /* ---------- Roles: the server's, with this page's changes on top until the server confirms them ---------- */
  const [rs, setRs] = useState<RoleState>(NO_ROLE_CHANGES);
  const [busyN, setBusyN] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const [retrying, startRetry] = useTransition();
  const [seen, setSeen] = useState(view);
  // New server data is taken in only when no rights change is still being saved and no refresh is pending.
  if (seen !== view && busyN === 0 && !refreshing) {
    setSeen(view);
    const next = takeIn(rs, busyN, refreshing);
    if (next !== rs) setRs(next);
  }
  const people: PeoplePerson[] = view.people.map((p) => {
    const r = shownRole(rs, p);
    return r === p.role ? p : { ...p, role: r };
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? null;
  const workOf = (id: string): PeopleWork => view.work[id] ?? NO_WORK;

  /* ---------- What is open and what was just done ---------- */
  const [phone, setPhone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [sheetLast, setSheetLast] = useState<string | null>(null);
  const [sends, setSends] = useState<Record<string, NudgeSend>>({});
  const [draftOpen, setDraftOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  // The last rights change per person (each keeps its "· Undo" until that person's next change).
  const [changed, setChanged] = useState<Record<string, Changed>>({});
  const [roleMsg, setRoleMsg] = useState<{ id: string; msg: string; unknown: boolean } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [needsEditFor, setNeedsEditFor] = useState<string | null>(null);
  // The person the gold callout was pinned to by an Edit or a send (lib/people-map.ts calloutPerson).
  const [pinned, setPinned] = useState<string | null>(null);
  // The viewer's role as this board last saw it: losing admin rights mid-visit (a refresh) keeps the board and says so.
  const [seenRole, setSeenRole] = useState(role);
  if (role !== seenRole) {
    setSeenRole(role);
    if (seenRole === 'admin') {
      setConfirm(null);
      setRoleMsg((m) => (m ? { ...m, msg: RIGHTS_CHANGED, unknown: false } : m));
    }
  }
  const [rightsOpen, setRightsOpen] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [announce, setAnnounce] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const goldRef = useRef<HTMLButtonElement>(null);
  const focusK = useRef<string | null>(null);
  const sheetFrom = useRef<string | null>(null);
  const minute = useRef(0);
  const timers = useRef<number[]>([]);
  const chains = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const seqN = useRef(0);
  const latest = useRef(new Map<string, number>());
  const flying = useRef(new Set<string>());

  // Unsent nudge words, by the person they are for: kept per signed-in person outside the board (lib/people-unsent.ts).
  claimNudgeWords(me);
  const words = useSyncExternalStore(subscribeNudgeWords, () => nudgeWordsSnapshot(me), nudgeWordsServerSnapshot);

  const later = (fn: () => void, wait: number) => {
    timers.current.push(window.setTimeout(fn, wait));
  };
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  // The phone layout (under 760px): a member opens in a sheet. Read after mount, so the server and first render agree;
  // crossing the line closes whatever was open.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const sync = () => setPhone(mq.matches);
    sync();
    const change = () => {
      sync();
      setOpenId(null);
      setConfirm(null);
    };
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, []);

  // The gold Send keeps its width while it says "Sending…".
  useEffect(() => {
    let off = false;
    void document.fonts?.ready.then(() => {
      const b = goldRef.current;
      if (!off && b) b.style.minWidth = `${b.offsetWidth}px`;
    });
    return () => {
      off = true;
    };
  }, []);

  // Moves focus where the last action asked (after React has drawn it); a textarea gets the caret at its end.
  useEffect(() => {
    const k = focusK.current;
    if (!k) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`);
    // The target is gone (closed, or its person left the list): forget it, so it never grabs focus later.
    focusK.current = null;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
  });

  // Reads messages to screen readers one after another (each cleared first so the same words are read again); messages
  // that arrive together are queued, never dropped.
  const queue = useRef<string[]>([]);
  const speaking = useRef(false);
  const pump = () => {
    const m = queue.current.shift();
    if (m === undefined) {
      speaking.current = false;
      return;
    }
    speaking.current = true;
    setAnnounce('');
    later(() => {
      setAnnounce(m);
      later(pump, queue.current.length ? 900 : 0);
    }, 30);
  };
  const say = (m: string) => {
    queue.current.push(m);
    if (!speaking.current) pump();
  };

  // "9:14 AM": the real Eastern time in live mode; the sample's 9:14 AM, then a minute per action, in mock mode.
  const stamp = () => {
    if (live) return clock(new Date().toISOString());
    const m = 9 * 60 + 14 + minute.current++;
    return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
  };

  const flash = (id: string) => {
    setFlashId(id);
    later(() => setFlashId((f) => (f === id ? null : f)), 1600);
  };

  // Runs a live write after every earlier write on the same person; when the last one settles, one refresh.
  const enqueue = <T,>(id: string, write: () => Promise<T>): Promise<T> => {
    const prev = chains.current.get(id) ?? Promise.resolve();
    const next = prev.then(write, write);
    chains.current.set(id, next);
    running.current += 1;
    setBusyN((b) => b + 1);
    void next.finally(() =>
      window.setTimeout(() => {
        if (chains.current.get(id) === next) chains.current.delete(id);
        running.current -= 1;
        setBusyN((b) => b - 1);
        if (running.current === 0 && live) startRefresh(() => router.refresh());
      }, 0),
    );
    return next;
  };

  /* ---------- Open a member: in place (laptop), sheet (phone) ---------- */

  const toggle = (id: string) => {
    setConfirm(null);
    setRoleMsg(null);
    if (phone) {
      sheetFrom.current = `row:${id}`;
      setSheetLast(id);
      setOpenId(id);
      return;
    }
    const was = openId;
    if (was && was !== id) {
      setClosingId(was);
      later(() => setClosingId((c) => (c === was ? null : c)), ms + 20);
    }
    setOpenId(was === id ? null : id);
    if (was === id) {
      setClosingId(id);
      later(() => setClosingId((c) => (c === id ? null : c)), ms + 20);
    }
  };

  // The open person left the list on a refresh: close (the sheet never stays open empty); focus goes back to the list.
  if (openId && !byId.has(openId)) setOpenId(null);
  const sheetOn = phone && !!openId && byId.has(openId);
  const closeSheet = () => {
    setOpenId(null);
    setConfirm(null);
  };
  // Phone sheet: focus its Close button when it opens, give focus back to the row when it closes, keep the page still.
  useEffect(() => {
    if (!sheetOn) {
      const k = sheetFrom.current;
      if (k) {
        sheetFrom.current = null;
        (rootRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? rootRef.current?.querySelector<HTMLElement>('.bm-row'))?.focus({ preventScroll: true });
      }
      return;
    }
    const t = window.setTimeout(() => sheetRef.current?.querySelector<HTMLElement>('.bm-shclose')?.focus({ preventScroll: true }), 30);
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = body;
    };
  }, [sheetOn]);
  // Keeps Tab inside the open sheet; Escape closes it.
  const sheetKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const els = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select')].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    const at = document.activeElement as HTMLElement | null;
    // Focus on something that is not a control (the "Sent" line after a send): Tab goes to the first control, Shift+Tab to
    // the last, never out of the sheet.
    if (!at || !els.includes(at)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && at === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ---------- Nudges ---------- */

  const draftOf = (p: PeoplePerson) => draftNudge(p, workOf(p.id), { me, today, interviewsStart: view.interviewsStart, nameOf });
  const key = (id: string, s: string) => `pd:${id}:${s}`;

  // Sends `body` to `p`: mock waits like the demo (or fails with ?demo=failsend); live posts the direct message.
  const deliver = (p: PeoplePerson, body: string): Promise<string> => {
    if (live) return sendNudgeLive(me, p.id, body).then((r) => clock(r.createdAt));
    return new Promise((resolve, reject) => later(() => (flags.failSend ? reject(new Error('demo')) : resolve(stamp())), 450));
  };

  const wordsOf = (p: PeoplePerson) => words[p.id] ?? draftOf(p);
  const typing = () => document.activeElement instanceof HTMLTextAreaElement && !!rootRef.current?.contains(document.activeElement);

  const openNudge = (p: PeoplePerson) => {
    const on = !draftOpen[p.id];
    setDraftOpen((d) => ({ ...d, [p.id]: on }));
    setSends((s) => (s[p.id]?.failed === 'row' ? { ...s, [p.id]: {} } : s));
    setConfirm(null);
    focusK.current = on ? key(p.id, 'nsend') : key(p.id, 'nudge');
  };
  const editNudge = (p: PeoplePerson) => {
    setNudgeWords(me, p.id, wordsOf(p));
    setEditing(p.id);
    focusK.current = key(p.id, 'ntext');
  };
  const cancelNudge = (p: PeoplePerson) => {
    setDraftOpen((d) => ({ ...d, [p.id]: false }));
    setSends((s) => (s[p.id]?.failed ? { ...s, [p.id]: {} } : s));
    setEditing((e) => (e === p.id ? null : e));
    setNudgeWords(me, p.id, null);
    focusK.current = key(p.id, 'nudge');
  };
  // Sends the nudge to `p` from the gold callout or their row. One send per person at a time across both controls; once it
  // saved, both show it sent. A failure keeps the words, shows Retry in the control it came from, and leaves focus in the
  // text box when the person is typing there.
  const sendNudge = (p: PeoplePerson, from: 'needs' | 'row') => {
    if (flying.current.has(p.id) || sends[p.id]?.sent) return;
    const body = wordsOf(p).trim();
    if (!body) return;
    flying.current.add(p.id);
    if (from === 'needs') setPinned(p.id);
    setSends((s) => ({ ...s, [p.id]: { sending: true } }));
    // The words sent are saved when the send starts, so Retry sends exactly these (and reuses the same message id).
    sendKeepingWords(me, p.id, body, (b) => deliver(p, b)).then(
      (at) => {
        flying.current.delete(p.id);
        setSends((s) => ({ ...s, [p.id]: { sent: at } }));
        setEditing((e) => (e === p.id ? null : e));
        setNeedsEditFor((e) => (e === p.id ? null : e));
        setDraftOpen((d) => ({ ...d, [p.id]: false }));
        if (from === 'needs') focusK.current = caps.nudgeUndo ? `needs:undo:${p.id}` : `needs:sent:${p.id}`;
        else focusK.current = caps.nudgeUndo ? key(p.id, 'nundo') : key(p.id, 'sent');
        say(`Nudge sent to ${p.name}`);
      },
      () => {
        flying.current.delete(p.id);
        setSends((s) => ({ ...s, [p.id]: { failed: from } }));
        // Focus goes to this person's own Retry (the callout stays pinned to them); a missing target is simply dropped.
        if (!typing()) focusK.current = from === 'needs' ? `needs:send:${p.id}` : key(p.id, 'nsend');
        say(NOT_SENT);
      },
    );
  };
  const undoNudge = (p: PeoplePerson, from: 'needs' | 'row') => {
    setSends((s) => ({ ...s, [p.id]: {} }));
    focusK.current = from === 'needs' ? `needs:send:${p.id}` : key(p.id, 'nudge');
    say('Nudge taken back');
  };

  // The gold callout's person (computed from the real last sign-ins; never the viewer, never someone not signed in yet).
  // Its state is read by that person's id (lib/people-map.ts nudgeBox), so a refresh that changes the person starts clean.
  const stale = calloutPerson(pinned, staleOf(people, me, today), people);
  const box = stale ? nudgeBox(stale.id, sends, needsEditFor) : null;

  /* ---------- Admin rights ---------- */

  const askRights = (p: PeoplePerson) => {
    const on = confirm !== p.id;
    setConfirm(on ? p.id : null);
    setRoleMsg(null);
    focusK.current = on ? key(p.id, 'rights') : key(p.id, 'ask');
  };
  const cancelRights = (p: PeoplePerson) => {
    setConfirm(null);
    focusK.current = key(p.id, 'ask');
  };
  // Saves a rights change: the button says "Saving…" until the server answers (live: the server action, which re-checks
  // everything; mock: the demo's short wait, refused with ?demo=failrole). Only the server's answer is drawn and announced,
  // once: done, refused (its reason), or no answer in time (says so, claims nothing). A newer write on the same person makes
  // an older one's answer count for nothing.
  const setRole = (p: PeoplePerson, to: StaffRole, undone: boolean) => {
    if (!canStartRole(rs, role, me, p, caps.changeRole)) return;
    const seq = ++seqN.current;
    latest.current.set(p.id, seq);
    setRs((s) => startRole(s, p.id, to, seq));
    setRoleMsg((m) => (m && m.id === p.id ? null : m));
    const write = live
      ? () => changeRoleLive(p.id, to)
      : () => new Promise<RoleResult>((res) => later(() => res(flags.failRole ? { ok: false, reason: MOCK_REFUSED } : { ok: true }), 450));
    void enqueue(p.id, write).then((res) => {
      setRs((s) => settleRole(s, p.id, seq, res).state);
      if (latest.current.get(p.id) !== seq) return;
      if (res.ok) {
        setChanged((c) => ({ ...c, [p.id]: { id: p.id, to, at: stamp(), undone } }));
        setConfirm((c) => (c === p.id ? null : c));
        flash(p.id);
        focusK.current = undone ? key(p.id, 'ask') : key(p.id, 'rundo');
        say(changedLine(p.name, to, undone));
        return;
      }
      const msg = res.reason;
      setChanged((c) => {
        const n = { ...c };
        delete n[p.id];
        return n;
      });
      setConfirm((c) => (c === p.id ? null : c));
      setRoleMsg({ id: p.id, msg, unknown: !!res.unknown });
      focusK.current = key(p.id, 'ask');
      say(msg);
    });
  };

  /* ---------- Test push (admins, phone; live only inside the iPhone app) ---------- */

  const showPush = isAdmin && (!live || inApp);
  const sendPush = async () => {
    if (!live) {
      setPushMsg({ ok: true, text: `Sent ${stamp()}. It should arrive in a few seconds.` });
      say('Test push sent');
      return;
    }
    setPushBusy(true);
    try {
      const r = await fetch('/api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = (await r.json().catch(() => null)) as { configured?: boolean; delivered?: number; noDevice?: number } | null;
      let m: { ok: boolean; text: string };
      if (!r.ok || !j) m = { ok: false, text: "Couldn't send the test." };
      else if (!j.configured) m = { ok: false, text: 'Push is not set up on the server yet.' };
      else if (j.noDevice) m = { ok: false, text: 'This phone has no notifications on. Turn on Notifications in the menu first.' };
      else m = j.delivered ? { ok: true, text: 'Sent. It should arrive in a few seconds.' } : { ok: false, text: "Sent, but Apple didn't accept it. Try again in a minute." };
      setPushMsg(m);
      say(m.text);
    } catch {
      setPushMsg({ ok: false, text: "Couldn't send the test." });
      say("Couldn't send the test.");
    } finally {
      setPushBusy(false);
    }
  };

  // "Try again" on the load error: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  /* ---------- Drawing ---------- */

  const head = <PageHeader title="Board members" date={view.dateLabel} search={false} />;
  const live_ = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (view.loadFailed) {
    return (
      <div className="rf bm" ref={rootRef}>
        {head}
        <section className="bm-errbox" aria-label="Board members">
          <div className="bm-loaderr" role="alert">
            <p>
              <Icon name="alert" />
              Board members didn&apos;t load.
            </p>
            <button type="button" className="rf-btn" onClick={retry} disabled={retrying}>
              Try again
            </button>
          </div>
        </section>
        {live_}
      </div>
    );
  }

  const meta = (p: PeoplePerson) => (
    <span className="bm-meta">
      {p.title ? <span>{p.title}</span> : null}
      {p.role === 'admin' ? (
        <span className={`bm-tag${changed[p.id]?.to === 'admin' ? ' bm-new' : ''}`}>
          <Icon name="key" />
          Admin rights
        </span>
      ) : null}
      {p.id === me ? <span className="bm-you">You</span> : null}
    </span>
  );

  const workCell = (p: PeoplePerson) => {
    if (view.workFailed) return <span className="bm-nothing">Couldn&apos;t count</span>;
    const w = workOf(p.id);
    const n = taskCount(w);
    const ivs = w.interviews;
    if (!ivs.length && !n) return <span className="bm-nothing">Nothing open</span>;
    return (
      <>
        {ivs.length ? (
          <span className="bm-ivs" role="img" aria-label={`${ivs.length} interview${ivs.length > 1 ? 's' : ''}: ${ivs.map((v) => shortDate(v.day)).join(', ')}`}>
            {ivs.map((v) => (
              <span key={v.id} title={`${fullDate(v.day)}, ${v.time}`}>
                <b>{weekday(v.day)}</b>
                {atDay(v.day).getUTCDate()}
              </span>
            ))}
          </span>
        ) : null}
        {n ? (
          <span className="bm-tks">
            <span className="bm-sqs" aria-hidden="true">
              {Array.from({ length: Math.min(n, 6) }, (_, k) => {
                const t = w.tasks[k];
                const late = !!t?.dueOn && daysFrom(today, t.dueOn) < 0;
                return <i key={k} className={late ? 'bm-late' : undefined} />;
              })}
            </span>
            {cnt(n)} task{n === 1 ? '' : 's'}
          </span>
        ) : null}
      </>
    );
  };

  const taskLi = (t: PeopleTask, extra: ReactNode) => {
    const late = !!t.dueOn && daysFrom(today, t.dueOn) < 0;
    return (
      <li key={t.id}>
        <span className="bm-tt">{t.title}</span>
        <span className="bm-tm">
          {t.area ? <span className="bm-area">{t.area}</span> : null}
          {extra}
        </span>
        <span className="bm-due" title={dueTitle(today, t.dueOn)}>
          {late ? <span className="bm-late">{rel(today, t.dueOn)}</span> : rel(today, t.dueOn)}
        </span>
      </li>
    );
  };

  const detail = (p: PeoplePerson) => {
    const w = workOf(p.id);
    const n = taskCount(w);
    const self = p.id === me;
    const ns = sends[p.id] ?? {};
    const drafting = !!draftOpen[p.id];
    const saving = !!rs.pending[p.id];
    const can = canChangeRole(role, me, p.id, caps.changeRole) && !p.nameIsEmail;
    const failed = view.workFailed;
    const ch = changed[p.id] ?? null;
    const rm = roleMsg && roleMsg.id === p.id ? roleMsg : null;
    return (
      <div className="bm-pd" data-id={p.id}>
        <div className="bm-pdgrid">
          <section aria-label={self ? 'Your open tasks' : 'Open tasks'}>
            <h3>
              {self ? 'Your open tasks' : 'Open tasks'}
              {failed ? null : <span className="bm-n">{cnt(n)}</span>}
            </h3>
            <ul className="bm-pt">
              {w.tasks.map((t) =>
                taskLi(
                  t,
                  <>
                    {t.note ? <span>{t.note}</span> : null}
                    {t.waitsOn ? (
                      <span>
                        Waiting on <span className="rf-nowrap">{firstName(nameOf(t.waitsOn) ?? '')}</span>
                      </span>
                    ) : null}
                  </>,
                ),
              )}
              {w.more ? (
                <li className="bm-more">
                  <Link className="rf-lnk" href="/tasks">
                    {w.more} more in Tasks
                  </Link>
                </li>
              ) : null}
              {failed ? <li className="bm-emptyl">Couldn&apos;t load open tasks.</li> : !n ? <li className="bm-emptyl">No open tasks.</li> : null}
            </ul>
            {w.waiting.length ? (
              <>
                <h3 className="bm-h3-gap">
                  You&apos;re waiting on {firstName(p.name)}
                  <span className="bm-n">{w.waiting.length}</span>
                </h3>
                <ul className="bm-pt">{w.waiting.map((t) => taskLi(t, <span>Your task</span>))}</ul>
              </>
            ) : null}
          </section>
          <section aria-label="Interviews">
            <h3>
              Interviews
              {failed ? null : <span className="bm-n">{w.interviews.length}</span>}
            </h3>
            <ul className="bm-pt">
              {w.interviews.map((v) => {
                const mate = v.mateId ? (v.mateId === me ? 'you' : nameOf(v.mateId)) : null;
                return (
                  <li key={v.id}>
                    <span className="bm-tt">
                      <span className="rf-nowrap">{v.applicant}</span>
                    </span>
                    <span className="bm-tm">
                      <span className="rf-nowrap">{v.code}</span>
                      {mate ? (
                        <span>
                          with <span className="rf-nowrap">{mate}</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="bm-due" title={`${fullDate(v.day)}, ${v.time}`}>
                      {rel(today, v.day)}, {v.time}
                    </span>
                  </li>
                );
              })}
              {failed ? <li className="bm-emptyl">Couldn&apos;t load interviews.</li> : !w.interviews.length ? <li className="bm-emptyl">No interviews.</li> : null}
            </ul>
          </section>
        </div>
        <div className="bm-acts">
          {self ? (
            <Link className="rf-lnk" href="/tasks" data-k={key(p.id, 'tasks')}>
              Open your tasks
            </Link>
          ) : !p.nameIsEmail ? (
            <>
              {caps.nudge && !ns.sent ? (
                <button type="button" className="rf-lnk" data-k={key(p.id, 'nudge')} aria-expanded={drafting} onClick={() => openNudge(p)}>
                  Nudge {firstName(p.name)}
                </button>
              ) : null}
              {caps.message ? (
                <Link className="rf-lnk" href="/chat" data-k={key(p.id, 'msg')}>
                  Message in Board chat
                </Link>
              ) : null}
            </>
          ) : null}
          {can ? (
            <button type="button" className="rf-lnk" data-k={key(p.id, 'ask')} aria-expanded={confirm === p.id} onClick={() => askRights(p)}>
              {p.role === 'admin' ? 'Remove admin rights' : 'Give admin rights'}
            </button>
          ) : null}
          {ns.sent ? (
            <span className="bm-done" tabIndex={-1} data-k={key(p.id, 'sent')}>
              <Tick />
              Nudge sent in Board chat, {ns.sent}
              {caps.nudgeUndo ? (
                <>
                  &nbsp;·&nbsp;
                  <button type="button" className="rf-lnk" data-k={key(p.id, 'nundo')} onClick={() => undoNudge(p, 'row')}>
                    Undo
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
          {ch ? (
            <span className="bm-done">
              <Tick />
              {changedLine(p.name, ch.to, ch.undone)}, {ch.at}
              {ch.undone ? null : (
                <>
                  &nbsp;·&nbsp;
                  <button type="button" className="rf-lnk" data-k={key(p.id, 'rundo')} aria-disabled={saving || undefined} onClick={() => setRole(p, ch.to === 'admin' ? 'board' : 'admin', true)}>
                    {saving ? 'Saving…' : 'Undo'}
                  </button>
                </>
              )}
            </span>
          ) : null}
          {rm ? (
            rm.unknown ? (
              <p className="bm-unknown">{rm.msg}</p>
            ) : (
              <p className="rf-saveerr">
                <Icon name="alert" />
                {rm.msg}
              </p>
            )
          ) : null}
        </div>
        {drafting && !ns.sent ? (
          <div className="bm-draft">
            <span className="bm-dl">
              To <span className="rf-nowrap">{p.name}</span> in Board chat
            </span>
            {editing === p.id ? (
              <textarea
                className="bm-dtext"
                rows={3}
                aria-label={`Message to ${p.name}`}
                data-k={key(p.id, 'ntext')}
                readOnly={!!ns.sending}
                value={wordsOf(p)}
                onChange={(e) => setNudgeWords(me, p.id, e.target.value)}
              />
            ) : (
              <p className="bm-dtext">{wordsOf(p)}</p>
            )}
            <div className="bm-dact">
              {ns.failed === 'row' ? (
                <p className="bm-fail">
                  <Icon name="alert" />
                  {NOT_SENT}
                </p>
              ) : null}
              <button type="button" className="rf-btn" data-k={key(p.id, 'nsend')} disabled={ns.sending} onClick={() => sendNudge(p, 'row')}>
                <Icon name="send" />
                {ns.sending ? 'Sending…' : ns.failed === 'row' ? 'Retry' : 'Send'}
              </button>
              {editing === p.id ? null : (
                <button type="button" className="rf-lnk" onClick={() => editNudge(p)}>
                  Edit
                </button>
              )}
              <button type="button" className="rf-lnk" data-k={key(p.id, 'ncancel')} onClick={() => cancelNudge(p)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {confirm === p.id && can ? (
          <div className="bm-confirm" role="group" aria-labelledby={`bm-cf-${p.id}`}>
            <h4 id={`bm-cf-${p.id}`}>{p.role === 'admin' ? `Remove admin rights from ${p.name}?` : `Give ${p.name} admin rights?`}</h4>
            <p>{p.role === 'admin' ? `${firstName(p.name)} stays a board member and can still do everything else.` : `With admin rights, ${firstName(p.name)} can also ${ADMIN_RIGHTS_LIST}.`}</p>
            <div className="bm-dact">
              <button type="button" className="rf-btn" data-k={key(p.id, 'rights')} aria-disabled={saving || undefined} onClick={() => setRole(p, offeredRole(p.role), false)}>
                {saving ? 'Saving…' : p.role === 'admin' ? 'Remove admin rights' : 'Give admin rights'}
              </button>
              <button type="button" className="rf-lnk" data-k={key(p.id, 'rcancel')} onClick={() => cancelRights(p)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const rightsList = (
    <ul className="bm-rlist">
      {RIGHTS.map((r) => (
        <li key={r}>
          <Icon name="key" />
          {r}
        </li>
      ))}
      <li className="bm-rnote">{RIGHTS_NOTE}</li>
    </ul>
  );

  const others = people.filter((p) => p.id !== me).length;
  const sheetP = phone ? (byId.get(openId ?? '') ?? byId.get(sheetLast ?? '')) : undefined;

  return (
    <div className="rf bm" ref={rootRef}>
      {head}
      <div className="bm-board">
        <div className="rf-col">
          {stale ? (
            <section className="bm-needs" aria-labelledby="bm-nh">
              <div className="bm-ntop">
                <span className="rf-avatar rf-round bm-av" aria-hidden="true">
                  {stale.initials}
                </span>
                <h2 id="bm-nh">
                  A nudge for <span className="rf-nowrap">{stale.name}</span>
                </h2>
              </div>
              {box?.state === 'sent' ? (
                <div className="bm-nact">
                  <span className="bm-done" tabIndex={-1} data-k={`needs:sent:${stale.id}`}>
                    <Tick />
                    Sent in Board chat, {box.at}
                    {caps.nudgeUndo ? (
                      <>
                        &nbsp;·&nbsp;
                        <button type="button" className="rf-lnk" data-k={`needs:undo:${stale.id}`} onClick={() => undoNudge(stale, 'needs')}>
                          Undo
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : (
                <>
                  <div className="bm-nmsg">
                    <span className="bm-dl">To {firstName(stale.name)} in Board chat</span>
                    {box?.editing ? (
                      <textarea
                        className="bm-dtext"
                        rows={3}
                        aria-label={`Message to ${stale.name}`}
                        data-k={`needs:text:${stale.id}`}
                        readOnly={box.state === 'sending'}
                        value={wordsOf(stale)}
                        onChange={(e) => setNudgeWords(me, stale.id, e.target.value)}
                      />
                    ) : (
                      <p className="bm-dtext">{wordsOf(stale)}</p>
                    )}
                  </div>
                  <div className="bm-nact">
                    {box?.state === 'failed' ? (
                      <p className="bm-fail">
                        <Icon name="alert" />
                        {NOT_SENT}
                      </p>
                    ) : null}
                    {caps.nudge ? (
                      <button type="button" ref={goldRef} className="rf-btn rf-btn-gold" data-k={`needs:send:${stale.id}`} disabled={box?.state === 'sending'} onClick={() => sendNudge(stale, 'needs')}>
                        <Icon name="send" />
                        <span>{box?.state === 'sending' ? 'Sending…' : box?.state === 'failed' ? 'Retry' : 'Send nudge'}</span>
                      </button>
                    ) : null}
                    {box?.editing || !caps.nudge ? null : (
                      <button
                        type="button"
                        className="rf-lnk"
                        onClick={() => {
                          setNudgeWords(me, stale.id, wordsOf(stale));
                          setNeedsEditFor(stale.id);
                          setPinned(stale.id);
                          focusK.current = `needs:text:${stale.id}`;
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : null}

          <Panel id="bm-mh" title="Board members" action={<span className="bm-sum">{summary(people)}</span>}>
            <div className="bm-colh" aria-hidden="true">
              <span>Person</span>
              <span>Open work</span>
              <span>Signed in</span>
              <span />
            </div>
            <ul>
              {people.map((p) => {
                const open = openId === p.id;
                const shown = !phone && (open || closingId === p.id);
                return (
                  <li key={p.id} className="bm-mem">
                    <button
                      type="button"
                      className={`bm-row${flashId === p.id ? ' bm-flash' : ''}`}
                      data-k={`row:${p.id}`}
                      aria-expanded={open}
                      aria-controls={phone ? undefined : `bm-pd-${p.id}`}
                      onClick={() => toggle(p.id)}
                    >
                      <span className={`rf-avatar rf-round bm-av${p.id === me ? ' bm-me' : ''}`} aria-hidden="true">
                        {p.initials}
                      </span>
                      <span className="bm-who">
                        <span className={`bm-nm${p.nameIsEmail ? ' bm-email' : ''}`} title={p.nameIsEmail ? p.name : undefined}>
                          {p.name}
                        </span>
                        {meta(p)}
                      </span>
                      <span className="bm-work">{workCell(p)}</span>
                      <span className={`bm-last${isOld(today, p.lastDay) ? ' bm-old' : ''}`} title={lastTitle(p.lastDay)}>
                        {lastWord(today, p.lastDay)}
                      </span>
                      <Icon name="down" className="bm-chev" />
                    </button>
                    <Fold open={!phone && open} className="bm-inplace" id={`bm-pd-${p.id}`}>
                      {shown ? detail(p) : null}
                    </Fold>
                  </li>
                );
              })}
            </ul>
            {others === 0 ? <p className="rf-none">Board members show here once their accounts are set up.</p> : null}
            <div className="bm-rfold">
              <button type="button" className="bm-rfold-btn" aria-expanded={rightsOpen} aria-controls="bm-rfold" onClick={() => setRightsOpen((o) => !o)}>
                What admin rights add
                <Icon name="down" />
              </button>
              <Fold open={rightsOpen} id="bm-rfold">
                <div className="bm-rights">{rightsList}</div>
              </Fold>
            </div>
          </Panel>

          {showPush ? (
            <section className="bm-push" aria-label="Notifications on this phone">
              <div className="bm-pushin">
                <b>Notifications on this phone</b>
                <span>
                  {pushMsg ? (
                    <span className="bm-done">
                      {pushMsg.ok ? <Tick /> : null}
                      {pushMsg.text}
                    </span>
                  ) : (
                    <button type="button" className="rf-lnk" disabled={pushBusy} onClick={sendPush}>
                      {pushBusy ? 'Sending…' : 'Send a test push'}
                    </button>
                  )}
                </span>
              </div>
            </section>
          ) : null}
        </div>

        <div className="rf-col bm-colb">
          <Panel id="bm-rh" title="What admin rights add">
            <div className="bm-rights">{rightsList}</div>
          </Panel>
        </div>
      </div>

      <div className={`bm-scrim${sheetOn ? ' bm-on' : ''}`} onClick={closeSheet} />
      <section ref={sheetRef} className={`bm-sheet${sheetOn ? ' bm-on' : ''}`} role="dialog" aria-modal="true" aria-labelledby="bm-sh-title" aria-hidden={!sheetOn} onKeyDown={sheetKey}>
        {sheetP ? (
          <>
            <div className="bm-shhead">
              <div className="bm-grab" aria-hidden="true" />
              <button type="button" className="bm-shclose" aria-label="Close" onClick={closeSheet}>
                <Icon name="x" />
              </button>
              <span className={`rf-avatar rf-round bm-av${sheetP.id === me ? ' bm-me' : ''}`} aria-hidden="true">
                {sheetP.initials}
              </span>
              <span className="bm-who">
                <span className={`bm-nm${sheetP.nameIsEmail ? ' bm-email' : ''}`} id="bm-sh-title">
                  {sheetP.name}
                </span>
                {meta(sheetP)}
              </span>
            </div>
            <div className="bm-shbody">{detail(sheetP)}</div>
          </>
        ) : null}
      </section>
      {live_}
    </div>
  );
}
