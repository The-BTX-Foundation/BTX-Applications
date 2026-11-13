'use client';

// The refreshed "Your availability" page (Interviews, demo p-availability, Ops Hub refresh 2026-11-12): the title with
// the term, one news card, the gold "Not sent yet" box with Send, "When you're free" (type a line, quick picks, a line per
// day with hours 8 AM to 10 PM: drag to add on laptops, change or remove a span in place), "Most interviews" and the
// private "Students I know". Every change is a local draft with Undo until Send.
// Mock mode changes its own state, like the demo. Live mode sends through the existing saveAvailability action exactly as
// the current page does (the whole draft, send: true) and reads typed words through the existing readTypedAvailability
// action only when the person presses "Fill in my times" on a line the page itself can't read. Nothing else writes.
// Live hides the booked interviews (the current page shows no bookings or student names).
import '@/components/refresh/refresh.css';
import './availability.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { checkAvailabilityCover, readTypedAvailability, saveAvailability } from '@/lib/actions/availability';
import {
  changeTexts,
  CHECK_NOT_SAVED,
  CHECK_SAVED,
  clearAddAfterRead,
  DIFFER,
  needsOpen as boxOpen,
  pickMiss,
  pushChange,
  readerDraft,
  rebaseAfterCheck,
  sameSnap,
  snapCmp,
  spanIndex,
  undoChange,
  unexplained,
  type Change,
  type Snap,
} from '@/lib/availability-draft';
import { AV_RECHECK_MS, coverAsk, mockOff, NO_ANSWER, runCoverCheck, runRead, runSend, sendInput, sendLanded, submitDay, SAVE_ERR, type CoverItem, type CoverLine, type SendOutcome } from '@/lib/availability-flow';
import { parseAvail, type Parsed } from '@/lib/availability-parse';
import { clockOf } from '@/lib/interviews-map';
import {
  addSpan,
  clockLong,
  covered,
  cutSpan,
  daysText,
  dom,
  fmtR,
  freeDays,
  fromSpans,
  H0,
  H1,
  initialsOf,
  isWeekendDay,
  keptText,
  limitFloor,
  limitPlus,
  MAX_LIMIT,
  minuteAt,
  newsFor,
  pct,
  quickPick,
  sendLabel,
  sentWords,
  SLOT,
  TICKS,
  toSpans,
  totalMin,
} from '@/lib/availability-plan';
import type { AvailabilityView } from '@/lib/availability-view';
import { toMinuteRange, toRange, type MinuteRange, type Range } from '@/lib/free-ranges';
import { easternDay, fullDate, shortDate, weekday } from '@/lib/refresh-time';
import { AV_MOCK_SENT } from '@/mock/availability-view';
import { AvailabilitySkeleton, FyHead } from './availability-skeleton';

type Props = { view: AvailabilityView; live: boolean };

/** A drag on a day's track: the day and the half hours it started and ends on. */
type Drag = { day: string; a: number; b: number };

// True when the person asked the system for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Ranges from an action ("HH:MM" strings) as minutes, dropping any that don't read.
const minutesOf = (ranges: Range[]): MinuteRange[] => ranges.map(toMinuteRange).filter((r): r is MinuteRange => r !== null);

// The server's draft (what is saved).
function serverSnap(view: AvailabilityView): Snap {
  return { spans: toSpans(view.days, view.ranges), conflicts: view.conflicts, limit: view.maxInterviews, text: view.text };
}

// The round gold tick.
function Tick() {
  return (
    <span className="fy-tick" aria-hidden="true">
      <Icon name="check" />
    </span>
  );
}

// "✓ Added Sat Nov 14, 10 AM to 2 PM · Undo": the moment after a change, in the place it happened (no role: the live
// region announces it once).
export function Note({ where, text, onUndo }: { where: string; text: string; onUndo: () => void }) {
  return (
    <p className="fy-note" data-note={where} data-review-private={where === 'names' ? '' : undefined}>
      <Tick />
      <span className="fy-tx">{text}</span>
      <span className="fy-sep" aria-hidden="true">
        ·
      </span>
      <button type="button" className="rf-lnk" data-x="undo" onClick={onUndo}>
        Undo
      </button>
    </p>
  );
}

// The "Not sent yet" list: the last four changes (each line about a student's name is marked private), "and N earlier",
// or one plain line when nothing is listed (free time never sent, or the screen differs from the server).
export function ChangeList({ stack, differs }: { stack: Change[]; differs: boolean }) {
  const items = stack.flatMap((c) => (c.texts ?? [c.text]).map((t) => ({ t, priv: c.where === 'names' || / students you know$/.test(t) })));
  const shown = items.slice(-4);
  const earlier = items.length - shown.length;
  return (
    <ul className="fy-clog">
      {items.length ? (
        <>
          {shown.map((x, i) => (
            <li key={`${items.length}-${i}`} data-review-private={x.priv ? '' : undefined}>
              {x.t}
            </li>
          ))}
          {earlier ? <li className="fy-more">and {earlier} earlier</li> : null}
        </>
      ) : (
        <li>{differs ? DIFFER : "Your free time isn't sent yet."}</li>
      )}
    </ul>
  );
}

// The page.
export function AvailabilityBoard({ view, live }: Props) {
  const router = useRouter();
  const { caps, days } = view;
  const bookings = caps.bookings ? view.bookings : [];

  const [draft, setDraft] = useState<Snap>(() => serverSnap(view));
  // What the server is known to hold: the last read, or (mock) the last confirmed send.
  const [base, setBase] = useState<Snap>(() => serverSnap(view));
  const [stack, setStack] = useState<Change[]>([]);
  const [note, setNote] = useState<{ where: string; text: string } | null>(null);
  // The span being changed in place, by its day, start and end (never an index, which a re-read can shift).
  const [edit, setEdit] = useState<{ day: string; s: number; e: number; val: string; err: string | null } | null>(null);
  const [addVal, setAddVal] = useState('');
  const [addParsed, setAddParsed] = useState<Parsed | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [canRead, setCanRead] = useState(false);
  const [reading, setReading] = useState(false);
  const [kin, setKin] = useState('');
  const [flash, setFlash] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  // Before Send: checking which interviews the new times take the person off, then the confirm listing them (`at`: when
  // it opened; its go button ignores presses in the first 400 ms and a held key).
  const [checking, setChecking] = useState(false);
  const [coverQ, setCoverQ] = useState<{ off: CoverItem[]; at: number } | null>(null);
  // After Send: what happened to each of those interviews ("Ada Okafor, Thu Nov 12, 5:30 PM: now with Charlie Gaines").
  const [coverOut, setCoverOut] = useState<CoverLine[]>([]);
  const [sentBefore, setSentBefore] = useState<string | null>(null);
  const [mockSent, setMockSent] = useState<string | null>(view.sentAt);
  // Live: the sent time a confirmed send returned, shown until the refreshed data carries it.
  const [liveSent, setLiveSent] = useState<string | null>(null);
  // After a send that wasn't confirmed, live re-reads: 'wait' until the refresh starts, 'seen' while it runs.
  const [check, setCheck] = useState<'idle' | 'wait' | 'seen'>('idle');
  const [checkKind, setCheckKind] = useState<'refused' | 'unknown'>('refused');
  // Today's Eastern day: the sample's day in mock; live re-reads it when the page comes back into view.
  const [liveToday, setLiveToday] = useState(view.today);
  const [sentFresh, setSentFresh] = useState(false);
  const [announce, setAnnounce] = useState('');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  const loadFailed = live ? view.loadFailed : mockFailed;
  const today = live ? liveToday : view.today;
  const newer = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);
  const sentAt = live ? newer(view.sentAt, liveSent) : mockSent;

  // New server data is taken in once nothing is sending and no refresh is pending; it becomes the base.
  // - After a send that wasn't confirmed (the re-read has run): the server holding the draft means it was saved (the list
  //   and the error clear); otherwise every listed change is rebased on the re-read server state, so Undo returns to what
  //   is really saved, and the error says what the server holds.
  // - Otherwise: a server holding the draft clears the list; with nothing listed the draft becomes the server's.
  const server = serverSnap(view);
  const sig = `${snapCmp(server)}|${view.sentAt ?? ''}`;
  const [seenSig, setSeenSig] = useState(sig);
  if (check === 'wait' && refreshing) setCheck('seen');
  if ((sig !== seenSig || check === 'seen') && !sending && !refreshing) {
    setSeenSig(sig);
    setBase(server);
    if (check === 'seen') {
      setCheck('idle');
      const r = rebaseAfterCheck(server, draft, stack);
      setStack(r.stack);
      setNote(null);
      if (r.saved) {
        setDraft(server);
        setSendErr(null);
        setSentFresh(sendLanded(snapCmp(server), snapCmp(draft), sentBefore, view.sentAt));
        setAnnounce(CHECK_SAVED);
      } else {
        setSendErr(checkKind === 'unknown' ? CHECK_NOT_SAVED : sendErr);
        if (checkKind === 'unknown') setAnnounce(CHECK_NOT_SAVED);
      }
    } else if (sameSnap(server, draft)) {
      if (stack.length) {
        setStack([]);
        setNote(null);
      }
      if (sendErr) {
        setSendErr(null);
        setSentFresh(sendLanded(snapCmp(server), snapCmp(draft), sentBefore, view.sentAt));
        setAnnounce(CHECK_SAVED);
      }
    } else if (stack.length === 0) setDraft(server);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const focusSel = useRef<string[] | null>(null);
  const timers = useRef<number[]>([]);
  const sendSeq = useRef(0);
  const failedOnce = useRef(false);
  const lastPointer = useRef('mouse');
  const dragRef = useRef<Drag | null>(null);
  // The draft and the add line as they are now (the reader's late answer is built on these).
  const draftRef = useRef(draft);
  const stackRef = useRef(stack);
  const addRef = useRef(addVal);
  useEffect(() => {
    draftRef.current = draft;
    stackRef.current = stack;
    addRef.current = addVal;
  });

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


  // Live: today's Eastern day is re-read when the page comes back into view (it may have stayed open past midnight).
  useEffect(() => {
    if (!live) return;
    const reread = () => setLiveToday(easternDay(new Date().toISOString()));
    const onVis = () => {
      if (document.visibilityState === 'visible') reread();
    };
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [live]);

  // Live "Try again": says "Your availability loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) say('Your availability loaded');
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // True when focus may be moved: nothing is focused, or focus is on the page but not in a field being typed in.
  const mayMoveFocus = () => {
    const a = document.activeElement;
    if (!a || a === document.body) return true;
    if (!rootRef.current?.contains(a)) return false;
    return !(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement);
  };

  // Lights day rows gold for a moment.
  const flashDays = (ds: string[]) => {
    setFlash([]);
    window.requestAnimationFrame(() => setFlash(ds));
    later(() => setFlash((f) => (f === ds ? [] : f)), 1600);
  };

  // The window the typed line is read against: today's Eastern day re-read at submit (mock keeps the sample's day).
  const win = () => {
    const t = submitDay(live, view.today);
    if (live && t !== liveToday) setLiveToday(t);
    return { days, today: t };
  };

  // Edits are locked while a send runs (its answer replaces the draft) or the reader runs (its answer replaces the times).
  const locked = sending || reading || checking || coverQ !== null;
  const pending = changeTexts(stack).length;
  const free = totalMin(draft.spans);
  const neverSent = !sentAt && free > 0;
  const differs = unexplained(draft, base, stack);
  const needsOpen = boxOpen({ pending, differs, error: !!sendErr, neverSent });
  const news = loadFailed || view.noDates ? null : newsFor(draft.spans, pending, bookings, caps.bookings);

  // Every change: the draft changes at once, the change joins the "not sent" list with its Undo line in place, and focus
  // goes to that Undo (or where `focus` says). Returns false when edits are locked or nothing changed.
  const act = (text: string, where: string, after: Snap, focus?: string[]): boolean => commit(pushChange(stack, draft, after, text, where, locked), text, where, focus);
  // Takes in a change pushChange accepted (false when it was refused).
  const commit = (r: ReturnType<typeof pushChange>, text: string, where: string, focus?: string[]): boolean => {
    if (!r) return false;
    setStack(r.stack);
    setDraft(r.draft);
    setNote({ where, text });
    setEdit(null);
    setSentFresh(false);
    setSendErr(null);
    focusSel.current = focus ?? [`[data-note="${where}"] [data-x="undo"]`];
    say(`${text}. Not sent yet. Undo available.`);
    return true;
  };

  // Undo of the last change: the draft goes back, focus returns to where the change was made.
  // After Undo the box stays open with DIFFER when the screen no longer matches what the server holds.
  const undo = () => {
    if (locked) return;
    const u = undoChange(stack);
    if (!u) return;
    const top = u.change;
    setDraft(u.draft);
    setStack(u.stack);
    if (!u.stack.length && sameSnap(u.draft, base)) setSendErr(null);
    setNote(null);
    setEdit(null);
    if (top.where.startsWith('d')) {
      const d = top.where.slice(1);
      flashDays([d]);
      focusSel.current = [`.fy-drow[data-d="${d}"] .fy-dt button`];
    } else focusSel.current = [{ add: '#fy-add', names: '#fy-kin', limit: '.fy-step button:not([disabled])' }[top.where] ?? '#fy-add'];
    say(`Undone: ${top.text}${u.stack.length === 0 && !sameSnap(u.draft, base) ? `. ${DIFFER}` : ''}`);
  };

  // Adds [s, e) on each day; false when every day was already free then.
  const addAll = (ds: string[], s: number, e: number, text: string, focus?: string[]): boolean => {
    let spans = draft.spans;
    for (const d of ds) spans = addSpan(spans, d, s, e);
    const done = act(text, 'add', { ...draft, spans }, focus);
    if (done) flashDays(ds);
    return done;
  };

  // Typing in the add line: the chips under it read the words as they come.
  const onAddInput = (v: string) => {
    setAddVal(v);
    setAddErr(null);
    setCanRead(false);
    setAddParsed(v.trim() ? parseAvail(v, win()) : null);
  };

  // Enter on the add line: adds what it says, or shows the one problem (and, when the page can't read it at all, offers
  // the existing reader: "Fill in my times").
  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (locked || !addVal.trim()) return;
    const p = parseAvail(addVal, win());
    setAddParsed(p);
    if (p.err || p.s === null || p.e === null) {
      setAddErr(p.err ?? 'Add the hours, e.g. 5 to 9 pm.');
      setCanRead(caps.reader && !p.days.length && p.s === null);
      return;
    }
    const ok = addAll(p.days, p.s, p.e, `Added ${daysText(p.days)}, ${fmtR(p.s, p.e)}`, ['#fy-add']);
    if (!ok) {
      setAddErr("You're already free then.");
      return;
    }
    setAddVal('');
    setAddParsed(null);
    setAddErr(null);
  };

  // "Fill in my times": the existing reader action reads the typed words (live; mock answers that it can't read them).
  // Its times replace the free time, as on the current page; Undo puts the old times back.
  const fillFromText = () => {
    const typed = addVal;
    if (locked || !typed.trim()) return;
    setReading(true);
    const answer = live
      ? runRead(readTypedAvailability, typed)
      : new Promise<Awaited<ReturnType<typeof runRead>>>((res) => later(() => res({ ok: false, reason: 'not-configured', message: "I couldn't read that just now. Pick a quick time below or fill in the grid by hand." }), 600));
    void answer.then((r) => {
      setReading(false);
      if (!r.ok) {
        setAddErr(r.message);
        setCanRead(false);
        say(r.message);
        return;
      }
      const spans = toSpans(days, minutesOf(r.ranges));
      const text = `Filled in your times${r.unread.length ? `. I couldn't place: ${r.unread.join('; ')}` : ''}`;
      // Built on the draft as it is now (a re-read may have replaced it); the add line clears only if it still holds
      // the words that were read, and focus moves only if the person isn't typing.
      const current = draftRef.current;
      const typing = !mayMoveFocus();
      if (commit(pushChange(stackRef.current, current, readerDraft(current, spans, typed), text, 'add', false), text, 'add', typing ? [] : ['#fy-add'])) {
        if (clearAddAfterRead(addRef.current, typed)) {
          setAddVal('');
          setAddParsed(null);
          setAddErr(null);
        }
        setCanRead(false);
        flashDays(days.filter((d) => spans[d].length));
      }
    });
  };

  // A quick pick: adds its hours on its days.
  const pick = (k: 'weekdays' | 'weekends' | 'every') => {
    if (locked) return;
    const q = quickPick(k, days);
    if (!addAll(q.days, q.s, q.e, q.text)) setAddErr(pickMiss(k, q.days.length));
  };

  // "Add" on a day that isn't free: the add line takes the day ("Thu Nov 12, ") and focus.
  const openAddFor = (d: string) => {
    if (locked) return;
    onAddInput(`${shortDate(d)}, `);
    const inp = document.getElementById('fy-add') as HTMLInputElement | null;
    if (!inp) return;
    inp.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    inp.focus({ preventScroll: true });
    window.requestAnimationFrame(() => inp.setSelectionRange(inp.value.length, inp.value.length));
  };

  // Remove one span (booked half hours stay).
  const removeSpan = (d: string, s: number, e: number) => {
    if (spanIndex(draft.spans, d, s, e) < 0) return;
    const { spans, kept } = cutSpan(draft.spans, d, s, e, bookings);
    act(`Removed ${shortDate(d)}, ${fmtR(s, e)}${keptText(kept)}`, `d${d}`, { ...draft, spans });
  };

  // Save a span changed in place (the typed hours on that day; booked half hours stay).
  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!edit || locked) return;
    const { day: d, s, e: en } = edit;
    if (spanIndex(draft.spans, d, s, en) < 0) {
      setEdit(null);
      return;
    }
    const p = parseAvail(edit.val, win(), d);
    if (p.err || p.s === null || p.e === null) {
      setEdit({ ...edit, err: p.err ?? 'Add the hours, e.g. 5 to 9 pm.' });
      focusSel.current = [`[data-ed="${d}"] input`];
      return;
    }
    if (p.s === s && p.e === en) {
      setEdit(null);
      focusSel.current = [`.fy-drow[data-d="${d}"] .fy-rt`];
      return;
    }
    const cut = cutSpan(draft.spans, d, s, en, bookings);
    const ps = p.s;
    const pe = p.e;
    const spans = addSpan(cut.spans, d, ps, pe);
    const kept = cut.kept.filter((b) => !(ps <= b.min && pe >= b.min + SLOT));
    act(`Changed ${shortDate(d)} to ${fmtR(ps, pe)}${keptText(kept)}`, `d${d}`, { ...draft, spans });
  };

  // Close the in-place change (Cancel or Escape); focus goes back to the day's first span.
  const cancelEdit = (d: string) => {
    setEdit(null);
    focusSel.current = [`.fy-drow[data-d="${d}"] .fy-rt`];
  };

  // Open the in-place change for one span.
  const openEdit = (d: string, s: number, e: number) => {
    if (locked) return;
    setEdit({ day: d, s, e, val: fmtR(s, e), err: null });
    focusSel.current = [`[data-ed="${d}"] input`];
  };

  // Drag on a day's track (mouse or pen): a dashed preview follows, and letting go adds the span.
  const onTrackDown = (e: RPointerEvent<HTMLDivElement>, d: string) => {
    lastPointer.current = e.pointerType;
    if (locked || e.target !== e.currentTarget || e.pointerType === 'touch' || e.button !== 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const a = minuteAt(e.clientX, r.left, r.width);
    dragRef.current = { day: d, a, b: a };
    setDrag(dragRef.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the drag still works inside the track.
    }
  };
  // The pointer moves during a drag.
  const onTrackMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = dragRef.current;
    if (!g) return;
    const r = e.currentTarget.getBoundingClientRect();
    const b = minuteAt(e.clientX, r.left, r.width);
    if (b === g.b) return;
    dragRef.current = { ...g, b };
    setDrag(dragRef.current);
  };
  // The drag ends: `commit` adds the span (unless that time is already free).
  const endDrag = (commit: boolean) => {
    const g = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!g || !commit) return;
    const s = Math.min(g.a, g.b);
    const e = Math.max(g.a, g.b) + SLOT;
    if (covered(draft.spans, g.day, s, e)) return;
    flashDays([g.day]);
    act(`Added ${shortDate(g.day)}, ${fmtR(s, e)}`, `d${g.day}`, { ...draft, spans: addSpan(draft.spans, g.day, s, e) });
  };

  // "Most interviews": one fewer, one more, or no limit.
  const setLimit = (kind: 'minus' | 'plus' | 'nolimit') => {
    const lim = draft.limit;
    if (kind === 'minus' && lim !== null) act(`Most interviews: ${lim - 1}`, 'limit', { ...draft, limit: lim - 1 }, ['.fy-step [data-x="minus"]:not([disabled])', '.fy-step [data-x="plus"]']);
    if (kind === 'plus') {
      const v = limitPlus(lim, bookings.length);
      act(`Most interviews: ${v}`, 'limit', { ...draft, limit: v }, ['.fy-step [data-x="plus"]:not([disabled])', '.fy-step [data-x="minus"]']);
    }
    if (kind === 'nolimit') act('No limit on interviews', 'limit', { ...draft, limit: null }, ['.fy-step [data-x="plus"]']);
  };

  // "Students I know": add a name (one space between words, at most 120 characters; a name already listed is not added).
  const addName = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const name = kin.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) return;
    setKin('');
    if (draft.conflicts.some((c) => c.toLowerCase() === name.toLowerCase())) {
      say(`${name} is already on your list`);
      return;
    }
    act(`Added ${name} to students you know`, 'names', { ...draft, conflicts: [...draft.conflicts, name] }, ['#fy-kin']);
  };
  // Remove a name.
  const removeName = (name: string) => {
    act(`Removed ${name} from students you know`, 'names', { ...draft, conflicts: draft.conflicts.filter((c) => c !== name) }, ['#fy-kin']);
  };

  // Mock Send: "Sending…" for 700 ms, then sent today at 9:14 AM (?demo=failsend: the first try fails).
  // Mock cover: the first interview taken off goes to Charlie Gaines; any other finds nobody free (both outcomes shown).
  const mockSend = (confirmOff: string[] = []): Promise<SendOutcome> =>
    new Promise((res) =>
      later(() => {
        if (view.failFirst.send && !failedOnce.current) {
          failedOnce.current = true;
          res({ kind: 'refused', message: SAVE_ERR });
          return;
        }
        const label = (d: string, m: number) => `${shortDate(d)}, ${clockOf(m)}`;
        const off = mockOff(view.bookings.filter((b) => confirmOff.includes(b.id)), [], label);
        const cover: CoverLine[] = off.map((o, i) => (i === 0 ? { text: `${o.line}: now with Charlie Gaines`, ok: true } : { text: `${o.line}: nobody else is free then yet, so you stay on it for now`, ok: false }));
        if (off.length > 1) cover.push({ text: 'The admins have been emailed about the ones still open.', ok: true });
        res({ kind: 'ok', ranges: fromSpans(draft.spans).map(toRange), sentAt: AV_MOCK_SENT, cover });
      }, 700),
    );

  // Send: the whole draft through the existing save action (live) or the mock. Saved: the list clears, "Sent today,
  // 9:14 AM" shows with a tick, and focus goes to it if it was on Send. Refused or unanswered: the draft stays, the error
  // shows, and live re-reads the saved state (the save is several steps, so part of it may have landed).
  const doSend = (confirmOff: string[]) => {
    const input = { ...sendInput(fromSpans(draft.spans), draft.limit, draft.text, draft.conflicts), confirmOff };
    const seq = ++sendSeq.current;
    setSending(true);
    setSendErr(null);
    setCoverOut([]);
    setSentBefore(sentAt);
    const run = live ? runSend(saveAvailability, input) : mockSend(confirmOff);
    void run.then((out) => {
      if (seq !== sendSeq.current) return;
      const move = mayMoveFocus();
      setSending(false);
      if (out.kind === 'ok') {
        const at = out.sentAt ?? sentAt;
        // Edits were locked while sending, so the draft is the one sent; the server's cleaned ranges replace its times.
        const saved = { ...draft, spans: live ? toSpans(days, minutesOf(out.ranges)) : draft.spans };
        setDraft(saved);
        setBase(saved);
        if (live) setLiveSent(out.sentAt);
        else setMockSent(at);
        setStack([]);
        setNote(null);
        setSentFresh(true);
        setCoverOut(out.cover);
        if (move) focusSel.current = out.cover.length ? ['#fy-coh', '#fy-sent', '#fy-lh'] : ['#fy-sent', '#fy-lh'];
        const words = at ? `Sent your availability, ${sentWords(today, at).replace(', ', ' ')}` : 'Sent your availability';
        say(out.cover.length ? `${words}. ${out.cover.map((c) => c.text).join('. ')}` : words);
      } else {
        setSendErr(out.kind === 'unknown' ? NO_ANSWER : out.message);
        if (move) focusSel.current = ['#fy-send'];
        say(out.kind === 'unknown' ? NO_ANSWER : out.message);
        if (live) {
          // The save is several steps and may have landed in part (or late): re-read, then say what the server holds.
          setCheckKind(out.kind);
          setCheck('wait');
          if (out.kind === 'unknown') later(() => startRefresh(() => router.refresh()), AV_RECHECK_MS);
        }
      }
      if (live) startRefresh(() => router.refresh());
    });
  };

  // Send: first checks which booked interviews the new times no longer cover (live: the server; mock: the sample). None:
  // it sends. Some: the confirm lists them ("This removes you from 2 interviews. We'll find cover.") and edits wait.
  const send = () => {
    if (locked || !caps.send) return;
    const ranges = fromSpans(draft.spans);
    setSendErr(null);
    setChecking(true);
    const label = (d: string, m: number) => `${shortDate(d)}, ${clockOf(m)}`;
    const check = live ? runCoverCheck(checkAvailabilityCover, ranges.map(toRange)) : Promise.resolve({ ok: true as const, off: mockOff(view.bookings, ranges, label) });
    void check.then((r) => {
      setChecking(false);
      if (!r.ok) {
        setSendErr(r.message);
        say(r.message);
        if (mayMoveFocus()) focusSel.current = ['#fy-send'];
        return;
      }
      if (r.off.length === 0) {
        doSend([]);
        return;
      }
      setCoverQ({ off: r.off, at: performance.now() });
      focusSel.current = ['#fy-cq'];
      say(`${coverAsk(r.off)} ${r.off.map((o) => o.line).join('; ')}`);
    });
  };

  // The confirm's go: sends with the interviews the person agreed to come off (the server checks them again).
  // Presses within 400 ms of the confirm showing are ignored (the event's time and performance.now() share one clock).
  const goCover = (e: React.MouseEvent) => {
    if (!coverQ || e.timeStamp - coverQ.at < 400 || sending) return;
    const ids = coverQ.off.map((o) => o.slotId);
    setCoverQ(null);
    doSend(ids);
  };
  // Cancel: nothing is sent; focus goes back to Send.
  const cancelCover = () => {
    setCoverQ(null);
    focusSel.current = ['#fy-send'];
    say('Not sent. Your changes are still here.');
  };

  // The news card: "Add" focuses the add line; "See it" scrolls to the booked day and lights it.
  const goNews = (target: string) => {
    if (target === 'add') {
      const a = document.getElementById('fy-add');
      a?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      a?.focus({ preventScroll: true });
      return;
    }
    const row = rootRef.current?.querySelector<HTMLElement>(`.fy-drow[data-d="${target}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashDays([target]);
  };

  // "Try again" on the load error: mock shows the skeleton for 900 ms, then the page; live reloads the server data.
  const retry = () => {
    if (live) {
      startRetry(() => router.refresh());
      return;
    }
    setReloading(true);
    say('Loading your availability');
    later(() => {
      setMockFailed(false);
      setReloading(false);
      say('Your availability loaded');
    }, 900);
  };

  const liveRegion = (
    <p className="rf-sr" aria-live="polite" data-review-private>
      {announce}
    </p>
  );

  if (reloading || retrying) return <AvailabilitySkeleton live={liveRegion} />;

  const head = (
    <FyHead
      term={view.term}
      news={news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.go} gold={news.gold} onClick={() => goNews(news.target)} /> : null}
    />
  );

  if (loadFailed) {
    return (
      <div className="rf fy" ref={rootRef}>
        {liveRegion}
        {head}
        <section className="fy-err" role="alert">
          <h2>
            <Icon name="alert" />
            Your availability didn&apos;t load.
          </h2>
          <p>Check your connection, then try again.</p>
          <button type="button" className="rf-btn rf-btn-gold" onClick={retry}>
            <Icon name="refresh" />
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (view.noDates) {
    return (
      <div className="rf fy" ref={rootRef}>
        {liveRegion}
        {head}
        <div className="rf-pcard">
          <p className="fy-nodates">The interview dates aren&apos;t set yet.</p>
        </div>
      </div>
    );
  }

  const noteFor = (where: string) => (note && note.where === where ? <Note where={where} text={note.text} onUndo={undo} /> : null);
  const nb = bookings.length;
  const lim = draft.limit;
  const floor = limitFloor(nb);

  // One day's row: its date block, its track (free time, booked half hours, the drag preview) and its words.
  const dayRow = (d: string) => {
    const rs = draft.spans[d] ?? [];
    const bks = bookings.filter((b) => b.day === d);
    const isToday = d === today;
    const label = `${fullDate(d)}: ${rs.length ? rs.map(([s, e]) => fmtR(s, e)).join(', ') : 'not free'}${bks.length ? `; booked ${bks.map((b) => clockLong(b.min)).join(', ')}` : ''}`;
    const dn = noteFor(`d${d}`);
    const g = drag && drag.day === d ? drag : null;
    const clampL = (m: number) => Math.max(H0, Math.min(H1, m));
    return (
      <div key={d} className={`fy-drow${isToday ? ' fy-today' : ''}${isWeekendDay(d) ? ' fy-wkend' : ''}${bks.length ? ' fy-hasbk' : ''}${flash.includes(d) ? ' fy-fresh' : ''}`} data-d={d}>
        <div className="fy-dl">
          <span className="fy-dnum" aria-hidden="true">
            <b>{dom(d)}</b>
            <small>{weekday(d)}</small>
          </span>
          <span className="rf-sr">
            {weekday(d)} {dom(d)}
          </span>
          {isToday ? <span className="fy-tdy">Today</span> : null}
        </div>
        <div
          className="fy-trk"
          role="group"
          aria-label={label}
          onPointerDown={(e) => onTrackDown(e, d)}
          onPointerMove={onTrackMove}
          onPointerUp={() => endDrag(true)}
          onPointerCancel={() => endDrag(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget && lastPointer.current === 'touch') openAddFor(d);
          }}
        >
          {rs.map(([s, e]) => {
            const a = clampL(s);
            const b = clampL(e);
            return b > a ? (
              <button key={`${s}-${e}`} type="button" className="fy-fb" tabIndex={-1} style={{ left: pct(a), width: pct(H0 + b - a) }} aria-label={`Change ${shortDate(d)}, ${fmtR(s, e)}`} title={fmtR(s, e)} onClick={() => openEdit(d, s, e)} />
            ) : null;
          })}
          {bks.map((b) => (
            <span key={b.id} className="fy-bk" style={{ left: pct(b.min), width: pct(H0 + SLOT) }} title={`${b.applicant}, ${clockLong(b.min)}`} />
          ))}
          {g ? <span className="fy-prev" style={{ left: pct(Math.min(g.a, g.b)), width: pct(H0 + Math.max(g.a, g.b) + SLOT - Math.min(g.a, g.b)) }} /> : null}
        </div>
        <div className="fy-dt">
          {rs.length ? (
            rs.map(([s, e]) =>
              edit && edit.day === d && edit.s === s && edit.e === e ? (
                <form key={`${s}-${e}`} className="fy-rged" data-ed={d} autoComplete="off" onSubmit={saveEdit}>
                  <input
                    type="text"
                    value={edit.val}
                    aria-label={`Change ${shortDate(d)}, ${fmtR(s, e)}. Type new hours, e.g. 6 to 9 pm`}
                    onChange={(ev) => setEdit({ ...edit, val: ev.target.value, err: null })}
                    onKeyDown={(ev: KeyboardEvent<HTMLInputElement>) => {
                      if (ev.key === 'Escape') {
                        ev.preventDefault();
                        cancelEdit(d);
                      }
                    }}
                    onFocus={(ev) => ev.currentTarget.select()}
                  />
                  <button type="submit" className="rf-lnk">
                    Save
                  </button>
                  <button type="button" className="rf-lnk" onClick={() => cancelEdit(d)}>
                    Cancel
                  </button>
                  {edit.err ? <span className="fy-perr">{edit.err}</span> : null}
                </form>
              ) : (
                <div key={`${s}-${e}`} className="fy-rg">
                  <button type="button" className="fy-rt" aria-label={`Change ${shortDate(d)}, ${fmtR(s, e)}`} aria-disabled={locked || undefined} onClick={() => openEdit(d, s, e)}>
                    {fmtR(s, e)}
                  </button>
                  <button type="button" className="rf-lnk" aria-label={`Remove ${shortDate(d)}, ${fmtR(s, e)}`} aria-disabled={locked || undefined} onClick={() => removeSpan(d, s, e)}>
                    Remove
                  </button>
                </div>
              ),
            )
          ) : (
            <div className="fy-rg">
              <span className="fy-nf">Not free</span>
              <button type="button" className="rf-lnk" aria-label={`Add free time on ${shortDate(d)}`} onClick={() => openAddFor(d)}>
                Add
              </button>
            </div>
          )}
          {bks.map((b) => (
            <p key={b.id} className="fy-bkl">
              <b>{b.applicant}</b>
              <span className="rf-nowrap">{clockLong(b.min)}</span>
              <span className="fy-who">
                <span className="fy-faces" aria-hidden="true">
                  <span className="fy-fc fy-me">{view.me.initials}</span>
                  <span className="fy-fc">{b.withInitials}</span>
                </span>
                <span className="rf-nowrap">with {b.withName}</span>
              </span>
            </p>
          ))}
        </div>
        {dn ? <div className="fy-dnote">{dn}</div> : null}
      </div>
    );
  };

  const chipDays = addParsed?.days.length ? daysText(addParsed.days) : null;
  const chipTime = addParsed && addParsed.s !== null && addParsed.e !== null && addParsed.e > addParsed.s ? fmtR(addParsed.s, addParsed.e) : null;
  const chipErr = addErr ?? (addParsed?.err && (chipDays || addParsed.s !== null) ? addParsed.err : null);

  return (
    <div className="rf fy" ref={rootRef}>
      {liveRegion}
      {head}
      <div className="rf-board fy-board">
        <div className="fy-span">
          {/* What needs you: the changes not sent yet and the one gold Send (folds open and shut; no gap while shut). */}
          <Fold open={needsOpen}>
            <div className="fy-needs-pad">
              <section className="fy-needs" aria-labelledby="fy-nh">
                <div className="fy-nbody">
                  <div>
                    <h2 className="rf-sr" id="fy-nh">
                      Not sent yet
                    </h2>
                    <ChangeList stack={stack} differs={differs} />
                    {sendErr ? (
                      <p className="rf-saveerr fy-saveerr">
                        <Icon name="alert" />
                        {sendErr}
                      </p>
                    ) : null}
                    {coverQ ? (
                      <div className="fy-cq" role="group" aria-labelledby="fy-cq">
                        <p id="fy-cq" tabIndex={-1}>
                          {coverAsk(coverQ.off)}
                        </p>
                        <ul className="fy-cql">
                          {coverQ.off.map((o) => (
                            <li key={o.slotId}>{o.line}</li>
                          ))}
                        </ul>
                        <div className="fy-cqa">
                          <button type="button" className="rf-btn rf-btn-gold" id="fy-cgo" aria-describedby="fy-cq" onClick={goCover} onKeyDown={(e) => { if (e.repeat) e.preventDefault(); }}>
                            <Icon name="send" />
                            <span>Send and find cover</span>
                          </button>
                          <button type="button" className="rf-lnk" onClick={cancelCover}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="fy-nact">
                    {coverQ ? null : (
                      <button type="button" id="fy-send" className="rf-btn rf-btn-gold" aria-disabled={sending || checking || !caps.send || undefined} onClick={send}>
                        <Icon name="send" />
                        <span>{sending ? 'Sending…' : checking ? 'Checking…' : sendLabel(!!sentAt, Math.max(pending, differs ? 2 : 0))}</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </Fold>

          {/* After a send that took the person off interviews: who covers each now, or that nobody could yet. */}
          {coverOut.length > 0 ? (
            <section className="fy-cout" aria-labelledby="fy-coh">
              <h2 id="fy-coh" tabIndex={-1}>
                Your interviews
              </h2>
              <ul>
                {coverOut.map((c) => (
                  <li key={c.text} className={c.ok ? undefined : 'fy-cbad'}>
                    <Icon name={c.ok ? 'check' : 'alert'} />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* The line: a row per day; type to add, quick picks, drag on a day (laptop), tap a span to change it. */}
          <section className="rf-panel fy-panel" aria-labelledby="fy-lh">
            <div className="rf-ph">
              <h2 id="fy-lh" tabIndex={-1}>
                When you&apos;re free
              </h2>
              <div className="fy-r">
                <span className="fy-tot">
                  Free on {freeDays(draft.spans)} of {days.length} days
                </span>
                {sentAt ? (
                  <span id="fy-sent" className="fy-sent" tabIndex={-1}>
                    {sentFresh ? <Tick /> : null}Sent {sentWords(today, sentAt)}
                  </span>
                ) : view.dueOn ? (
                  <span>Due {shortDate(view.dueOn)}</span>
                ) : null}
                <Link className="rf-lnk" href="/scholarships/interviews/questions">
                  Interview questions
                </Link>
              </div>
            </div>
            <div className="rf-pcard">
              <div className="fy-addw">
                <form autoComplete="off" onSubmit={onAdd}>
                  <div className="fy-addf">
                    <span className="fy-plus" aria-hidden="true">
                      <Icon name="plus" />
                    </span>
                    <input
                      id="fy-add"
                      type="text"
                      enterKeyHint="done"
                      value={addVal}
                      aria-busy={reading || undefined}
                      aria-label="Add free time, for example sat 10 to 2 or weekdays after 5"
                      aria-describedby="fy-chips"
                      placeholder="Add free time, e.g. sat 10 to 2"
                      onChange={(e) => onAddInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') onAddInput('');
                      }}
                    />
                    <span className="fy-hint">Enter to add</span>
                  </div>
                  <div className="fy-chips" id="fy-chips">
                    {chipDays ? (
                      <span className="fy-pchip">
                        <Icon name="cal" />
                        {chipDays}
                      </span>
                    ) : null}
                    {chipTime ? (
                      <span className="fy-pchip">
                        <Icon name="clock" />
                        {chipTime}
                      </span>
                    ) : null}
                    {chipErr ? <span className="fy-perr">{chipErr}</span> : null}
                    {canRead && chipErr ? (
                      <button type="button" className="rf-lnk" aria-disabled={locked || undefined} onClick={fillFromText}>
                        {reading ? 'Reading…' : 'Fill in my times'}
                      </button>
                    ) : null}
                  </div>
                </form>
                <div className="fy-picks">
                  <span>Or add</span>
                  <button type="button" className="fy-qp" aria-disabled={locked || undefined} onClick={() => pick('weekdays')}>
                    Weekday evenings, 5 to 9
                  </button>
                  <button type="button" className="fy-qp" aria-disabled={locked || undefined} onClick={() => pick('weekends')}>
                    Weekends
                  </button>
                  <button type="button" className="fy-qp" aria-disabled={locked || undefined} onClick={() => pick('every')}>
                    Every day
                  </button>
                </div>
                {noteFor('add') ? <div className="fy-addnote">{noteFor('add')}</div> : null}
              </div>
              <div className="fy-line">
                <div className="fy-axis" aria-hidden="true">
                  <span />
                  <span className="fy-ticks">
                    {TICKS.map(([m, t, c]) => (
                      <span key={m} className={c ? `fy-${c}` : undefined} style={{ left: pct(m) }}>
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
                {days.map(dayRow)}
              </div>
              <p className="fy-legend">
                <span>
                  <i className="fy-lg" />
                  Free
                </span>
                {caps.bookings ? (
                  <span>
                    <i className="fy-lg fy-lgb" />
                    Booked interview
                  </span>
                ) : null}
                <span className="fy-lgd">Drag on a day to add hours</span>
              </p>
            </div>
          </section>
        </div>

        {/* Most interviews: squares for the limit (filled = booked, when bookings show) and a stepper. */}
        <section className="rf-panel fy-panel" aria-labelledby="fy-mh">
          <div className="rf-ph">
            <h2 id="fy-mh">Most interviews</h2>
          </div>
          <div className="rf-pcard">
            <div className="fy-lim">
              <span className="fy-sq" role="img" aria-label={`${lim === null ? 'No limit' : `Most ${lim}`}${caps.bookings ? `, ${nb} booked` : ''}`}>
                {lim === null ? (
                  <>
                    <span className="fy-nolim">No limit</span>
                    {nb ? <b>{nb} booked</b> : null}
                  </>
                ) : (
                  <>
                    {Array.from({ length: lim }, (_, i) => (
                      <span key={i} className={`fy-sqc${i < nb ? ' fy-on' : ''}`} />
                    ))}
                    {caps.bookings ? (
                      <b>
                        <em className="fy-big">{nb}</em> of {lim} booked
                      </b>
                    ) : (
                      <b>
                        <em className="fy-big">{lim}</em> at most
                      </b>
                    )}
                  </>
                )}
              </span>
              <span className="fy-limact">
                <span className="fy-step" aria-disabled={locked || undefined}>
                  <button type="button" data-x="minus" aria-label="One fewer" disabled={lim === null || lim <= floor} onClick={() => setLimit('minus')}>
                    −
                  </button>
                  <output>{lim === null ? 'No limit' : lim}</output>
                  <button type="button" data-x="plus" aria-label="One more" disabled={lim !== null && lim >= MAX_LIMIT} onClick={() => setLimit('plus')}>
                    +
                  </button>
                </span>
                {lim === null ? null : (
                  <button type="button" className="rf-lnk" data-x="nolimit" aria-disabled={locked || undefined} onClick={() => setLimit('nolimit')}>
                    No limit
                  </button>
                )}
              </span>
            </div>
            {noteFor('limit') ? <div className="fy-pnote">{noteFor('limit')}</div> : null}
          </div>
        </section>

        {/* Students I know: private (only this person sees them); never paired with them. */}
        <section className="rf-panel fy-panel" aria-labelledby="fy-kh">
          <div className="rf-ph">
            <h2 id="fy-kh">Students I know</h2>
            <span className="fy-priv">
              <Icon name="lock" />
              Only you see this · never paired
            </span>
          </div>
          <div className="rf-pcard">
            <ul className="fy-kn" data-review-private>
              {draft.conflicts.length ? (
                draft.conflicts.map((n) => (
                  <li key={n}>
                    <span className="fy-ini" aria-hidden="true">
                      {initialsOf(n)}
                    </span>
                    <b>{n}</b>
                    <button type="button" className="rf-lnk" aria-label={`Remove ${n}`} aria-disabled={locked || undefined} onClick={() => removeName(n)}>
                      Remove
                    </button>
                  </li>
                ))
              ) : (
                <li>
                  <span className="fy-none">No names yet.</span>
                </li>
              )}
            </ul>
            {noteFor('names') ? <div className="fy-pnote">{noteFor('names')}</div> : null}
            <form className="fy-kadd" autoComplete="off" onSubmit={addName}>
              <span className="fy-plus" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <input id="fy-kin" data-review-private aria-busy={locked || undefined} maxLength={120} value={kin} placeholder="Add a name, e.g. a mentee" aria-label="Add a student you know. You're never paired with them." onChange={(e) => setKin(e.target.value)} />
              <button type="submit" className="rf-lnk">
                Add
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
