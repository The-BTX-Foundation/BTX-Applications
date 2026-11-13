'use client';

// The refreshed Today page (Ops Hub refresh, signed off 2026-11-11). This one client component owns the page's state:
// the task list (done with the 5-second Undo, snooze, schedule, nudge draft, add in place), the tabs, the phone swipe,
// the live-region announcements and the "Couldn't save" line. The panels are small presentational parts beside it.
// Reference for look and behaviour: apps/design/ops-refresh/directions/p-today-states/index.html (its script).
//
// Mock mode (`live` false) changes this page's state only, like the demo. Live mode writes through ./today-writes and puts
// the row back when the database says no; after a live write the server data is refreshed so the sidebar counts follow.
// Controls whose `view.caps` flag is false are not drawn (no dead controls).
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TodayView } from '@/lib/today-view';
import { fullDate, groupOf, rowActions, snoozeDays, TODAY_GROUPS, weekday, type ParsedTask } from '@/lib/today-time';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { Tabs } from '@/components/refresh/tabs';
import { AddTask, type AddTaskHandle } from './add-task';
import { Areas } from './areas';
import { BoardChat } from './board-chat';
import { Interviews } from './interviews';
import { NeedsCard } from './needs-card';
import { foldMs, isPhone } from './parts';
import { TaskRow, UndoLine, type BoardTask, type NudgeUi, type Phase, type RowHandlers, type Scope } from './task-row';
import { TdIcon } from './td-icons';
import { TaskRowsSkeleton } from './today-skeleton';
import { addTask, AREA_SLUG, markDone, moveDue, reopen, sendChat, statusBefore } from './today-writes';
import '@/components/refresh/refresh.css';
import './today.css';

type Tab = 'mine' | 'team' | 'appr';
const SWIPE_W = 176;
const NO_NUDGE: NudgeUi = { state: 'none', editing: false, text: '', sending: false };
// A phase in which a task still counts as open (on the list, ticked but not yet folded, or moving after a snooze).
const COUNTS: Phase[] = ['open', 'checking', 'closing', 'moving'];

type Props = {
  view: TodayView;
  live: boolean;
  me: { id: string; initials: string };
};

// Takes in a new server task list without breaking what is on screen: rows keep their phase (a ticked row or its Undo
// line stays until its timers finish, even though the server no longer lists it), new rows join, rows the server
// dropped leave, and a live add still waiting for its insert stays.
function reseed(cur: BoardTask[], fresh: TodayView['tasks']): BoardTask[] {
  const mine = new Map(cur.map((t) => [t.id, t]));
  const ids = new Set(fresh.map((t) => t.id));
  const next: BoardTask[] = fresh.map((t) => {
    const old = mine.get(t.id);
    return old ? { ...t, phase: old.phase, nonce: old.nonce, fx: old.fx } : { ...t, phase: 'open', nonce: 0, fx: null };
  });
  for (const t of cur) if (!ids.has(t.id) && (t.id.startsWith('new-') || (t.phase !== 'open' && t.phase !== 'gone'))) next.push(t);
  return next;
}

// The page.
export function TodayBoard({ view, live, me }: Props) {
  const router = useRouter();
  const { today, caps } = view;
  const [tasks, setTasks] = useState<BoardTask[]>(() => view.tasks.map((t) => ({ ...t, phase: 'open', nonce: 0, fx: null })));
  // Live writes still running (the per-task queue below), whether the server data on hand predates a write (`stale`), and
  // the refresh that runs once the writes settle. New server data is taken in only when no write is running, the data is
  // not stale and no refresh is pending, so data fetched before the last write finished is never used.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  // The server's task list this board last took in; when a refresh brings a different one, the board re-seeds from it.
  const sig = view.tasks.map((t) => `${t.id}:${t.dueOn ?? ''}:${t.title}`).join('|');
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig && busy === 0 && !stale && !refreshing) {
    setSeenSig(sig);
    setTasks((cur) => reseed(cur, view.tasks));
  }
  // Phone long-press on a due word: that row shows its exact date for 2 seconds.
  const [exactId, setExactId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [schedOpen, setSchedOpen] = useState<Set<string>>(new Set());
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, NudgeUi>>({});
  const [reminded, setReminded] = useState(view.needs?.remindedAt != null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();

  const timers = useRef<Record<string, number>>({});
  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const focusK = useRef<string | null>(null);
  const seq = useRef(0);
  const addRef = useRef<AddTaskHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const openRow = useRef<HTMLElement | null>(null);

  const snz = useMemo(() => snoozeDays(today), [today]);
  const names = useMemo(() => {
    const n = new Set<string>();
    view.interviews.forEach((i) => n.add(i.applicantName));
    view.tasks.forEach((t) => t.schedule?.forEach((s) => n.add(s.name)));
    if (view.chat.latest) n.add(view.chat.latest.from);
    return [...n];
  }, [view]);

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
  // Shows "Couldn't save. Try again." after a refused live write.
  const failed = useCallback(() => {
    setSaveFailed(true);
    say("Couldn't save. Try again.");
  }, [say]);
  // Runs a live write after every earlier write on the same task (so Undo's reopen waits for Done's write, and a
  // snooze waits too), counting it as running until it settles. When the last running write settles (and its own
  // success or failure handling has run), one refresh fetches fresh server data so the sidebar counts follow.
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
            router.refresh();
          });
        }
      }, 0),
    );
    return next;
  };
  // A row added in live mode whose insert has not come back yet has no real id: Done and Snooze wait for it.
  const pendingAdd = (id: string) => live && id.startsWith('new-');
  // Closes the phone swipe that is open.
  const closeSwipe = useCallback((row: HTMLElement | null = openRow.current) => {
    if (!row) return;
    row.style.transform = '';
    if (row === openRow.current) openRow.current = null;
  }, []);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => window.clearTimeout(x));
  }, []);

  // Moves focus where the last action asked (after React has drawn it); a textarea gets the caret at its end.
  useEffect(() => {
    const k = focusK.current;
    if (!k) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-k="${k}"]`);
    if (!el) return;
    focusK.current = null;
    el.focus({ preventScroll: true });
    if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
  });

  /* ---------- Done: check springs, title strikes, row folds after 1.2 s, "Done · Undo" for 5 s ---------- */

  const complete = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    // Backstop: never tick a row the row itself would not offer a check for (approvals, prompts), nor an unsaved add.
    if (!t || pendingAdd(id) || !rowActions(t, caps).done) return;
    // A second tap while ticked takes it back (before the row folds away).
    if (t.phase === 'checking') {
      window.clearTimeout(timers.current[id]);
      patch(id, (x) => ({ ...x, phase: 'open' }));
      if (live) {
        void enqueue(id, () => reopen(id, statusBefore(id))).then((ok) => {
          if (ok) return;
          // The task stays done in the database: take the row off the screen too (as a failed Undo does).
          patch(id, (x) => ({ ...x, phase: 'gone' }));
          failed();
        });
      }
      return;
    }
    if (t.phase !== 'open') return;
    closeSwipe();
    setSaveFailed(false);
    patch(id, (x) => ({ ...x, phase: 'checking', fx: null }));
    if (live) {
      void enqueue(id, () => markDone(id)).then((ok) => {
        if (ok) return;
        // Put the row back, unless it was already taken back (then it is open on screen and in the database).
        patch(id, (x) => {
          if (x.phase === 'open') return x;
          window.clearTimeout(timers.current[id]);
          return { ...x, phase: 'open', nonce: x.nonce + 1, fx: 'enter' };
        });
        failed();
      });
    }
    later(id, 1200, () => {
      patch(id, (x) => (x.phase === 'checking' ? { ...x, phase: 'closing' } : x));
      later(id, foldMs(), () => {
        // Focus inside the folding row moves to its Undo.
        const item = rootRef.current?.querySelector(`.rf-item[data-id="${id}"]`);
        const had = !!item && item.contains(document.activeElement);
        const sc = had ? (document.activeElement?.closest('[data-scope]') as HTMLElement | null)?.dataset.scope : null;
        if (sc) focusK.current = `${sc}:${id}:undo`;
        setSnoozeId((s) => (s === id ? null : s));
        patch(id, (x) => (x.phase === 'closing' ? { ...x, phase: 'undo' } : x));
        say('Done. Undo available for 5 seconds.');
        later(id, 5000, () => {
          patch(id, (x) => (x.phase === 'undo' ? { ...x, phase: 'undoClosing' } : x));
          later(id, foldMs(), () => patch(id, (x) => (x.phase === 'undoClosing' ? { ...x, phase: 'gone' } : x)));
        });
      });
    });
  };

  // Undo: the row comes back where it was, flashes, and the check gets focus.
  const undo = (id: string, sc: Scope) => {
    window.clearTimeout(timers.current[id]);
    patch(id, (x) => ({ ...x, phase: 'open', nonce: x.nonce + 1, fx: 'enter' }));
    focusK.current = `${sc}:${id}:check`;
    say('Restored');
    if (live) {
      void enqueue(id, () => reopen(id, statusBefore(id))).then((ok) => {
        if (ok) return;
        patch(id, (x) => ({ ...x, phase: 'gone' }));
        failed();
      });
    }
  };

  /* ---------- Snooze: Tomorrow / Next week; the row folds and comes back in its new group ---------- */

  const toggleSnooze = (id: string, sc: Scope) => {
    closeSwipe();
    if (pendingAdd(id)) return;
    const opening = snoozeId !== id;
    setSnoozeId(opening ? id : null);
    if (opening) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-k="${sc}:${id}:snz1"]`)?.focus({ preventScroll: true }), 30);
  };
  const snooze = (id: string, to: 'tomorrow' | 'monday' | null, sc: Scope) => {
    setSnoozeId(null);
    if (!to) {
      focusK.current = `${sc}:${id}:check`;
      return;
    }
    const cur = tasks.find((x) => x.id === id);
    // Backstop: only an open row whose kind offers Snooze, and never an unsaved add.
    if (!cur || cur.phase !== 'open' || pendingAdd(id) || !rowActions(cur, caps).snooze) return;
    const before = cur.dueOn;
    const dueOn = to === 'tomorrow' ? snz.tomorrow : snz.nextMonday;
    setSaveFailed(false);
    patch(id, (x) => ({ ...x, phase: 'moving' }));
    later(id, foldMs(), () => {
      patch(id, (x) => ({ ...x, dueOn, phase: 'open', nonce: x.nonce + 1, fx: 'enter' }));
      focusK.current = `${sc}:${id}:check`;
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

  /* ---------- Nudge: a drafted message to the person a task waits on, sent in Board chat ---------- */

  const nudgeOf = (t: BoardTask): NudgeUi => nudges[t.id] ?? { ...NO_NUDGE, text: t.waiting?.draft ?? '' };
  const setNudge = (id: string, f: (n: NudgeUi) => NudgeUi) =>
    setNudges((all) => {
      const t = tasks.find((x) => x.id === id);
      const cur = all[id] ?? { ...NO_NUDGE, text: t?.waiting?.draft ?? '' };
      return { ...all, [id]: f(cur) };
    });
  const handlers: RowHandlers = {
    onDone: complete,
    onSnoozeToggle: toggleSnooze,
    onSnooze: snooze,
    onSched: (id) =>
      setSchedOpen((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    onNudge: (id, sc) => {
      const opening = (nudges[id]?.state ?? 'none') !== 'draft';
      setNudge(id, (n) => ({ ...n, state: opening ? 'draft' : 'none' }));
      if (opening) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`[data-k="${sc}:${id}:nsend"]`)?.focus({ preventScroll: true }), 30);
    },
    onNudgeEdit: (id, sc) => {
      setNudge(id, (n) => ({ ...n, editing: true }));
      focusK.current = `${sc}:${id}:ntext`;
    },
    onNudgeCancel: (id) => {
      setNudge(id, (n) => ({ ...n, state: 'none' }));
      // The draft resets once it has folded away.
      window.setTimeout(() => setNudges((all) => ({ ...all, [id]: { ...NO_NUDGE, text: tasks.find((x) => x.id === id)?.waiting?.draft ?? '' } })), foldMs());
    },
    onNudgeText: (id, text) => setNudge(id, (n) => ({ ...n, text })),
    onNudgeSend: (id, sc) => {
      const t = tasks.find((x) => x.id === id);
      const cur = t ? nudgeOf(t) : NO_NUDGE;
      const text = cur.text.trim() || t?.waiting?.draft || '';
      const who = t?.waiting?.on ?? '';
      setNudge(id, (n) => ({ ...n, text, sending: true }));
      setSaveFailed(false);
      // Folds the draft away, then shows "Nudged just now" and puts focus back on the row.
      const finish = () => {
        setNudge(id, (n) => ({ ...n, state: 'none', sending: false }));
        window.setTimeout(() => {
          setNudge(id, (n) => ({ ...n, state: 'sent', editing: false }));
          focusK.current = `${sc}:${id}:check`;
          say(`Nudge sent to ${who}`);
        }, foldMs());
      };
      if (live && view.chat.channelId) {
        void sendChat(view.chat.channelId, text).then((ok) => {
          if (ok) return finish();
          setNudge(id, (n) => ({ ...n, sending: false }));
          failed();
        });
      } else window.setTimeout(finish, 450);
    },
  };

  /* ---------- Add a task in place ---------- */

  const add = (p: ParsedTask) => {
    const tmp = `new-${++seq.current}`;
    const areaName = p.area ?? (live ? 'Scholarships' : '');
    const t: BoardTask = { id: tmp, title: p.title, areaName, dueOn: p.dueOn, kind: 'task', link: null, videoLinks: false, waiting: null, schedule: null, commentCount: 0, phase: 'open', nonce: 0, fx: 'enter' };
    setTasks((ts) => [...ts, t]);
    setSaveFailed(false);
    const label = TODAY_GROUPS.find(([g]) => g === groupOf(today, p.dueOn))?.[1] ?? 'your list';
    say(`Added to ${label}`);
    if (live) {
      // Live: the area defaults to Scholarships when none was typed (tasks.area is required); the Tasks page also defaults
      // to the first area.
      void enqueue(tmp, () => addTask(p.title, AREA_SLUG[areaName] ?? 'scholarships', p.dueOn, me.id)).then((real) => {
        if (!real) {
          setTasks((ts) => ts.filter((x) => x.id !== tmp));
          return failed();
        }
        // The row takes the database id, so Done, Snooze and Undo write to the right task (no second grow-in).
        setTasks((ts) => ts.map((x) => (x.id === tmp ? { ...x, id: real, fx: null } : x)));
      });
    }
  };

  /* ---------- Counts and tabs ---------- */

  const openTasks = tasks.filter((t) => COUNTS.includes(t.phase));
  const mineCount = openTasks.length + (view.needs && caps.remind && !reminded ? 1 : 0);
  const apprCount = openTasks.filter((t) => t.kind === 'approval').length;
  const doneTaskIds = useMemo(() => new Set(tasks.filter((t) => !COUNTS.includes(t.phase)).map((t) => t.id)), [tasks]);
  const openTaskIds = useMemo(() => new Set(tasks.filter((t) => COUNTS.includes(t.phase)).map((t) => t.id)), [tasks]);

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'mine', label: 'Mine', count: mineCount },
    { id: 'team', label: 'Team', count: view.teamOpen },
    { id: 'appr', label: 'Approvals', count: apprCount },
  ];
  /* ---------- Laptop: N opens "Add a task" ---------- */

  useEffect(() => {
    if (!caps.add || view.tasksFailed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        addRef.current?.open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [caps.add, view.tasksFailed]);

  /* ---------- Phone: swipe a row left to reveal Snooze and Done; long-press a due word for the exact date ---------- */

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let sw: { row: HTMLElement; x: number; y: number; base: number; off: number; on: boolean; dead: boolean; pid: number } | null = null;
    let eatClick = false;
    let lp: number | undefined;
    let exactT: number | undefined;
    const openSwipe = (row: HTMLElement) => {
      if (openRow.current && openRow.current !== row) closeSwipe(openRow.current);
      row.style.transform = `translateX(${-SWIPE_W}px)`;
      openRow.current = row;
    };
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
      const row = target.closest<HTMLElement>('.td-swipe > .rf-row');
      if (!row || !root.contains(row) || target.closest('input, textarea') || !row.parentElement?.querySelector('.td-under')) return;
      const base = row === openRow.current ? -SWIPE_W : 0;
      sw = { row, x: e.clientX, y: e.clientY, base, off: base, on: false, dead: false, pid: e.pointerId };
    };
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
          sw.row.classList.add('td-dragging');
          sw.row.classList.remove('td-peek');
          try {
            sw.row.setPointerCapture(sw.pid);
          } catch {
            /* the pointer may already be gone */
          }
        } else return;
      }
      let x = sw.base + dx;
      if (x > 0) x *= 0.2;
      if (x < -SWIPE_W) x = -SWIPE_W + (x + SWIPE_W) * 0.3;
      sw.off = x;
      sw.row.style.transform = `translateX(${x}px)`;
      e.preventDefault();
    };
    const up = () => {
      window.clearTimeout(lp);
      lp = undefined;
      if (!sw) return;
      if (sw.on) {
        sw.row.classList.remove('td-dragging');
        eatClick = true;
        window.setTimeout(() => (eatClick = false), 60);
        if (sw.off < -SWIPE_W * 0.4) openSwipe(sw.row);
        else closeSwipe(sw.row);
      }
      sw = null;
    };
    // The click that ends a drag is not a tap. Listened for on window: React itself listens on document (Next.js mounts
    // the app on it), so a document listener would run after React's handlers had already treated it as a tap.
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

  // One-time peek on the first row so people learn the swipe (phone, once per browser).
  useEffect(() => {
    if (!isPhone() || !caps.done || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let seen = false;
    try {
      seen = localStorage.getItem('btx-swipe-peek') === '1';
    } catch {
      /* storage blocked: peek anyway */
    }
    if (seen) return;
    const t = window.setTimeout(() => {
      // Only a row that has a swipe tray (approvals and prompts have none); "seen" is kept only once a row has peeked.
      const r = rootRef.current?.querySelector<HTMLElement>('[data-scope="mine"] .td-swipe:has(> .td-under) > .rf-row');
      if (!r) return;
      r.classList.add('td-peek');
      r.addEventListener('animationend', () => r.classList.remove('td-peek'), { once: true });
      try {
        localStorage.setItem('btx-swipe-peek', '1');
      } catch {
        /* storage blocked */
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [caps.done]);

  // Clicks inside a list: a tap on a swiped-open row closes it; the swipe's Done closes the swipe, then ticks the task.
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
    }
  };

  /* ---------- The lists ---------- */

  const list = (sc: Scope) => {
    const pool = tasks.filter((t) => t.phase !== 'gone' && (sc === 'mine' || t.kind === 'approval'));
    if (!pool.length) return <StateLine kind="empty">{sc === 'appr' ? 'Nothing waits for your approval.' : 'Nothing on your list.'}</StateLine>;
    const order = (t: BoardTask) => (t.dueOn ? Date.parse(t.dueOn) : 9e15);
    return TODAY_GROUPS.map(([g, label]) => {
      const its = pool.filter((t) => groupOf(today, t.dueOn, !!t.waiting) === g).sort((a, b) => order(a) - order(b) || tasks.indexOf(a) - tasks.indexOf(b));
      if (!its.length) return null;
      return (
        <div key={g} role="presentation">
          <div className={`rf-grp${g === 'late' ? ' rf-g-late' : ''}`}>
            <span>{label}</span>
            <span className="rf-gn">{its.length}</span>
          </div>
          {its.map((t) =>
            t.phase === 'undo' || t.phase === 'undoClosing' ? (
              <UndoLine key={`u-${t.id}-${t.nonce}`} t={t} sc={sc} onUndo={undo} />
            ) : (
              <TaskRow
                key={`${t.id}-${t.nonce}`}
                t={t}
                sc={sc}
                today={today}
                caps={caps}
                names={names}
                schedOpen={schedOpen.has(t.id)}
                snoozeOpen={snoozeId === t.id}
                nudge={nudgeOf(t)}
                canNudge={caps.nudge && !!view.chat.channelId}
                snoozeWd={{ tomorrow: weekday(snz.tomorrow), monday: weekday(snz.nextMonday), same: snz.tomorrow === snz.nextMonday }}
                exact={exactId === t.id}
                h={handlers}
              />
            ),
          )}
        </div>
      );
    });
  };

  return (
    <div className="rf td" ref={rootRef}>
      <PageHeader title="Today" date={view.dateLabel} />
      {saveFailed ? (
        <p className="rf-saveerr" role="alert">
          <TdIcon name="alert" />
          Couldn&apos;t save. Try again.
        </p>
      ) : null}

      <div className="rf-board">
        <div className="rf-col td-col-a">
          {view.needs ? <NeedsCard needs={view.needs} today={today} canRemind={caps.remind} onReminded={setReminded} say={say} /> : null}

          <Panel id="td-th" title="Your tasks" className="td-tasks">
            {view.tasksFailed ? (
              <StateLine kind="error" retrying={retrying} skeleton={<TaskRowsSkeleton />} onRetry={() => startRetry(() => router.refresh())}>
                Your tasks didn&apos;t load.
              </StateLine>
            ) : (
              <>
                <Tabs label="Whose tasks" idBase="td" tabs={TABS} value={tab} onChange={setTab} />

                <div role="tabpanel" id="td-p-mine" aria-labelledby="td-tab-mine" hidden={tab !== 'mine'}>
                  <div className="td-list" data-scope="mine" onClickCapture={listClick}>
                    {list('mine')}
                  </div>
                  {caps.add ? <AddTask ref={addRef} today={today} onAdd={add} onOpening={() => setTab('mine')} /> : null}
                </div>
                <div role="tabpanel" id="td-p-team" aria-labelledby="td-tab-team" hidden={tab !== 'team'}>
                  <div className="td-team">
                    <p>{view.teamOpen} open</p>
                    <Link className="rf-btn" href="/tasks?tab=team">
                      Open team tasks
                    </Link>
                  </div>
                </div>
                <div role="tabpanel" id="td-p-appr" aria-labelledby="td-tab-appr" hidden={tab !== 'appr'}>
                  <div className="td-list" data-scope="appr" onClickCapture={listClick}>
                    {list('appr')}
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>

        <div className="rf-col td-col-b">
          <Interviews tickets={view.interviews} today={today} doneTaskIds={doneTaskIds} openTaskIds={openTaskIds} />
          <Areas areas={view.areas} />
          <BoardChat chat={view.chat} myInitials={me.initials} canReply={caps.reply} live={live} say={say} onFail={failed} />
        </div>
      </div>

      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
