'use client';

// Scholarships > Interviews > Interview questions (Ops Hub refresh 2026-11-12; demo p-questions). The cycle's questions
// under the scoring criteria they belong to, numbered down the page, beside the person's next interview. Board members
// with admin rights edit a question in place, add one at the end of a group, remove one and reorder by drag, by the grip's
// arrow keys or, on phones, by the up and down buttons.
//
// Writes: exactly the page's existing server actions (lib/questions-writes.ts), one after another through one queue
// (lib/questions-queue.ts). Every change shows at once; a failed write cancels what was queued after it (an add or edit
// keeps its words, a removal or move says "Not done"), puts back the last settled copy and asks the server again. A failed
// add or edit keeps the person's words in "Not saved" with Try again and Dismiss (lib/questions-store.ts). A just-added
// question can't be edited, moved or removed until the server gives its id; a move with no answer in time locks moving
// until the page reads the server again. Each result is said once in one polite live region. Live mode hides what has no real write:
// Undo of a removal, Undo of the starter questions and the Draft chip (lib/questions-map.ts liveCaps); a live removal asks
// first instead, because nothing brings it back.
import '@/components/refresh/refresh.css';
import './questions.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ClipboardEvent, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { Sk } from '@/components/refresh/skeleton';
import { StateLine } from '@/components/refresh/state-line';
import { clock } from '@/lib/refresh-time';
import { getBrowserClient } from '@btx/data';
import {
  CUT_WORDS,
  ERR_NOT_DONE,
  ERR_OLD_CYCLE,
  ERR_SKIPPED,
  SAY_SKIPPED,
  applyAdd,
  applyEdit,
  applyMove,
  applyRemove,
  clean,
  dropIndex,
  failWords,
  findQ,
  isListed,
  isOrphan,
  isStale,
  isTmp,
  locksMoves,
  mayMoveFocus,
  movesFor,
  movesLocked,
  noteWords,
  pasteCuts,
  reverseMoves,
  savedSay,
  starterWhat,
  type NotSaved,
  type WriteOutcome,
} from '@/lib/questions-flow';
import { emptyLine, gkOf, newsOf, ptsWidth, qnNumbers, qnTotal, ticketOf } from '@/lib/questions-map';
import { writeQueue } from '@/lib/questions-queue';
import { claimNotSaved, clearNotSaved, dropListedNotSaved, dropNotSaved, keepNotSaved, nextTmpId, notSavedServerSnapshot, notSavedSnapshot, patchNotSaved, subscribeNotSaved } from '@/lib/questions-store';
import type { QnGroup, QnNext, QnView } from '@/lib/questions-view';
import { liveWriter, mockWriter, type QnWriter } from '@/lib/questions-writes';
import { QN_STARTER_GROUPS } from '@/mock/questions-view';
import { QnHead, QnSkelBoard } from './questions-skeleton';

type Props = { view: QnView; live: boolean };

/** Where the line after an action shows: after a question, at a place in a group (a removal), or in the panel heading. */
type Place = { id: string } | { gk: string; at: number } | { gk: '*' };
/**
 * The line after an action: "Saving…", the saved line with Undo, or an error. `watch`: Undo of an add shows only while the
 * server's copy, when it lists the question, still has the added words.
 */
type Note = { place: Place; text: string; saving?: boolean; err?: boolean; undo?: (() => void) | null; watch?: { id: string; text: string } };

/** One write: the change it shows at once, the write itself, and what happens when it answers. */
type Op = {
  apply: (g: QnGroup[]) => QnGroup[];
  write: (w: QnWriter) => Promise<WriteOutcome>;
  place: Place;
  ok: (o: Extract<WriteOutcome, { ok: true }>) => void;
  fail: (o: Exclude<WriteOutcome, { ok: true }>) => void;
  /** A queued write that a failure before it cancelled (an add or edit keeps its words; others say "Not done"). */
  cancel?: () => void;
  /** A move: no answer in time locks moving until the page reads the server again. */
  moves?: boolean;
};

/** How a focus request behaves: always, not while typing (after a write), or only when focus fell to the page. */
type FocusMode = 'hard' | 'soft' | 'lost';

const SCORECARD = '/scholarships/scoring';
/** A group by its key (the "To close" key holds a "~", so never an id selector). */
const G = (gk: string) => `.qn-grp[data-gk="${gk}"]`;
const AVAILABILITY = '/scholarships/interviews/availability';

// The line after an action, in its place.
function NoteLine({ note }: { note: Note }) {
  return (
    <p className={`qn-line${note.err ? ' qn-err' : ''}`}>
      {note.err ? (
        <Icon name="alert" />
      ) : note.saving ? null : (
        <span className="qn-tick" aria-hidden="true">
          <Icon name="check" />
        </span>
      )}
      <span className="qn-tx">{note.text}</span>
      {note.undo ? (
        <>
          <span className="qn-sep" aria-hidden="true">
            ·
          </span>
          <button type="button" className="rf-lnk" data-x="undo" onClick={note.undo}>
            Undo
          </button>
        </>
      ) : null}
    </p>
  );
}

// The next interview as a ticket: the date block, the student, the time and length, the code and the other interviewer.
// When the name does not fit beside the date block, the block lies flat above it (measured, as the demo does).
function Ticket({ next }: { next: QnNext }) {
  const t = ticketOf(next);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      const nm = el?.querySelector<HTMLElement>('.qn-nm');
      const tb = el?.querySelector<HTMLElement>('.qn-tb');
      if (!el || !nm || !tb) return;
      el.classList.remove('qn-tight');
      el.classList.toggle('qn-tight', nm.scrollWidth > tb.clientWidth - 32);
    };
    fit();
    window.addEventListener('resize', fit);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => window.removeEventListener('resize', fit);
  }, [next.applicant]);
  return (
    <div className="qn-ticket" id="qn-tk" ref={ref}>
      <span className="qn-stub" aria-hidden="true">
        <span>{t.wd}</span>
        <strong>{t.day}</strong>
        <span>{t.mon}</span>
      </span>
      <span className="qn-tb">
        <span className="rf-sr">
          {t.wd} {t.mon} {t.day}:{' '}
        </span>
        <span className="qn-nm">{next.applicant}</span>
        <span className="qn-tm">
          <span>{t.time}</span> · <span>video, {t.minutes} min</span>
        </span>
        <span className="qn-mt">
          <span>{next.code}</span>
          <span>with {next.withName}</span>
        </span>
      </span>
    </div>
  );
}

// The page.
export function QuestionsBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, me } = view;
  const cycleId = view.cycleId ?? '';
  const [, startRefresh] = useTransition();
  const [retrying, startRetry] = useTransition();
  const writer = useMemo<QnWriter>(() => (live ? liveWriter() : mockWriter(view.mockWrite)), [live, view.mockWrite]);

  // The questions as drawn: the server's, plus the changes still being written. Every settled refresh re-seeds them from
  // the server while no write is in flight (React's "reset state when a prop changes" pattern).
  const [groups, setGroups] = useState(view.groups);
  const [idle, setIdle] = useState(true);
  const [seen, setSeen] = useState(view.groups);
  if (seen !== view.groups && idle) {
    setSeen(view.groups);
    setGroups(view.groups);
  }
  // The last settled copy: the server's last read (live) or the sample (mock), plus every write that saved since. A failed
  // write puts this back.
  const confirmed = useRef(view.groups);
  const viewGroups = useRef(view.groups);
  useEffect(() => {
    viewGroups.current = view.groups;
    if (live) confirmed.current = view.groups;
  }, [live, view.groups]);
  const refreshRef = useRef<() => void>(() => {});
  // Made on the first write (never while drawing).
  const queueRef = useRef<ReturnType<typeof writeQueue> | null>(null);
  const getQueue = () =>
    (queueRef.current ??= writeQueue({
      failed: () => setGroups(confirmed.current),
      settled: () => refreshRef.current(),
      idle: () => setIdle(true),
    }));
  // A move with no answer in time: moving stays locked while the page shows the read it was locked on.
  const [moveLock, setMoveLock] = useState<QnGroup[] | null>(null);
  const locked = movesLocked(moveLock, view.groups);
  // Just-added rows keep the key they were drawn with when the server's id replaces their "tmp-" id (nothing remounts).
  const [rowKeys, setRowKeys] = useState<Record<string, string>>({});

  // "Not saved" belongs to one person: a board drawn for someone else clears it first, and so does signing out.
  claimNotSaved(me);
  const notSaved = useSyncExternalStore(subscribeNotSaved, () => notSavedSnapshot(me), notSavedServerSnapshot);
  // A failed save that the server now lists did go through: its error and its words go away.
  useEffect(() => {
    if (live) dropListedNotSaved(me, view.groups, view.cycleId);
  }, [live, me, view.groups, view.cycleId]);
  useEffect(() => {
    if (!live) return;
    try {
      type Auth = { auth?: { onAuthStateChange?: (fn: (ev: string) => void) => { data?: { subscription?: { unsubscribe?: () => void } } } } };
      const sub = (getBrowserClient() as unknown as Auth).auth?.onAuthStateChange?.((ev) => {
        if (ev === 'SIGNED_OUT') clearNotSaved();
      });
      return () => sub?.data?.subscription?.unsubscribe?.();
    } catch {
      return undefined;
    }
  }, [live]);

  const [note, setNote] = useState<Note | null>(null);
  // "Not done" lines for removals and moves that an earlier failure cancelled (cleared by the next action).
  const [skipped, setSkipped] = useState<Note[]>([]);
  // The field a paste was cut in ("add:<gk>" or "ed:<id>"), shown under it until it closes.
  const [cut, setCut] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; words: string; from: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addText, setAddText] = useState('');
  const addRef = useRef('');
  const [confirmRm, setConfirmRm] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const editRef = useRef(edit);
  useEffect(() => {
    editRef.current = edit;
  }, [edit]);

  // Runs a callback later, cleared when the page goes away.
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Says one line in the page's polite live region (cleared first, so the same words are read again).
  // What was said in the last two seconds (a line said right after it joins it).
  const lastSaid = useRef('');
  const say = useCallback(
    (m: string) => {
      lastSaid.current = m;
      setAnnounce('');
      later(() => setAnnounce(m), 30);
      later(() => {
        if (lastSaid.current === m) lastSaid.current = '';
      }, 2000);
    },
    [later],
  );
  // Adds to what was just said (so a second line never cuts off the first).
  const sayMore = (m: string) => say(lastSaid.current ? `${lastSaid.current} ${m}` : m);

  // Focus requests: the first selector of "a|b" that exists and shows, after the next render.
  const focusSel = useRef<string | null>(null);
  const focusMode = useRef<FocusMode>('hard');
  const [, bump] = useState(0);
  const focusTo = useCallback((sel: string, mode: FocusMode = 'hard') => {
    focusSel.current = sel;
    focusMode.current = mode;
    bump((n) => n + 1);
  }, []);
  useEffect(() => {
    const want = focusSel.current;
    if (!want) return;
    focusSel.current = null;
    const active = document.activeElement;
    if (focusMode.current === 'soft' && !mayMoveFocus(true, active?.tagName)) return;
    if (focusMode.current === 'lost' && active && active !== document.body) return;
    for (const s of want.split('|')) {
      const el = rootRef.current?.querySelector<HTMLElement>(s);
      if (el && el.offsetParent !== null) {
        el.focus({ preventScroll: true });
        if (el instanceof HTMLTextAreaElement) el.setSelectionRange(el.value.length, el.value.length);
        return;
      }
    }
  });

  // Flashes a row for a moment.
  const flashRow = (id: string) => {
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(id));
    later(() => setFlash((f) => (f === id ? null : f)), 1700);
  };

  // "9:14 AM": the demo's fixed time in mock mode, Eastern time now in live mode.
  const nowWords = () => {
    return live ? clock(new Date().toISOString()) : '9:14 AM';
  };

  useEffect(() => {
    refreshRef.current = () => {
      if (live) startRefresh(() => router.refresh());
    };
  });

  // ---------- The write queue ----------

  // Shows a change at once and writes it after the writes before it (lib/questions-queue.ts). A saved write joins the
  // settled copy; a failure puts that copy back, cancels what was queued after it and asks the server again.
  const skipSaid = useRef(-1);
  const enqueue = (op: Op) => {
    setSkipped([]);
    setGroups((g) => op.apply(g));
    setIdle(false);
    setNote({ place: op.place, text: 'Saving…', saving: true });
    const queue = getQueue();
    void queue.push({
      write: () => op.write(writer),
      ok: (o) => {
        confirmed.current = op.apply(confirmed.current);
        op.ok(o);
      },
      fail: (o) => {
        if (op.moves && locksMoves(o)) setMoveLock(viewGroups.current);
        op.fail(o);
      },
      cancel: () => {
        if (op.cancel) op.cancel();
        else setSkipped((x) => [...x, { place: op.place, text: ERR_NOT_DONE, err: true }]);
        // Said once for every write one failure cancelled.
        if (skipSaid.current !== queue.gen()) {
          skipSaid.current = queue.gen();
          sayMore(SAY_SKIPPED);
        }
      },
    });
  };

  // The saved line with Undo where it may be undone, said once.
  const saved = (place: Place, what: string, undo: (() => void) | null, watch?: Note['watch']) => {
    setNote({ place, text: noteWords(what, nowWords()), undo, watch });
    say(savedSay(what, !!undo));
  };
  // An error line in place, said once.
  const failed = (place: Place, words: string) => {
    setNote({ place, text: words, err: true });
    say(words);
  };

  // Undo: the reverse change, written like any other (live: a real write; mock: the snapshot comes back). Cancelled by an
  // earlier failure, it says "Not done".
  const undoOp = (what: string, op: Omit<Op, 'ok' | 'fail' | 'place'> & { place: Place; focus: string; failAt?: Place }) => () => {
    enqueue({
      ...op,
      ok: () => {
        setNote(null);
        say(`Undone: ${what}`);
        focusTo(op.focus, 'soft');
      },
      fail: (o) => failed(op.failAt ?? op.place, failWords(o)),
      cancel: () => setSkipped((x) => [...x, { place: op.failAt ?? op.place, text: ERR_NOT_DONE, err: true }]),
    });
    focusTo(op.focus);
  };

  // ---------- Edit ----------

  const openEdit = (id: string, words?: string) => {
    const f = findQ(groups, id);
    if (!f) return;
    const from = f.g.questions[f.i].text;
    setAdding(null);
    setConfirmRm(null);
    setCut(null);
    setEdit({ id, words: words ?? from, from });
    focusTo(`textarea[data-ed="${id}"]`);
  };

  const saveEdit = (how: 'key' | 'blur') => {
    const e = editRef.current;
    if (!e) return;
    editRef.current = null;
    setEdit(null);
    const words = clean(e.words);
    const back = `button.qn-qt[data-id="${e.id}"]`;
    const f = findQ(groups, e.id);
    if (!f || !words || words === clean(e.from)) {
      focusTo(back, how === 'key' ? 'hard' : 'lost');
      return;
    }
    const gk = gkOf(f.g.key);
    const n = qnNumbers(groups).get(e.id) ?? 0;
    const what = `Saved question ${n}`;
    const place: Place = { id: e.id };
    dropNotSaved(me, `e:${e.id}`);
    flashRow(e.id);
    enqueue({
      apply: (g) => applyEdit(g, e.id, words),
      write: (w) => w.edit(cycleId, gk, e.id, words, e.from),
      place,
      ok: () =>
        saved(
          place,
          what,
          caps.editUndo
            ? undoOp(what, { apply: (g) => applyEdit(g, e.id, e.from), write: (w) => w.edit(cycleId, gk, e.id, e.from, words), place, focus: back })
            : null,
        ),
      fail: (o) => {
        setNote(null);
        keepNotSaved(me, { key: `e:${e.id}`, kind: 'edit', cycleId, gk, qid: e.id, words, fromText: e.from, message: failWords(o), conflict: o.kind === 'conflict' });
        say(failWords(o));
        focusTo(`${back}|${G(gk)} .qn-addopen`, 'lost');
      },
      // An earlier failure stopped it before it was sent: the words stay in "Not saved".
      cancel: () => keepNotSaved(me, { key: `e:${e.id}`, kind: 'edit', cycleId, gk, qid: e.id, words, fromText: e.from, message: ERR_SKIPPED, conflict: false }),
    });
    focusTo(back, how === 'key' ? 'hard' : 'lost');
  };

  // ---------- Add ----------

  const addWords = (gk: string, raw: string, keepOpen: boolean, how: 'key' | 'blur') => {
    const words = clean(raw);
    if (!words) {
      setAdding((a) => (a === gk ? null : a));
      focusTo(`${G(gk)} .qn-addopen`, how === 'key' ? 'hard' : 'lost');
      return;
    }
    const g = groups.find((x) => gkOf(x.key) === gk);
    if (!g) return;
    const tmp = nextTmpId();
    const knownIds = g.questions.map((q) => q.id);
    const n = qnNumbers(applyAdd(groups, gk, tmp, words)).get(tmp) ?? 0;
    const what = `Added question ${n}`;
    setAddText('');
    addRef.current = '';
    setAdding(keepOpen ? gk : (a) => (a === gk ? null : a));
    flashRow(tmp);
    const keep = (message: string) => keepNotSaved(me, { key: `a:${tmp}`, kind: 'add', cycleId, gk, words, knownIds, message });
    let realId = tmp;
    enqueue({
      apply: (gs) => applyAdd(gs, gk, realId, words),
      write: async (w) => {
        const o = await w.add(cycleId, gk, words);
        if (o.ok && o.id) realId = o.id;
        return o;
      },
      place: { id: tmp },
      ok: (o) => {
        const id = o.id ?? tmp;
        if (o.id) {
          // The row keeps its key, so nothing on it remounts (an open field stays open).
          setRowKeys((k) => ({ ...k, [id]: tmp }));
          setGroups((gs) => gs.map((x) => ({ ...x, questions: x.questions.map((q) => (q.id === tmp ? { ...q, id } : q)) })));
          setEdit((x) => (x && x.id === tmp ? { ...x, id } : x));
          if (editRef.current?.id === tmp) editRef.current = { ...editRef.current, id };
        }
        const place: Place = { id };
        saved(
          place,
          what,
          caps.addUndo && o.id
            ? undoOp(what, { apply: (gs) => applyRemove(gs, id), write: (w) => w.undoAdd(id, words), place: { gk, at: knownIds.length }, failAt: { id }, focus: `${G(gk)} .qn-addopen|${G(gk)} button.qn-qt` })
            : null,
          { id, text: words },
        );
      },
      fail: (o) => {
        setNote(null);
        keep(failWords(o));
        say(failWords(o));
        focusTo(`${G(gk)} .qn-addopen|${G(gk)} textarea`, 'lost');
      },
      cancel: () => keep(ERR_SKIPPED),
    });
    if (keepOpen) focusTo(`${G(gk)} .qn-add textarea`);
    else focusTo(`[data-note] [data-x="undo"]|${G(gk)} .qn-addopen`, how === 'key' ? 'hard' : 'lost');
  };

  // ---------- Remove ----------

  const removeQ = (id: string) => {
    const f = findQ(groups, id);
    if (!f) return;
    const gk = gkOf(f.g.key);
    const at = f.i;
    const n = qnNumbers(groups).get(id) ?? 0;
    const what = `Removed question ${n}`;
    const snap = groups;
    const nextId = f.g.questions[at + 1]?.id;
    setConfirmRm(null);
    enqueue({
      apply: (g) => applyRemove(g, id),
      write: (w) => w.remove(id),
      place: { gk, at },
      ok: () =>
        saved(
          { gk, at },
          what,
          caps.removeUndo ? undoOp(what, { apply: () => snap, write: async () => ({ ok: true }), place: { id }, focus: `button.qn-qt[data-id="${id}"]` }) : null,
        ),
      fail: (o) => {
        failed({ id }, failWords(o));
        focusTo(`button.qn-qt[data-id="${id}"]`, 'lost');
      },
      // The row is back (the settled copy): "Not done" under it.
      cancel: () => setSkipped((x) => [...x, { place: { id }, text: ERR_NOT_DONE, err: true }]),
    });
    focusTo(`[data-note] [data-x="undo"]|${nextId ? `button.qn-qt[data-id="${nextId}"]|` : ''}${G(gk)} .qn-addopen|#qn-h1`);
  };

  // ---------- Move ----------

  const moveQ = (id: string, to: number, how: 'key' | 'up' | 'down' | 'drag') => {
    const f = findQ(groups, id);
    if (locked || isTmp(id) || !f || to === f.i || to < 0 || to >= f.g.questions.length) return;
    const from = f.i;
    const moves = movesFor(from, to);
    const nums = qnNumbers(groups);
    const a = nums.get(id) ?? 0;
    const what = `Question ${a} is now ${a + (to - from)}`;
    const place: Place = { id };
    const focus =
      how === 'key'
        ? `.qn-grip[data-id="${id}"]`
        : how === 'drag'
          ? '[data-note] [data-x="undo"]'
          : `[data-x="${how}"][data-id="${id}"]:not([disabled])|[data-x="${how === 'up' ? 'down' : 'up'}"][data-id="${id}"]`;
    flashRow(id);
    enqueue({
      apply: (g) => applyMove(g, id, to),
      write: (w) => w.move(id, moves),
      place,
      moves: true,
      ok: () =>
        saved(
          place,
          what,
          caps.moveUndo
            ? undoOp(what, { apply: (g) => applyMove(g, id, from), write: (w) => w.move(id, reverseMoves(moves)), place, moves: true, focus: `.qn-grip[data-id="${id}"]|button.qn-qt[data-id="${id}"]` })
            : null,
        ),
      fail: (o) => failed(place, failWords(o)),
    });
    focusTo(focus);
  };

  // ---------- The starter questions ----------

  const addStarter = () => {
    const snap = groups;
    const starter = live ? null : QN_STARTER_GROUPS();
    enqueue({
      apply: (g) => starter ?? g,
      write: (w) => w.starter(cycleId),
      place: { gk: '*' },
      ok: (o) => {
        // The true number added (live: counted from the re-read), never a fixed count.
        const what = starterWhat(starter ? qnTotal(starter) : o.added, view.starterCount);
        saved({ gk: '*' }, what, caps.starterUndo ? undoOp(what, { apply: () => snap, write: async () => ({ ok: true }), place: { gk: '*' }, focus: '.qn-empty .rf-btn' }) : null);
      },
      fail: (o) => {
        failed({ gk: '*' }, failWords(o));
        focusTo('.qn-empty .rf-btn', 'lost');
      },
    });
    focusTo('[data-note] [data-x="undo"]|button.qn-qt|#qn-h1', 'soft');
  };

  // ---------- Not saved: Try again, Edit with my words, Dismiss ----------

  const retry = (n: NotSaved) => {
    if (isListed(n, groups)) {
      dropNotSaved(me, n.key);
      return;
    }
    if (n.kind === 'edit') {
      const f = findQ(groups, n.qid);
      if (!f) return;
      const qn = qnNumbers(groups).get(n.qid) ?? 0;
      const what = `Saved question ${qn}`;
      patchNotSaved(me, n.key, { busy: true });
      enqueue({
        apply: (g) => applyEdit(g, n.qid, n.words),
        write: (w) => w.edit(cycleId, n.gk, n.qid, n.words, n.fromText),
        place: { id: n.qid },
        ok: () => {
          dropNotSaved(me, n.key);
          saved({ id: n.qid }, what, null);
          focusTo(`button.qn-qt[data-id="${n.qid}"]`, 'soft');
        },
        fail: (o) => {
          setNote(null);
          patchNotSaved(me, n.key, { busy: false, message: failWords(o), conflict: o.kind === 'conflict' } as Partial<NotSaved>);
          say(failWords(o));
        },
        cancel: () => patchNotSaved(me, n.key, { busy: false }),
      });
      return;
    }
    patchNotSaved(me, n.key, { busy: true });
    let realId = `tmp-r-${n.key}`;
    enqueue({
      apply: (g) => g,
      write: async (w) => {
        const o = await w.retryAdd(cycleId, n);
        if (o.ok && 'id' in o && o.id) realId = o.id;
        return o.ok ? { ok: true, id: 'id' in o ? o.id : undefined } : o;
      },
      place: { gk: n.gk, at: groups.find((g) => gkOf(g.key) === n.gk)?.questions.length ?? 0 },
      ok: (o) => {
        dropNotSaved(me, n.key);
        if (!live && o.id) {
          confirmed.current = applyAdd(confirmed.current, n.gk, o.id, clean(n.words));
          setGroups((g) => applyAdd(g, n.gk, o.id ?? realId, clean(n.words)));
        }
        const id = o.id ?? realId;
        const total = qnNumbers(live ? groups : applyAdd(groups, n.gk, id, clean(n.words))).get(id);
        saved(o.id ? { id } : { gk: n.gk, at: groups.find((g) => gkOf(g.key) === n.gk)?.questions.length ?? 0 }, total ? `Added question ${total}` : 'Added the question', null);
      },
      fail: (o) => {
        setNote(null);
        patchNotSaved(me, n.key, { busy: false, message: failWords(o) });
        say(failWords(o));
      },
      cancel: () => patchNotSaved(me, n.key, { busy: false }),
    });
  };

  const dismiss = (n: NotSaved) => {
    dropNotSaved(me, n.key);
    focusTo(n.kind === 'edit' ? `button.qn-qt[data-id="${n.qid}"]|${G(n.gk)} .qn-addopen|#qn-h1` : `${G(n.gk)} .qn-addopen|#qn-h1`);
  };

  const editMine = (n: Extract<NotSaved, { kind: 'edit' }>) => {
    dropNotSaved(me, n.key);
    openEdit(n.qid, n.words);
  };

  // ---------- Drag by the grip ----------

  const dr = useRef<{ li: HTMLElement; idx: number; others: HTMLElement[]; y0: number; mid0: number; mids: number[]; to: number; moved: boolean } | null>(null);
  const onGripDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!caps.drag || e.button !== 0) return;
    const li = e.currentTarget.closest<HTMLElement>('.qn-q');
    const list = li?.parentElement;
    if (!li || !list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > .qn-q')];
    const others = rows.filter((r) => r !== li);
    dr.current = {
      li,
      idx: rows.indexOf(li),
      others,
      y0: e.clientY,
      mid0: rowMid(li),
      mids: others.map(rowMid),
      to: rows.indexOf(li),
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the drag still works without it.
    }
  };
  const onGripMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = dr.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      d.li.classList.add('qn-lift');
    }
    e.preventDefault();
    d.li.style.transform = `translateY(${dy}px)`;
    d.to = dropIndex(d.mids, d.mid0 + dy);
    d.others.forEach((r) => r.classList.remove('qn-before', 'qn-after'));
    if (d.to !== d.idx) {
      if (d.to < d.others.length) d.others[d.to].classList.add('qn-before');
      else d.others[d.others.length - 1]?.classList.add('qn-after');
    }
  };
  const endDrag = (commit: boolean) => {
    const d = dr.current;
    if (!d) return;
    dr.current = null;
    d.li.classList.remove('qn-lift');
    d.li.style.transform = '';
    d.others.forEach((r) => r.classList.remove('qn-before', 'qn-after'));
    const id = d.li.dataset.id;
    if (commit && d.moved && d.to !== d.idx && id) moveQ(id, d.to, 'drag');
  };
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const f = findQ(groups, id);
    if (f) moveQ(id, f.i + (e.key === 'ArrowUp' ? -1 : 1), 'key');
  };

  // ---------- The news card ----------

  const total = qnTotal(groups);
  const news = view.loadFailed ? null : newsOf({ next: view.next, caps }, total);
  const goNews = (to: 'next' | 'start') => {
    const el = rootRef.current?.querySelector<HTMLElement>(to === 'next' ? '#qn-tk' : '.qn-empty');
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    if (!still) el.animate([{ background: 'var(--gold-tint)' }, { background: 'transparent' }], { duration: 1600 });
    if (to === 'start') rootRef.current?.querySelector<HTMLElement>('.qn-empty .rf-btn')?.focus({ preventScroll: true });
  };

  // ---------- Drawing ----------

  const nums = useMemo(() => qnNumbers(groups), [groups]);
  const scored = groups.filter((g) => g.weight !== null).length;
  // Undo of an add hides once a read of the server shows the question with other words.
  const shown = (n: Note): Note => {
    if (!n.undo || !n.watch) return n;
    const f = findQ(view.groups, n.watch.id);
    return f && clean(f.g.questions[f.i].text) !== clean(n.watch.text) ? { ...n, undo: null } : n;
  };
  // The lines at a place: the note after the last action, then any "Not done" lines. Never list items: they sit inside a
  // question's row or beside the list, so a screen reader counts only questions.
  const notesAt = (p: (pl: Place) => boolean): ReactNode[] => [
    ...(note && p(note.place)
      ? [
          <div key="note" className="qn-note" data-note="">
            <NoteLine note={shown(note)} />
          </div>,
        ]
      : []),
    ...skipped.filter((x) => p(x.place)).map((x, i) => (
      <div key={`skip-${i}`} className="qn-note" data-skip="">
        <NoteLine note={x} />
      </div>
    )),
  ];

  // Copies kept words (a failed save from an earlier cycle).
  const copyWords = (words: string) => {
    void navigator.clipboard?.writeText(words).then(
      () => say('Copied.'),
      () => say("Couldn't copy. Select the words instead."),
    );
  };

  // A "Not saved" line: the error, Try again (or Edit with my words after a conflict), Dismiss and the person's words. From
  // an earlier cycle it says so and offers only Copy and Remove.
  const notSavedLine = (n: NotSaved) => {
    const old = isStale(n, view.cycleId);
    const orphan = !old && isOrphan(n, groups);
    return (
      <div key={n.key} className="qn-note" data-ns={n.key}>
        <p className="qn-line qn-err">
          <Icon name="alert" />
          <span className="qn-tx">{n.busy ? 'Saving…' : old ? ERR_OLD_CYCLE : orphan ? 'That question is gone.' : n.message}</span>
          {n.busy ? null : old ? (
            <>
              <button type="button" className="rf-lnk" onClick={() => copyWords(n.words)}>
                Copy
              </button>
              <span className="qn-sep" aria-hidden="true">
                ·
              </span>
              <button type="button" className="rf-lnk" onClick={() => dismiss(n)}>
                Remove
              </button>
            </>
          ) : (
            <>
              {orphan ? null : n.kind === 'edit' && n.conflict ? (
                <button type="button" className="rf-lnk" onClick={() => editMine(n)}>
                  Edit with my words
                </button>
              ) : (
                <button type="button" className="rf-lnk" onClick={() => retry(n)}>
                  Try again
                </button>
              )}
              <span className="qn-sep" aria-hidden="true">
                ·
              </span>
              <button type="button" className="rf-lnk" onClick={() => dismiss(n)}>
                Dismiss
              </button>
            </>
          )}
          <span className="qn-words">Your words: {n.words}</span>
        </p>
      </div>
    );
  };

  // "Cut to 500 characters." under a field a paste went past the limit in (said once while the field is open).
  const cutLine = (field: string): ReactNode =>
    cut === field ? (
      <div className="qn-note qn-cutl">
        <p className="qn-line">{CUT_WORDS}</p>
      </div>
    ) : null;
  const onPasteIn = (field: string) => (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget;
    if (!pasteCuts(t.value.length, t.selectionEnd - t.selectionStart, e.clipboardData.getData('text').length)) return;
    if (cut === field) return;
    setCut(field);
    say(CUT_WORDS);
  };

  const row = (g: QnGroup, q: { id: string; text: string }, i: number, after: ReactNode[]) => {
    const n = nums.get(q.id) ?? 0;
    const key = rowKeys[q.id] ?? q.id;
    if (!caps.edit) {
      return (
        <li key={key} className="qn-q" data-id={q.id}>
          <span />
          <span className="qn-nn">{n}</span>
          <p className="qn-qt">{q.text}</p>
          {after}
        </li>
      );
    }
    const editing = edit?.id === q.id;
    const last = g.questions.length - 1;
    // Just added: nothing is sent for it until the server gives its id.
    const tmp = isTmp(q.id);
    const keepIt = () => {
      setConfirmRm(null);
      focusTo(`[data-x="rm"][data-id="${q.id}"]`);
    };
    const escKeeps = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      keepIt();
    };
    return (
      <li key={key} id={`qn-q-${key}`} className={`qn-q${flash === q.id ? ' qn-fresh' : ''}`} data-id={q.id}>
        {caps.drag ? (
          <button
            type="button"
            className="qn-grip"
            data-id={q.id}
            disabled={tmp || locked}
            aria-label={`Reorder question ${n}. Drag, or use the up and down arrow keys.`}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(false)}
            onKeyDown={(e) => onGripKey(e, q.id)}
          >
            <Icon name="grip" />
          </button>
        ) : (
          <span />
        )}
        <span className="qn-nn">{n}</span>
        {editing ? (
          <textarea
            className="qn-qt"
            rows={1}
            maxLength={500}
            enterKeyHint="done"
            data-ed={q.id}
            aria-label={`Question ${n}`}
            value={edit.words}
            ref={grow}
            onPaste={onPasteIn(`ed:${q.id}`)}
            onChange={(e) => {
              const words = e.target.value.replace(/\n/g, ' ');
              setEdit((x) => (x ? { ...x, words } : x));
              editRef.current = editRef.current ? { ...editRef.current, words } : null;
              growEl(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                saveEdit('key');
              } else if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                editRef.current = null;
                setEdit(null);
                setCut(null);
                focusTo(`button.qn-qt[data-id="${q.id}"]`);
              }
            }}
            onBlur={() => {
              if (editRef.current?.id === q.id) saveEdit('blur');
            }}
          />
        ) : (
          <button type="button" className="qn-qt" data-id={q.id} disabled={tmp} aria-label={`Question ${n}: ${q.text}. ${tmp ? 'Saving' : 'Edit'}`} onClick={() => openEdit(q.id)}>
            {q.text}
          </button>
        )}
        <span className="qn-qa">
          {confirmRm === q.id ? (
            <>
              <span className="qn-ask">Remove for good?</span>
              <button type="button" className="rf-lnk" data-x="rmyes" onClick={() => removeQ(q.id)} onKeyDown={escKeeps}>
                Remove
              </button>
              <button type="button" className="rf-lnk" data-x="rmno" onClick={keepIt} onKeyDown={escKeeps}>
                Keep
              </button>
            </>
          ) : (
            <>
              {caps.move ? (
                <span className="qn-mv">
                  <button type="button" data-x="up" data-id={q.id} aria-label={`Move question ${n} up`} disabled={i === 0 || tmp || locked} onClick={() => moveQ(q.id, i - 1, 'up')}>
                    <Icon name="up" />
                  </button>
                  <button type="button" data-x="down" data-id={q.id} aria-label={`Move question ${n} down`} disabled={i === last || tmp || locked} onClick={() => moveQ(q.id, i + 1, 'down')}>
                    <Icon name="down" />
                  </button>
                </span>
              ) : null}
              {caps.remove ? (
                <button
                  type="button"
                  className="rf-lnk"
                  data-x="rm"
                  data-id={q.id}
                  disabled={tmp}
                  aria-label={`Remove question ${n}`}
                  onClick={() => {
                    if (caps.removeUndo) removeQ(q.id);
                    else {
                      setConfirmRm(q.id);
                      focusTo('[data-x="rmno"]');
                    }
                  }}
                >
                  Remove
                </button>
              ) : null}
            </>
          )}
        </span>
        {editing ? cutLine(`ed:${q.id}`) : null}
        {after}
      </li>
    );
  };

  const group = (g: QnGroup) => {
    const gk = gkOf(g.key);
    if (!caps.edit && g.questions.length === 0) return null;
    const mine = notSaved.filter((n) => n.gk === gk && !isStale(n, view.cycleId));
    const pts =
      g.weight === null ? (
        <span className="qn-pts">Not scored</span>
      ) : (
        <span className="qn-pts">
          <span className="qn-track" aria-hidden="true">
            <i style={{ width: `${ptsWidth(g.weight, groups)}%` }} />
          </span>
          <span className="rf-nowrap">
            <b>{g.weight}</b> points
          </span>
        </span>
      );
    const isAt = (at: number) => (pl: Place) => 'at' in pl && pl.gk === gk && pl.at === at;
    // A note at place 0 sits above the list; one at place i + 1 (after question i) and any line about question i sit at
    // the end of question i's row; the group's failed adds sit under the list.
    const before = notesAt(isAt(0));
    const under = mine.filter((n) => n.kind === 'add' || isOrphan(n, groups)).map(notSavedLine);
    return (
      <div key={gk} className="qn-grp" id={`qn-g-${gk}`} data-gk={gk}>
        <div className="qn-gh">
          <h3>{g.name}</h3>
          {pts}
        </div>
        {before.length ? <div className="qn-notes">{before}</div> : null}
        <ol className="qn-ql">
          {g.questions.map((q, i) =>
            row(g, q, i, [
              ...notesAt((pl) => 'id' in pl && pl.id === q.id),
              ...notesAt(isAt(i + 1)),
              ...mine.filter((n) => n.kind === 'edit' && n.qid === q.id).map(notSavedLine),
            ]),
          )}
        </ol>
        {under.length ? <div className="qn-notes">{under}</div> : null}
        {caps.add ? (
          adding === gk ? (
            <>
              <form className="qn-add" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                <span className="qn-plus" aria-hidden="true">
                  <Icon name="plus" />
                </span>
                <textarea
                  rows={1}
                  maxLength={500}
                  enterKeyHint="done"
                  aria-label={`New question for ${g.name}`}
                  placeholder="Type a question"
                  value={addText}
                  ref={grow}
                  onPaste={onPasteIn(`add:${gk}`)}
                  onChange={(e) => {
                    const words = e.target.value.replace(/\n/g, ' ');
                    setAddText(words);
                    addRef.current = words;
                    growEl(e.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addWords(gk, addText, true, 'key');
                    } else if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addRef.current = '';
                      setAdding(null);
                      setAddText('');
                      setCut(null);
                      focusTo(`${G(gk)} .qn-addopen`);
                    }
                  }}
                  onBlur={(e) => {
                    const to = e.relatedTarget as HTMLElement | null;
                    if (to?.closest('.qn-add')) return;
                    const words = addRef.current;
                    if (words.trim()) addWords(gk, words, false, 'blur');
                    else setAdding((a) => (a === gk ? null : a));
                  }}
                />
                <span className="qn-hint">Enter to add, Esc to close</span>
              </form>
              {cutLine(`add:${gk}`)}
            </>
          ) : (
            <button
              type="button"
              className="qn-addopen"
              onClick={() => {
                setEdit(null);
                editRef.current = null;
                setConfirmRm(null);
                setCut(null);
                setAddText('');
                addRef.current = '';
                setAdding(gk);
                focusTo(`${G(gk)} .qn-add textarea`);
              }}
            >
              <Icon name="plus" />
              Add a question
            </button>
          )
        ) : (
          <div className="qn-end" />
        )}
      </div>
    );
  };

  // Failed saves kept from an earlier cycle: their own block at the end, words only (Copy, Remove).
  const oldOnes = notSaved.filter((n) => isStale(n, view.cycleId));
  const headNote = note && 'gk' in note.place && note.place.gk === '*' ? note : (skipped.find((x) => 'gk' in x.place && x.place.gk === '*') ?? null);
  const questions = (
    <section className="rf-panel qn-qs" aria-labelledby="qn-qh">
      <div className="rf-ph">
        <div className="qn-hl">
          <h2 id="qn-qh">Questions</h2>
          {caps.draftChip ? <span className="qn-draft">Draft</span> : null}
        </div>
        <div className="qn-r">
          {!view.isAdmin ? (
            <span className="qn-ro">
              <Icon name="lock" />
              Editable with admin rights
            </span>
          ) : headNote ? (
            <div className="qn-note" data-note="">
              <NoteLine note={headNote} />
            </div>
          ) : null}
        </div>
      </div>
      {total === 0 ? (
        <div className="qn-empty">
          {caps.starter ? (
            <>
              <p>{emptyLine(true, view.starterCount, scored)}</p>
              <button type="button" className="rf-btn rf-btn-gold" onClick={addStarter}>
                Use the starter questions
              </button>
            </>
          ) : (
            <p>{!view.cycleId ? (view.isAdmin ? 'No cycle is published yet, so there is nothing to add questions to.' : 'No cycle is published yet.') : emptyLine(false, view.starterCount, scored)}</p>
          )}
        </div>
      ) : (
        groups.map(group)
      )}
      {oldOnes.length ? <div className="qn-notes qn-old">{oldOnes.map(notSavedLine)}</div> : null}
    </section>
  );

  const nextPanel = (
    <section className="rf-panel qn-next" aria-labelledby="qn-xh">
      <div className="rf-ph">
        <h2 id="qn-xh">Your next interview</h2>
        <div className="qn-r">
          <Link className="rf-lnk" href={AVAILABILITY}>
            Your availability
          </Link>
        </div>
      </div>
      <div className="rf-pcard">
        {view.nextFailed ? (
          <StateLine kind="error" onRetry={() => startRetry(() => router.refresh())} retrying={retrying} skeleton={<Sk className="qn-sk-tk" />}>
            Your next interview didn&apos;t load.
          </StateLine>
        ) : view.next ? (
          <Ticket next={view.next} />
        ) : (
          <p className="qn-nonext">None booked yet. When a student books a time with you, it shows here.</p>
        )}
        <div className="qn-nxact">
          <Link className="rf-lnk" href={SCORECARD}>
            Open the scorecard
          </Link>
          <span>The scorecard shows these questions beside the scores.</span>
        </div>
      </div>
    </section>
  );

  return (
    <div className="rf qn" ref={rootRef} aria-busy={retrying && view.loadFailed ? true : undefined}>
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
      <QnHead term={view.term} news={news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.go} gold={news.gold} onClick={() => goNews(news.to)} /> : null} />
      {view.loadFailed ? (
        retrying ? (
          <QnSkelBoard />
        ) : (
          <section className="qn-lerr" role="alert">
            <h2>
              <Icon name="alert" />
              The interview questions didn&apos;t load.
            </h2>
            <p>Check your connection, then try again.</p>
            <button type="button" className="rf-btn rf-btn-gold" onClick={() => startRetry(() => (live ? router.refresh() : router.replace(pathname)))}>
              <Icon name="refresh" />
              Try again
            </button>
          </section>
        )
      ) : (
        <div className="qn-board">
          {questions}
          {nextPanel}
        </div>
      )}
    </div>
  );
}

// The middle of a question's own row: a line kept at the end of the row (a note) does not count.
function rowMid(li: HTMLElement): number {
  const b = li.getBoundingClientRect();
  let notes = 0;
  li.querySelectorAll<HTMLElement>(':scope > .qn-note').forEach((n) => {
    notes += n.getBoundingClientRect().height;
  });
  return b.top + (b.height - notes) / 2;
}

// A textarea grows with its words (no inner scroll).
function growEl(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  ta.style.height = `${ta.scrollHeight + 2}px`;
}
const grow = (ta: HTMLTextAreaElement | null) => {
  if (ta) growEl(ta);
};
