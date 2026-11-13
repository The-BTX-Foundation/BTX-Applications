'use client';

// The refreshed Tasks page (Ops Hub refresh, demo p-tasks). This one client component owns the page's state: the tabs
// (Mine / Team / Approvals), the filters (person on Team, area, search), the list (done with the 5-second Undo, snooze,
// schedule, nudge draft, add in place), the detail that opens in place on a laptop and as a sheet on the phone (checklist,
// approval, Mark done, comments), the phone swipe, the live-region announcements and the "Couldn't save" line.
// Reference for look and behaviour: apps/design/ops-refresh/directions/p-tasks/index.html (its script).
//
// Mock mode (`live` false) changes this page's state only, like the demo. Live mode writes through ./tasks-writes, puts
// things back when the database says no, and refreshes the server data once the writes settle (so the sidebar counts
// follow). Controls whose `view.caps` flag is false are not drawn (no dead controls); approvals are never decided here in
// live mode: their Review link goes to /finance/budget/approval.
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TasksView } from '@/lib/tasks-view';
import { byDue, daysFrom, detailActions, emptyLine, fullDate, groupOf, inTab, kindOf, matches, nextUp, rel, taskRowActions, TASK_GROUPS, weekday, type TasksFilter, type TasksTab } from '@/lib/tasks-time';
import { snoozeDays, type ParsedTask } from '@/lib/today-time';
import { Fold, foldMs, isPhone, Nw } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { Tabs } from '@/components/refresh/tabs';
import { TasksAdd, type AddTaskHandle } from './tasks-add';
import { TaskDetail, type DetailHandlers } from './tasks-detail';
import { TaskRow, UndoLine, type BoardTask, type NudgeUi, type Phase, type RowHandlers } from './tasks-row';
import { TaskSkelRows } from './tasks-skeleton';
import { addTask, forgetIds, markDone, moveDue, reopen, writeComment } from './tasks-writes';
import { reseed, settleAdd, settleComment, shouldReseed } from '@/lib/tasks-reseed';
import '@/components/refresh/refresh.css';
import './tasks.css';

const SWIPE_W = 176;
const NO_NUDGE: NudgeUi = { state: 'none', editing: false, text: '', sending: false };
// A phase in which a task still counts as open (on the list, ticked but not yet folded, or moving after a snooze).
const COUNTS: Phase[] = ['open', 'checking', 'closing', 'moving'];
const UNDO: Phase[] = ['undo', 'undoClosing'];

type Props = {
  view: TasksView;
  live: boolean;
  /** The tab to start on (`?tab=team|approvals`). */
  startTab: TasksTab;
  /** The list failed to load: the rest of the page draws, the list says so with Try again. */
  tasksFailed: boolean;
  /** Mock `?demo=loading`: the page draws with its list as grey rows (as the demo's loading state). */
  loading?: boolean;
};

// A task as the board first holds it.
function toBoard(t: TasksView['tasks'][number]): BoardTask {
  return { ...t, phase: 'open', nonce: 0, fx: null, decided: null, decidedStep: -1 };
}


// The page.
export function TasksBoard({ view, live, startTab, tasksFailed, loading = false }: Props) {
  const router = useRouter();
  const { today, caps, me } = view;
  const [tasks, setTasks] = useState<BoardTask[]>(() => view.tasks.map(toBoard));
  // Live writes still running, whether the server data on hand predates a write (`stale`), and the refresh that runs once
  // the writes settle. New server data is taken in only when no write is running, the data is not stale and no refresh
  // is pending, so data fetched before the last write finished is never used.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sig = view.tasks.map((t) => `${t.id}:${t.dueOn ?? ''}:${t.title}:${t.comments.length}`).join('|');
  const [seenSig, setSeenSig] = useState(sig);
  const [refreshes, setRefreshes] = useState(0);
  const [seenRefreshes, setSeenRefreshes] = useState(0);
  const [tab, setTab] = useState<TasksTab>(startTab);
  const [who, setWho] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const [psOpen, setPsOpen] = useState(false);
  // The open detail: `openId` is the task whose detail is drawn, `detailOn` whether its fold is open (laptop). Switching
  // closes the old fold first, then opens the new one.
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailOn, setDetailOn] = useState(false);
  const [phone, setPhone] = useState(false);
  const [schedOpen, setSchedOpen] = useState<Set<string>>(new Set());
  // The open snooze strip: a task id (under the row) or `d:<id>` (inside the detail).
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, NudgeUi>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // Tasks finished on this page (title, and where they sat in the list), for "Done this week".
  const [finished, setFinished] = useState<{ id: string; title: string; order: number }[]>([]);
  const [doneOpen, setDoneOpen] = useState(false);
  const [exactId, setExactId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [failN, setFailN] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();
  // New server data (see above). A task the server lists again leaves "Done this week"; when the refresh takes away the
  // task whose detail or sheet is open, the detail closes.
  // Every settled refresh counts (`refreshes`), even when the list looks the same, and so does a hidden row the server lists
  // again (live): a row hidden after a failed Undo whose reopen did land comes back (lib/tasks-reseed.ts shouldReseed).
  const goneListed = live && tasks.some((t) => t.phase === 'gone' && view.tasks.some((x) => x.id === t.id));
  if (shouldReseed({ sigChanged: sig !== seenSig, refreshed: refreshes !== seenRefreshes, goneListed, busy, stale, refreshing })) {
    setSeenSig(sig);
    setSeenRefreshes(refreshes);
    // The ids on screen now are no longer retried by an add or comment with the same words (a deliberate second
    // "Call Sam" is a new task).
    forgetIds(view.tasks.flatMap((t) => [t.id, ...t.comments.map((c) => c.id)]));
    const next = reseed(tasks, view.tasks, toBoard);
    setTasks(next);
    const listed = new Set(view.tasks.map((t) => t.id));
    if (finished.some((f) => listed.has(f.id))) setFinished((f) => f.filter((x) => !listed.has(x.id)));
    if (openId && !next.some((t) => t.id === openId && t.phase !== 'gone')) {
      setOpenId(null);
      setDetailOn(false);
    }
  }

  const timers = useRef<Record<string, number>>({});
  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const focusK = useRef<string | null>(null);
  const popK = useRef<string | null>(null);
  const seq = useRef(0);
  const addRef = useRef<AddTaskHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const openRow = useRef<HTMLElement | null>(null);
  const sheetFrom = useRef<string | null>(null);
  const [sheetLast, setSheetLast] = useState<string | null>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  // The tab in use now (read by timers that outlive the render that set them).
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  });

  const snz = useMemo(() => snoozeDays(today), [today]);
  const snoozeWd = { tomorrow: weekday(snz.tomorrow), monday: weekday(snz.nextMonday), same: snz.tomorrow === snz.nextMonday };
  const people = useMemo(() => new Map(view.people.map((p) => [p.id, p])), [view.people]);
  // Names that never break across lines: people, applicants on the schedule, who an approval goes back to.
  const names = useMemo(() => {
    const n = new Set<string>(view.people.map((p) => p.name));
    view.tasks.forEach((t) => {
      t.schedule?.forEach((s) => n.add(s.name));
      if (t.approval?.askName) n.add(t.approval.askName);
    });
    return [...n];
  }, [view]);
  const filter: TasksFilter = { tab, who, area, q };

  /* ---------- small helpers ---------- */

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);
  // Changes one task.
  const patch = useCallback((id: string, f: (t: BoardTask) => BoardTask) => setTasks((ts) => ts.map((t) => (t.id === id ? f(t) : t))), []);
  // Runs `fn` after `ms`, as the task's one pending timer (a new one replaces the old).
  const later = (id: string, ms: number, fn: () => void) => {
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(fn, ms);
  };
  // Shows "Couldn't save. Try again." after a refused live write. The line is an alert, so it is read once by itself
  // (nothing else announces the failure).
  // A new failure while the line already shows draws it afresh (a new key), so it is announced again.
  const failed = useCallback(() => {
    setSaveFailed(true);
    setFailN((n) => n + 1);
  }, []);
  // Runs a live write after every earlier write on the same task (so Undo's reopen waits for Done's write), counting it
  // as running until it settles. When the last running write settles, one refresh fetches fresh server data.
  const enqueue = <T,>(id: string, write: () => Promise<T>): Promise<T> => {
    const prev = queue.current.get(id) ?? Promise.resolve();
    const next = prev.then(write, write);
    queue.current.set(id, next);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    // One tick later, so the caller's own .then (rollback or not) has run first.
    void next.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(id) === next) queue.current.delete(id);
        running.current -= 1;
        setBusy((b) => b - 1);
        if (running.current === 0) {
          startRefresh(() => {
            setStale(false);
            setRefreshes((n) => n + 1);
            router.refresh();
          });
        }
      }, 0),
    );
    return next;
  };
  // A row added in live mode whose insert has not come back yet has no real id: writes on it wait.
  const pendingAdd = (id: string) => live && id.startsWith('new-');
  // Closes the phone swipe that is open.
  const closeSwipe = useCallback((row: HTMLElement | null = openRow.current) => {
    if (!row) return;
    row.style.transform = '';
    if (row === openRow.current) openRow.current = null;
  }, []);
  // The row's own focus target after an action: its check, or an approval's chevron.
  const rowKey = (t: BoardTask | undefined, id: string) => (t?.kind === 'approval' ? `list:${id}:lead` : `list:${id}:check`);
  // Adds a task to "Done this week".
  const markFinished = (t: BoardTask) => setFinished((f) => (f.some((x) => x.id === t.id) ? f : [...f, { id: t.id, title: t.title, order: tasks.findIndex((x) => x.id === t.id) }]));

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => window.clearTimeout(x));
  }, []);

  // The phone layout (under 760px): the detail opens as a sheet. Read after mount, so the server and first render agree.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Moves focus where the last action asked (after React has drawn it); a textarea gets the caret at its end. A checklist
  // step that was just ticked springs.
  useEffect(() => {
    const k = focusK.current;
    if (!k) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`);
    if (!el) return;
    focusK.current = null;
    el.focus({ preventScroll: true });
    if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
    if (popK.current === k) {
      popK.current = null;
      el.classList.add('rf-pop');
    }
  });

  /* ---------- Open a task: in place (laptop) or as a sheet (phone) ---------- */

  // A decided approval leaves the list once its detail closes, and joins "Done this week".
  const finalize = (t: BoardTask | undefined) => {
    if (!t || !t.decided) return;
    patch(t.id, (x) => ({ ...x, phase: 'gone' }));
    markFinished(t);
  };
  // Opens a task's detail (or closes it when it is the open one; `null` closes whatever is open). `from` is the control
  // that opened it, where focus returns when the phone sheet closes.
  const toggleOpen = (target: string | null, from?: string) => {
    const prev = openId;
    const id = prev === target ? null : target;
    const prevT = prev ? tasks.find((x) => x.id === prev) : undefined;
    setDeclineId(null);
    if (phone) {
      if (id) {
        sheetFrom.current = from ?? `list:${id}:open`;
        setSheetLast(id);
      } else finalize(prevT);
      setOpenId(id);
      return;
    }
    const leaving = !!prevT?.decided;
    // Opens the new detail once the old one has folded shut.
    const go = () => {
      setOpenId(id);
      setDetailOn(!!id);
      finalize(prevT);
      focusK.current = id ? `list:${id}:open` : prev && !leaving ? `list:${prev}:open` : null;
      if (id) say('Details open');
    };
    if (prev) {
      setDetailOn(false);
      if (leaving) patch(prev, (x) => ({ ...x, phase: 'closing' }));
      window.setTimeout(go, foldMs());
    } else go();
  };
  // Closes the detail at once when the filters or tab no longer show its task.
  const closeIfHidden = (f: TasksFilter) => {
    const t = openId ? tasks.find((x) => x.id === openId) : undefined;
    if (!t || matches(t, f)) return;
    finalize(t);
    setOpenId(null);
    setDetailOn(false);
  };

  // Phone sheet: focus its Close button when it opens, give focus back to what opened it when it closes, and keep the page
  // behind it still.
  const sheetOn = phone && !!openId;
  useEffect(() => {
    if (!sheetOn) {
      const k = sheetFrom.current;
      if (k) {
        sheetFrom.current = null;
        // The control that opened it, or (when a refresh took its task away) the open tab, never the page body.
        const el = rootRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`) ?? document.getElementById(`tk-tab-${tabRef.current}`);
        el?.focus({ preventScroll: true });
      }
      return;
    }
    const t = window.setTimeout(() => sheetRef.current?.querySelector<HTMLElement>('.tk-sh-close')?.focus({ preventScroll: true }), 30);
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = body;
    };
  }, [sheetOn]);
  // Keeps Tab inside the open sheet.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const els = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select')].filter((x) => x.offsetParent !== null);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ---------- Done: check springs, title strikes, row folds after 1.2 s, "Done · Undo" for 5 s ---------- */

  // Ticks a task done (or takes a tick back while the row is still showing it).
  const complete = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    // Backstop: never tick a row the row itself would not offer a check for (approvals, prompts), nor an unsaved add.
    if (!t || pendingAdd(id) || !taskRowActions(t, caps).check) return;
    // A second tap while ticked takes it back (before the row folds away).
    if (t.phase === 'checking') {
      window.clearTimeout(timers.current[id]);
      patch(id, (x) => ({ ...x, phase: 'open' }));
      if (live) void enqueue(id, () => reopen(id, t.status ?? 'open')).then((ok) => ok || stillDone(t));
      return;
    }
    if (t.phase !== 'open') return;
    if (openId === id) {
      setDetailOn(false);
      if (phone) setOpenId(null);
      else window.setTimeout(() => setOpenId((o) => (o === id ? null : o)), foldMs());
    }
    closeSwipe();
    setSaveFailed(false);
    patch(id, (x) => ({ ...x, phase: 'checking', fx: null }));
    if (live) {
      void enqueue(id, () => markDone(id)).then((ok) => {
        if (ok) return;
        // Focus on its Undo line (or the folding row) goes to the row's check once the row is back.
        if (rootRef.current?.querySelector(`.rf-item[data-id="u-${id}"], .rf-item[data-id="${id}"]`)?.contains(document.activeElement) || document.activeElement === document.body) {
          focusK.current = `list:${id}:check`;
        }
        // Put the row back, unless it was already taken back.
        patch(id, (x) => {
          if (x.phase === 'open') return x;
          window.clearTimeout(timers.current[id]);
          return { ...x, phase: 'open', nonce: x.nonce + 1, fx: 'enter' };
        });
        setFinished((f) => f.filter((x) => x.id !== id));
        failed();
      });
    }
    later(id, 1200, () => {
      patch(id, (x) => (x.phase === 'checking' ? { ...x, phase: 'closing' } : x));
      later(id, foldMs(), () => {
        // Focus inside the folding row moves to its Undo.
        const item = rootRef.current?.querySelector(`.rf-item[data-id="${id}"]`);
        if (item && item.contains(document.activeElement)) focusK.current = `list:${id}:undo`;
        setSnoozeId((s) => (s === id || s === `d:${id}` ? null : s));
        patch(id, (x) => (x.phase === 'closing' ? { ...x, phase: 'undo' } : x));
        say('Done. Undo available for 5 seconds.');
        later(id, 5000, () => {
          // Focus on the Undo that is leaving moves to the next row's title (or, at the list's end, the open tab).
          focusPast(id);
          patch(id, (x) => (x.phase === 'undo' ? { ...x, phase: 'undoClosing' } : x));
          later(id, foldMs(), () => {
            patch(id, (x) => (x.phase === 'undoClosing' ? { ...x, phase: 'gone' } : x));
            markFinished(t);
          });
        });
      });
    });
  };

  // When focus is on a row (or its Undo line) that is leaving, moves it to the next row's title, or at the list's end to
  // the tab in use now, so it never falls to the page body.
  const focusPast = (id: string) => {
    const root = rootRef.current;
    const line = root?.querySelector(`.rf-item[data-id="u-${id}"]`) ?? root?.querySelector(`.rf-item[data-id="${id}"]`);
    if (!root || !line || !line.contains(document.activeElement)) return;
    const items = [...root.querySelectorAll('.tk-list .rf-item')];
    const n = items.slice(items.indexOf(line) + 1).find((x) => x.querySelector('[data-k$=":open"]'));
    const to = n?.querySelector<HTMLElement>('[data-k$=":open"]') ?? document.getElementById(`tk-tab-${tabRef.current}`);
    to?.focus({ preventScroll: true });
  };

  // Undo: the row comes back where it was, flashes, and the check gets focus.
  const undo = (id: string) => {
    window.clearTimeout(timers.current[id]);
    patch(id, (x) => ({ ...x, phase: 'open', nonce: x.nonce + 1, fx: 'enter' }));
    focusK.current = `list:${id}:check`;
    say('Restored');
    const t = tasks.find((x) => x.id === id);
    if (live && t) void enqueue(id, () => reopen(id, t.status ?? 'open')).then((ok) => ok || stillDone(t));
  };
  // A refused Undo: the task is still done in the database, so the row leaves (into "Done this week") with the plain
  // error line. If the reopen did land and only its answer was lost, the next refresh lists the task again and the row
  // comes back (lib/tasks-reseed.ts), so it is never hidden for the rest of the visit.
  const stillDone = (t: BoardTask) => {
    window.clearTimeout(timers.current[t.id]);
    focusPast(t.id);
    patch(t.id, (x) => ({ ...x, phase: 'gone' }));
    markFinished(t);
    failed();
  };

  /* ---------- Snooze: Tomorrow / Next week; the row folds and comes back in its new group ---------- */

  // Opens or closes the snooze strip under a row.
  const toggleRowSnooze = (id: string) => {
    closeSwipe();
    if (pendingAdd(id)) return;
    const opening = snoozeId !== id;
    setSnoozeId(opening ? id : null);
    if (opening) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-k="list:${id}:snz1"]`)?.focus({ preventScroll: true }), 30);
  };
  // Opens or closes the snooze strip inside the detail.
  const toggleDetailSnooze = (id: string, k: string) => {
    if (pendingAdd(id)) return;
    const opening = snoozeId !== `d:${id}`;
    setSnoozeId(opening ? `d:${id}` : null);
    focusK.current = opening ? `${k}:snz1` : `${k}:dsnz`;
  };
  // Moves a task to tomorrow or next Monday (`null` = Cancel).
  const snooze = (id: string, to: 'tomorrow' | 'monday' | null) => {
    const inDetail = snoozeId === `d:${id}`;
    setSnoozeId(null);
    const cur = tasks.find((x) => x.id === id);
    if (!to) {
      if (!inDetail) focusK.current = rowKey(cur, id);
      return;
    }
    // Backstop: only an open row whose kind offers Snooze, and never an unsaved add.
    if (!cur || cur.phase !== 'open' || pendingAdd(id) || !taskRowActions(cur, caps).snooze) return;
    const before = cur.dueOn;
    const dueOn = to === 'tomorrow' ? snz.tomorrow : snz.nextMonday;
    if (openId === id) {
      setOpenId(null);
      setDetailOn(false);
    }
    setSaveFailed(false);
    patch(id, (x) => ({ ...x, phase: 'moving' }));
    later(id, phone ? 0 : foldMs(), () => {
      patch(id, (x) => ({ ...x, dueOn, phase: 'open', nonce: x.nonce + 1, fx: 'enter' }));
      focusK.current = `list:${id}:open`;
      say(`Snoozed to ${fullDate(dueOn)}`);
    });
    if (live) {
      void enqueue(id, () => moveDue(id, dueOn)).then((ok) => {
        if (ok) return;
        // Stop the fold-in timer first, so it cannot put the new date back after this rollback.
        window.clearTimeout(timers.current[id]);
        patch(id, (x) => ({ ...x, dueOn: before, phase: 'open', nonce: x.nonce + 1, fx: 'enter' }));
        failed();
      });
    }
  };

  /* ---------- Nudge / remind: a drafted message to whoever a task waits on (mock only: no live send exists) ---------- */

  // The drafted message for a task's nudge or reminder.
  const draftOf = (t: BoardTask | undefined) => t?.waiting?.draft ?? t?.remind?.draft ?? '';
  // A task's nudge state (closed, with its draft, until touched).
  const nudgeOf = (t: BoardTask): NudgeUi => nudges[t.id] ?? { ...NO_NUDGE, text: draftOf(t) };
  // Changes one task's nudge state.
  const setNudge = (id: string, f: (n: NudgeUi) => NudgeUi) =>
    setNudges((all) => {
      const cur = all[id] ?? { ...NO_NUDGE, text: draftOf(tasks.find((x) => x.id === id)) };
      return { ...all, [id]: f(cur) };
    });

  const rowH: RowHandlers = {
    onOpen: (id, k) => toggleOpen(id, k),
    onDone: complete,
    onSnoozeToggle: toggleRowSnooze,
    onSnooze: snooze,
    onSched: (id) =>
      setSchedOpen((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    onNudge: (id) => {
      const opening = (nudges[id]?.state ?? 'none') !== 'draft';
      setNudge(id, (n) => ({ ...n, state: opening ? 'draft' : 'none' }));
      if (opening) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-k="list:${id}:nsend"]`)?.focus({ preventScroll: true }), 30);
    },
    onNudgeEdit: (id) => {
      setNudge(id, (n) => ({ ...n, editing: true }));
      focusK.current = `list:${id}:ntext`;
    },
    onNudgeCancel: (id) => {
      setNudge(id, (n) => ({ ...n, state: 'none' }));
      // The draft resets once it has folded away.
      window.setTimeout(() => setNudges((all) => ({ ...all, [id]: { ...NO_NUDGE, text: draftOf(tasks.find((x) => x.id === id)) } })), foldMs());
    },
    onNudgeText: (id, text) => setNudge(id, (n) => ({ ...n, text })),
    onNudgeSend: (id) => {
      const t = tasks.find((x) => x.id === id);
      if (!t || live) return;
      const text = nudgeOf(t).text.trim() || draftOf(t);
      setNudge(id, (n) => ({ ...n, text, sending: true }));
      // "Sending…", the draft folds away, then "Nudged just now" and focus back on the row.
      window.setTimeout(() => {
        setNudge(id, (n) => ({ ...n, state: 'none', sending: false }));
        window.setTimeout(() => {
          setNudge(id, (n) => ({ ...n, state: 'sent', editing: false }));
          focusK.current = `list:${id}:open`;
          say(t.remind ? `Reminder sent to ${t.remind.count} students` : `Nudge sent to ${t.waiting?.name ?? ''}`);
        }, foldMs());
      }, 450);
    },
  };

  /* ---------- Inside the detail: checklist, approval (mock), Mark done, Snooze, comments ---------- */

  const detailH: DetailHandlers = {
    onTick: (id, i, k) => {
      const t = tasks.find((x) => x.id === id);
      if (!t?.checklist || !detailActions(t, caps).tick) return;
      const on = !t.checklist[i].done;
      patch(id, (x) => ({ ...x, checklist: x.checklist?.map((c, j) => (j === i ? { ...c, done: on } : c)) ?? null }));
      focusK.current = k;
      if (on) popK.current = k;
      say(on ? 'Checked' : 'Unchecked');
    },
    onMarkDone: (id) => {
      if (phone) {
        toggleOpen(null);
        window.setTimeout(() => complete(id), foldMs() ? 260 : 0);
      } else complete(id);
    },
    onSnoozeToggle: toggleDetailSnooze,
    onSnooze: snooze,
    onApprove: (id, k, btn) => {
      const t = tasks.find((x) => x.id === id);
      if (!t || approving || !detailActions(t, caps).approve) return;
      // Keeps the button's width while it says "Approving…".
      btn.style.minWidth = `${btn.offsetWidth}px`;
      setApproving(id);
      window.setTimeout(() => {
        const step = t.checklist ? t.checklist.findIndex((c) => !c.done) : -1;
        patch(id, (x) => ({ ...x, decided: 'approved', decidedStep: step, checklist: x.checklist?.map((c, j) => (j === step ? { ...c, done: true } : c)) ?? null }));
        setApproving(null);
        focusK.current = `${k}:aundo`;
        // "Q4 plan, October to December" is announced as "Q4 budget approved".
        const what = (t.approval?.heading.split(',')[0] ?? 'Budget').replace(/ plan$/, ' budget');
        say(`${what} approved. Undo available.`);
      }, 600);
    },
    onApprovalUndo: (id, k) => {
      patch(id, (x) => ({ ...x, decided: null, decidedStep: -1, checklist: x.checklist?.map((c, j) => (j === x.decidedStep ? { ...c, done: false } : c)) ?? null }));
      focusK.current = `${k}:approve`;
      say('Approval undone');
    },
    onDeclineToggle: (id, k) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      // Without a typed reason, Decline decides at once.
      if (!detailActions(t, caps).reason) return detailH.onDeclineSend(id, k);
      const opening = declineId !== id;
      setDeclineId(opening ? id : null);
      focusK.current = opening ? `${k}:why` : `${k}:decline`;
    },
    onDeclineSend: (id, k) => {
      const t = tasks.find((x) => x.id === id);
      if (!t || !detailActions(t, caps).decline) return;
      setDeclineId(null);
      patch(id, (x) => ({ ...x, decided: 'declined' }));
      focusK.current = `${k}:aundo`;
      say(t.approval?.askName ? `Declined and sent back to ${t.approval.askName}` : 'Declined');
    },
    onShowAll: (id) => setShowAll((s) => new Set(s).add(id)),
    onDraft: (id, text) => setDrafts((d) => ({ ...d, [id]: text })),
    onComment: (id, k) => {
      const body = (drafts[id] ?? '').trim();
      const t = tasks.find((x) => x.id === id);
      if (!body || !t || pendingAdd(id) || !detailActions(t, caps).comment) return;
      const tmp = `c-new-${++seq.current}`;
      patch(id, (x) => ({ ...x, comments: [...x.comments, { id: tmp, by: me, at: 'just now', body }] }));
      setFresh((f) => new Set(f).add(tmp));
      setDrafts((d) => ({ ...d, [id]: '' }));
      setSaveFailed(false);
      focusK.current = k;
      say('Comment sent');
      if (live) {
        void enqueue(id, () => writeComment(id, body, me)).then((real) => {
          if (!real) {
            patch(id, (x) => ({ ...x, comments: x.comments.filter((c) => c.id !== tmp) }));
            return failed();
          }
          // The real id may already be in the thread (a retry of a comment whose first try landed): then the copy leaves.
          patch(id, (x) => ({ ...x, comments: settleComment(x.comments, tmp, real) }));
        });
      }
    },
  };

  /* ---------- Add a task in place ---------- */

  // Adds a typed task to the list (and, live, to the database).
  const add = (p: ParsedTask, text: string): boolean => {
    const tmp = `new-${++seq.current}`;
    // Live: tasks.area is required, so with no area word and no filter it takes the first area. The area's stored slug
    // comes from the areas table (view.areaSlugs), never a list typed into the page.
    const areaName = p.area ?? (live ? (view.areas[0] ?? '') : '');
    const slug = view.areaSlugs?.[areaName] ?? view.tasks.find((x) => x.areaName === areaName && x.areaSlug)?.areaSlug ?? null;
    if (live && !slug) {
      failed();
      return false;
    }
    const t: BoardTask = {
      ...toBoard({ id: tmp, title: p.title, kind: 'task', areaName, dueOn: p.dueOn, ownerId: me, mine: true, link: null, schedule: null, waiting: null, remind: null, checklist: null, checklistLine: null, approval: null, comments: [], extra: null, stored: true }),
      fx: 'enter',
    };
    setTasks((ts) => [...ts, t]);
    setSaveFailed(false);
    const label = TASK_GROUPS.find(([g]) => g === groupOf(today, p.dueOn))?.[1] ?? 'your list';
    say(`Added to ${label}`);
    if (live) {
      void enqueue(tmp, () => addTask(p.title, slug ?? '', p.dueOn, me)).then((real) => {
        if (!real) {
          setTasks((ts) => ts.filter((x) => x.id !== tmp));
          // The words go back in the field (unless something new was typed since), ready for Try again.
          addRef.current?.restore(text);
          return failed();
        }
        // The row takes the database id, so Done, Snooze and Undo write to the right task (no second grow-in).
        // A retry of an add whose first try landed: the refresh already brought that task in, so this copy leaves.
        setTasks((ts) => settleAdd(ts, tmp, real));
      });
    }
    return true;
  };

  /* ---------- Filters ---------- */

  // Switches tab (the person filter only lives on Team).
  const changeTab = (v: TasksTab) => {
    setTab(v);
    const nextWho = v === 'team' ? who : '';
    if (v !== 'team') setWho('');
    closeIfHidden({ tab: v, who: nextWho, area, q });
  };
  // Picks an area.
  const changeArea = (v: string) => {
    setArea(v);
    closeIfHidden({ ...filter, area: v });
    say(v ? `Showing ${v}` : 'Showing all areas');
  };
  // Picks a person (Team tab).
  const changeWho = (v: string) => {
    setWho(v);
    closeIfHidden({ ...filter, who: v });
  };
  // Changes the search words.
  const changeQ = (v: string) => {
    setQ(v);
    closeIfHidden({ ...filter, q: v });
  };
  // "Clear filters" under an empty list.
  const clearFilters = () => {
    setArea('');
    setWho('');
    setQ('');
    focusK.current = 'f:area';
    say('Filters cleared');
  };

  /* ---------- Counts, the news card, done this week ---------- */

  const counted = tasks.filter((t) => COUNTS.includes(t.phase) && !t.decided);
  // How many open tasks a tab holds.
  const tabCount = (tb: TasksTab) => counted.filter((t) => inTab(t, tb)).length;
  const TABS: { id: TasksTab; label: string; count: number }[] = [
    { id: 'mine', label: 'Mine', count: tabCount('mine') },
    { id: 'team', label: 'Team', count: tabCount('team') },
    { id: 'appr', label: 'Approvals', count: tabCount('appr') },
  ];
  const news = nextUp(today, counted.filter((t) => t.phase === 'open' || t.phase === 'checking' || t.phase === 'moving'));
  // Opens the task the news card is about (on Mine, with the filters cleared) and brings it into view on a laptop.
  const openNews = (id: string) => {
    setTab('mine');
    setArea('');
    setQ('');
    if (openId !== id) toggleOpen(id, `list:${id}:open`);
    if (!isPhone()) {
      window.setTimeout(() => rootRef.current?.querySelector(`.rf-item[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: foldMs() ? 'smooth' : 'auto' }), 0);
    }
  };
  const areaScope = tasks.filter((t) => t.phase !== 'gone' && !UNDO.includes(t.phase) && matches(t, filter, { noArea: true }));
  // Session finishes first (in list order), then the week's earlier ones; a title the server now also lists shows once.
  const doneTitles = useMemo(() => {
    const mineDone = [...finished].sort((a, b) => a.order - b.order).map((f) => f.title);
    const rest = [...view.done];
    for (const tt of mineDone) {
      const i = rest.indexOf(tt);
      if (i >= 0) rest.splice(i, 1);
    }
    return [...mineDone, ...rest];
  }, [finished, view.done]);

  /* ---------- Keys: Escape closes the detail, N opens "Add a task", / goes to search (laptop) ---------- */

  // Handles the page's keys.
  const onPageKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const typing = !!el.closest?.('input, textarea, select, [contenteditable]');
    // In the phone sheet, Escape in an empty reply box closes the sheet; with words in it, Escape only leaves the box.
    const inSheet = sheetOn && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) && !!sheetRef.current?.contains(el);
    if (e.key === 'Escape' && inSheet && el.value.trim()) {
      e.preventDefault();
      sheetRef.current?.querySelector<HTMLElement>('.tk-sh-close')?.focus({ preventScroll: true });
      return;
    }
    if (e.key === 'Escape' && openId && (!typing || inSheet)) {
      e.preventDefault();
      toggleOpen(null);
      return;
    }
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing && caps.add && !loading && !sheetOn) {
      e.preventDefault();
      addRef.current?.open();
    }
    if (e.key === '/' && !typing && !isPhone()) {
      e.preventDefault();
      document.getElementById('tk-q')?.focus();
    }
  };
  // The handler reads this render's state, so it is swapped in after every render (one document listener calls it).
  useEffect(() => {
    keyRef.current = onPageKey;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Phone: swipe a row left to reveal Snooze and Done; long-press a due word for the exact date ---------- */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let sw: { row: HTMLElement; x: number; y: number; base: number; off: number; on: boolean; dead: boolean; pid: number } | null = null;
    let eatClick = false;
    let lp: number | undefined;
    let exactT: number | undefined;
    // Leaves a row swiped open (and closes any other).
    const openSwipe = (row: HTMLElement) => {
      if (openRow.current && openRow.current !== row) closeSwipe(openRow.current);
      row.style.transform = `translateX(${-SWIPE_W}px)`;
      openRow.current = row;
    };
    // Starts a possible swipe or long-press.
    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (openRow.current && !openRow.current.parentElement?.contains(target)) closeSwipe();
      if (!isPhone()) return;
      // Long-press a due word: the exact date for 2 seconds (React state, so React keeps owning the text).
      const due = target.closest<HTMLElement>('.rf-due');
      const dueId = due && root.contains(due) ? due.closest<HTMLElement>('.rf-row')?.dataset.id : undefined;
      if (dueId) {
        lp = window.setTimeout(() => {
          if (sw?.on) return;
          setExactId(dueId);
          window.clearTimeout(exactT);
          exactT = window.setTimeout(() => setExactId((x) => (x === dueId ? null : x)), 2000);
        }, 500);
      }
      const row = target.closest<HTMLElement>('.tk-swipe > .rf-row');
      if (!row || !root.contains(row) || target.closest('input, textarea') || !row.parentElement?.querySelector('.tk-under')) return;
      const base = row === openRow.current ? -SWIPE_W : 0;
      sw = { row, x: e.clientX, y: e.clientY, base, off: base, on: false, dead: false, pid: e.pointerId };
    };
    // Follows the finger once the move is clearly sideways.
    const move = (e: PointerEvent) => {
      if (lp && sw?.on) {
        window.clearTimeout(lp);
        lp = undefined;
      }
      if (!sw || sw.dead) return;
      const dx = e.clientX - sw.x;
      const dy = e.clientY - sw.y;
      if (!sw.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          sw.dead = true;
          return;
        }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          sw.on = true;
          sw.row.classList.add('tk-dragging');
          sw.row.classList.remove('tk-peek');
          try {
            sw.row.setPointerCapture(sw.pid);
          } catch {
            /* the pointer may already be gone */
          }
        } else return;
      }
      // Rubber-band past either end.
      let x = sw.base + dx;
      if (x > 0) x *= 0.2;
      if (x < -SWIPE_W) x = -SWIPE_W + (x + SWIPE_W) * 0.3;
      sw.off = x;
      sw.row.style.transform = `translateX(${x}px)`;
      e.preventDefault();
    };
    // Settles the row open or shut.
    const up = () => {
      window.clearTimeout(lp);
      lp = undefined;
      if (!sw) return;
      if (sw.on) {
        sw.row.classList.remove('tk-dragging');
        eatClick = true;
        window.setTimeout(() => (eatClick = false), 60);
        if (sw.off < -SWIPE_W * 0.4) openSwipe(sw.row);
        else closeSwipe(sw.row);
      }
      sw = null;
    };
    // The click that ends a drag is not a tap. Listened for on window, capture: React listens on its root, so a document
    // listener would run after React's handlers had already treated it as a tap.
    const click = (e: MouseEvent) => {
      if (!eatClick) return;
      e.stopPropagation();
      e.preventDefault();
      eatClick = false;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      window.removeEventListener('click', click, true);
      window.clearTimeout(lp);
      window.clearTimeout(exactT);
    };
  }, [closeSwipe]);

  // One-time peek on the first swipeable row so people learn the swipe (phone, once per browser).
  useEffect(() => {
    if (loading || !isPhone() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    try {
      seen = localStorage.getItem('btx-swipe-peek') === '1';
    } catch {
      /* storage blocked: peek anyway */
    }
    if (seen) return;
    const t = window.setTimeout(() => {
      const r = rootRef.current?.querySelector<HTMLElement>('[data-scope="list"] .tk-swipe:has(> .tk-under) > .rf-row');
      if (!r) return;
      r.classList.add('tk-peek');
      r.addEventListener('animationend', () => r.classList.remove('tk-peek'), { once: true });
      try {
        localStorage.setItem('btx-swipe-peek', '1');
      } catch {
        /* storage blocked */
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [loading]);

  // Clicks in the list: a tap on a swiped-open row closes it; the swipe's Done closes the swipe, then ticks the task; its
  // Review opens the approval's sheet.
  const listClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>('.rf-row');
    if (row && openRow.current === row) {
      e.preventDefault();
      e.stopPropagation();
      closeSwipe();
      return;
    }
    const sd = target.closest<HTMLElement>('[data-swipe-done]');
    if (sd) {
      const id = sd.dataset.swipeDone ?? '';
      closeSwipe();
      window.setTimeout(() => complete(id), foldMs() ? 200 : 0);
      return;
    }
    const so = target.closest<HTMLElement>('[data-swipe-open]');
    if (so) {
      const id = so.dataset.swipeOpen ?? '';
      closeSwipe();
      toggleOpen(id, `list:${id}:open`);
    }
  };

  /* ---------- The list ---------- */

  // A task's detail, in place (laptop) or in the sheet (phone).
  const detailFor = (id: string, mode: 'inplace' | 'sheet') => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return null;
    return (
      <TaskDetail
        t={t}
        mode={mode}
        me={me}
        caps={caps}
        people={people}
        names={names}
        clock={view.clock}
        year={today.slice(0, 4)}
        snoozeOpen={snoozeId === `d:${id}`}
        approving={approving === id}
        declineOpen={declineId === id}
        showAll={showAll.has(id)}
        draft={drafts[id] ?? ''}
        fresh={fresh}
        snoozeWd={snoozeWd}
        h={detailH}
      />
    );
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <>
        <p className="rf-sr" role="status">
          Loading tasks
        </p>
        <div aria-hidden="true">
          <TaskSkelRows />
        </div>
      </>
    );
  } else if (tasksFailed) {
    body = retrying ? (
      <div aria-busy="true">
        <TaskSkelRows />
      </div>
    ) : (
      <p className="tk-errline" role="alert">
        Tasks didn&apos;t load.{' '}
        <button type="button" className="rf-lnk" onClick={() => startRetry(() => router.refresh())}>
          Try again
        </button>
      </p>
    );
  } else {
    const pool = tasks.filter((t) => t.phase !== 'gone' && (UNDO.includes(t.phase) ? inTab(t, tab) : matches(t, filter)));
    if (!pool.length) {
      const whoName = who ? (people.get(who)?.name ?? null) : null;
      const e = emptyLine(filter, whoName);
      body = (
        <div className="rf-empty">
          <p>
            <Nw text={e.text} names={names} />
          </p>
          {e.clear ? (
            <button type="button" className="rf-lnk" data-k="list:clear" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      );
    } else {
      body = TASK_GROUPS.map(([g, label]) => {
        const its = byDue(
          pool.filter((t) => groupOf(today, t.dueOn, !!t.waiting) === g),
          (t) => tasks.indexOf(t),
        );
        if (!its.length) return null;
        return (
          <div key={g} role="presentation">
            <div className={`rf-grp${g === 'late' ? ' rf-g-late' : ''}`}>
              <span>{label}</span>
              <span className="rf-gn">{its.filter((t) => !UNDO.includes(t.phase)).length}</span>
            </div>
            {its.map((t) =>
              UNDO.includes(t.phase) ? (
                <UndoLine key={`u-${t.id}-${t.nonce}`} t={t} onUndo={undo} />
              ) : (
                <TaskRow
                  key={`${t.id}-${t.nonce}`}
                  t={t}
                  tab={tab}
                  today={today}
                  me={me}
                  caps={caps}
                  people={people}
                  names={names}
                  isOpen={openId === t.id}
                  schedOpen={schedOpen.has(t.id)}
                  snoozeOpen={snoozeId === t.id}
                  nudge={nudgeOf(t)}
                  snoozeWd={snoozeWd}
                  exact={exactId === t.id}
                  detail={!phone && openId === t.id ? detailFor(t.id, 'inplace') : null}
                  detailOpen={detailOn}
                  h={rowH}
                />
              ),
            )}
          </div>
        );
      });
    }
  }

  // The phone sheet's task: the open one, or the last one while the sheet slides away.
  const sheetT = phone ? tasks.find((x) => x.id === (openId ?? sheetLast)) : undefined;
  const sheetKind = sheetT ? kindOf(sheetT.kind, false, false) : null;
  const sheetLate = !!sheetT?.dueOn && daysFrom(today, sheetT.dueOn) < 0;
  const otherTabs = (['mine', 'team', 'appr'] as TasksTab[]).filter((x) => x !== tab);

  return (
    <div className="rf tk" ref={rootRef}>
      <header className="rf-head">
        <div>
          <div className="rf-ptitle">
            <h1>Tasks</h1>
            <span className="rf-pdate">{view.dateLabel}</span>
          </div>
          <div>{news ?<NewsCard icon={news.icon} kicker={news.kicker} title={<Nw text={news.title} names={names} />} go={news.go} gold={news.gold} onClick={() => openNews(news.id)} /> : null}</div>
        </div>
        <label className="rf-search">
          <Icon name="search" />
          <input id="tk-q" type="search" placeholder="Search tasks" aria-label="Search tasks" autoComplete="off" value={q} onChange={(e) => changeQ(e.target.value)} />
        </label>
      </header>
      {saveFailed ? (
        <p key={failN} className="rf-saveerr" role="alert">
          <Icon name="alert" />
          Couldn&apos;t save. Try again.
        </p>
      ) : null}

      <section className="tk-card" aria-label="Tasks">
        <Tabs label="Whose tasks" idBase="tk" tabs={TABS} value={tab} onChange={changeTab} />
        <div className="tk-filters" role="group" aria-label="Filter tasks">
          {tab === 'team' ? (
            <>
              <label className={`rf-fchip tk-who${who ? ' rf-on' : ''}`}>
                <span className="rf-nowrap tk-who-n">{who ? (people.get(who)?.name ?? 'Board member') : 'Everyone'}</span>
                <Icon name="down" />
                <select aria-label="Person" data-k="f:who" value={who} onChange={(e) => changeWho(e.target.value)}>
                  <option value="">Everyone</option>
                  {view.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === me ? `${p.name} (you)` : p.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tk-fsep" aria-hidden="true" />
            </>
          ) : null}
          <label className={`rf-fchip${area ? ' rf-on' : ''}`}>
            <span className="rf-k">Area</span>
            <span className="rf-nowrap">{area || 'All'}</span>
            <Icon name="down" />
            <select aria-label="Area" data-k="f:area" value={area} onChange={(e) => changeArea(e.target.value)}>
              <option value="">{`All areas (${areaScope.length})`}</option>
              {view.areas.map((a) => (
                <option key={a} value={a}>{`${a} (${areaScope.filter((t) => t.areaName === a).length})`}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`rf-fchip tk-fsrch${q ? ' rf-on' : ''}`}
            aria-label="Search tasks"
            aria-expanded={psOpen}
            data-k="f:ps"
            onClick={() => {
              const o = !psOpen;
              setPsOpen(o);
              if (o) window.setTimeout(() => document.getElementById('tk-pq')?.focus(), 30);
            }}
          >
            <Icon name="search" />
          </button>
        </div>
        <Fold open={psOpen} className="tk-psearch-fold">
          <div className="tk-psearch">
            <label className="rf-search">
              <Icon name="search" />
              <input id="tk-pq" type="search" placeholder="Search tasks" aria-label="Search tasks" autoComplete="off" value={q} onChange={(e) => changeQ(e.target.value)} />
            </label>
          </div>
        </Fold>

        <div role="tabpanel" id={`tk-p-${tab}`} aria-labelledby={`tk-tab-${tab}`}>
          <div className="tk-list" data-scope="list" onClickCapture={listClick}>
            {body}
          </div>
          {caps.add ? (
            <div hidden={tab === 'appr'}>
              <TasksAdd ref={addRef} today={today} area={area} onAdd={add} onOpening={() => tab === 'appr' && changeTab('mine')} />
            </div>
          ) : null}
          <div className="tk-donebar">
            <button type="button" className="rf-lnk" aria-expanded={doneOpen} aria-controls="tk-donefold" onClick={() => setDoneOpen((o) => !o)}>
              Done this week <span className="tk-donen">{doneTitles.length}</span>
              <Icon name="down" />
            </button>
          </div>
          <Fold open={doneOpen} id="tk-donefold">
            <ul className="tk-donelist">
              {doneTitles.map((d, i) => (
                <li key={`${d}-${i}`}>
                  <span className="tk-ul-tick">
                    <Icon name="check" />
                  </span>
                  <span>
                    <Nw text={d} names={names} />
                  </span>
                </li>
              ))}
            </ul>
          </Fold>
        </div>
        {/* The other tabs' panels exist (empty) so every tab's aria-controls points at a real element. */}
        {otherTabs.map((x) => (
          <div key={x} role="tabpanel" id={`tk-p-${x}`} aria-labelledby={`tk-tab-${x}`} hidden />
        ))}
      </section>

      {phone ? (
        <>
          <div className={`tk-scrim${sheetOn ? ' tk-on' : ''}`} onClick={() => toggleOpen(null)} />
          <section ref={sheetRef} className={`tk-sheet${sheetOn ? ' tk-on' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tk-sh-title" aria-hidden={!sheetOn} onKeyDown={trapTab}>
            {sheetT ? (
              <>
                <div className="tk-sh-head">
                  <div className="tk-grab" aria-hidden="true" />
                  <button type="button" className="tk-sh-close" aria-label="Close" onClick={() => toggleOpen(null)}>
                    <Icon name="x" />
                  </button>
                  <p className="tk-sh-type">
                    {sheetKind && ['post', 'scoring', 'approval'].includes(sheetT.kind) ? (
                      <span className="tk-ty">
                        <Icon name={sheetKind.icon} />
                        {sheetKind.word}
                      </span>
                    ) : null}
                    <span className="rf-chip">{sheetT.areaName || 'No area'}</span>
                    <span title={sheetT.dueOn ? fullDate(sheetT.dueOn) : undefined}>{sheetLate ? <span className="rf-late">{rel(today, sheetT.dueOn)}</span> : `Due ${rel(today, sheetT.dueOn)}`}</span>
                  </p>
                  <h2 className="tk-sh-title" id="tk-sh-title">
                    <Nw text={sheetT.title} names={names} />
                  </h2>
                </div>
                <div className="tk-sh-body">{detailFor(sheetT.id, 'sheet')}</div>
              </>
            ) : null}
          </section>
        </>
      ) : null}
      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
