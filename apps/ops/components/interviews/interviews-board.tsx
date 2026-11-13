'use client';

// The refreshed Interviews page (route /scholarships/interviews, demo p-interviews, Ops Hub refresh 2026-11-12). Four parts:
// - The gold card at the top: the one task that waits now (Teams links missing, no times yet, times not sent, or
//   students who have not booked), with its one gold action and a confirm step before anything leaves Ops Hub.
// - Interview times: the interview dates on a two-week calendar; a day opens in place under its week, with its times,
//   Remove on open times and "Add a time" (a field that reads "7:30 pm" or "sat 6pm").
// - Booked: the interviews ahead as tickets; one opens in place with the applicant code, the Teams link (Join on your own
//   interviews, or on all for admins; Change or Paste one for admins) and the interview questions. For admins, "Make
//   Teams links" also sits here whenever the gold card is on another task (the old Video links sheet's paths: links never
//   emailed, old non-Teams links, a retry after emails failed).
// - Board: each board member's interviews against the even share (squares) and free hours (a slim track); Rebalance and
//   Re-run pairing for admins.
// Mock mode plays the demo's story locally and never calls the server. Live mode calls only the existing server actions
// the old page called (components/interviews/interviews-writes.ts), each from one click, never twice, never retried by
// itself; a control with no existing action is not drawn live (lib/interviews-map.ts capsFor). A result with outside
// effects (meetings, emails) shows only after the server answers, in the server's own words, with a tick only when no
// part of it failed; no answer in time says "No answer in time. Reload to check." (and, for a call that sends, that some
// emails or meetings may already have gone out). Live changes are not drawn ahead of the server: after each answer the
// page reloads its data (router.refresh) and every write control stays locked until that fresh data lands. A confirm
// re-checks its preview before acting and stops if it changed. A confirm's go button arms 400 ms after it opens and
// ignores a held key. One polite live region reads each result once.
import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fold, Nw } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import type { PairingPreview, TeamsPreview } from '@/lib/actions/interviews';
import { joinNames, moveLine, type MoveView } from '@/lib/interview-times';
import {
  addDayChip,
  armed,
  bookingOrder,
  cellLabel,
  CHANGED,
  clockOf,
  goKey,
  hhmm,
  inWindow,
  izRel,
  linksGo,
  linksSig,
  movesSig,
  needsStage,
  NO_ANSWER_SENT,
  noteOk,
  pairSig,
  pairText,
  parseAdd,
  rangeLabel,
  STILL_SAVING,
  stubOf,
  timesOn,
  weeksOf,
} from '@/lib/interviews-map';
import { interviewHref } from '@/lib/interview-href';
import type { InterviewsView, IzBooking, IzInterviewer, IzPerson, IzTime } from '@/lib/interviews-view';
import { isVideoUrl } from '@/lib/pairing-slots';
import { clock, easternDay, fullDate, shortDate, weekday } from '@/lib/refresh-time';
import { MOCK_BUILT_TIMES } from '@/mock/interviews-view';
import {
  addTimeLive,
  createGate,
  makeLinksLive,
  previewLinksLive,
  previewPairingLive,
  previewRebalanceLive,
  rebalanceLive,
  rebuildLive,
  remindBoardLive,
  remindStudentsLive,
  removeTimeLive,
  rerunPairingLive,
  saveLinkLive,
  sendTimesLive,
  type Answer,
  type CallKind,
  type GateResult,
  type GateState,
} from './interviews-writes';
import '@/components/refresh/refresh.css';
import './interviews.css';

const QUESTIONS = '/scholarships/interviews/questions';
const AVAILABILITY = '/scholarships/interviews/availability';
const LINK_ERR = 'Use a Teams link (it starts with https://teams.microsoft.com/).';
const NUDGE_TEXT = 'Hi Miles, could you add your free hours for next week (Nov 16 to 20)? Pairing for those days waits on them.';

/** A line in the gold card or under a panel heading: done (tick) or a problem (alert). */
type Note = { text: string; ok: boolean };
/**
 * A confirm step on the Board panel (live rebalance or pairing). `sig` is what its preview showed, compared again on
 * confirm; `changed` when that recheck found something different (nothing was done).
 */
type BoardAsk = { kind: 'rebal' | 'pair'; text: string; lines: string[]; go: string; n: number; sig: string; changed: boolean };
/** The Teams-links preview on screen, with its counts and `sig`; `changed` as above. */
type LinksPreview = { text: string; toMake: number; toEmail: number; sig: string; changed: boolean };

const DEMO_MK = 'Ops Hub makes a Teams meeting from meetings@ for each one and emails the link to the student and both interviewers.';
const ALL_LINKS = 'Every paired interview ahead already has a Teams link, and everyone has had it by email.';
// How long a fold takes to open (refresh.css --fold is under this), after which a target inside it can take focus.
const RESCUE_MS = 350;
// Where focus goes when its element went away: the gold card's result line or heading, the Teams-links result, today's cell.
const FALLBACK = '#iz-ndone, #iz-nh, #iz-lknote, .iz-day.iz-today, .iz-day';

// A server failure for an action that sends: the no-answer words already warn; a refusal gets `extra` added.
const sentFail = (m: string, extra: string) => (m === NO_ANSWER_SENT ? m : `${m} ${extra}`);

// The page body. `view` is the server's data; in mock mode the board keeps its own copy and plays the demo on it.
export function InterviewsBoard({ view, live }: { view: InterviewsView; live: boolean }) {
  const router = useRouter();
  const [mock, setMock] = useState(view);
  // Live draws the server's data as it is (every live change reloads it); mock draws the local copy.
  const d = live ? view : mock;
  const caps = d.caps;
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const focusSel = useRef<string | null>(null);
  const [announce, setAnnounce] = useState('');
  // One call at a time; after a live write every write control stays locked until fresh data lands (interviews-writes.ts).
  const [gs, setGs] = useState<GateState>({ busy: null, stale: false });
  const [gate] = useState(() => createGate(setGs));
  const busy = gs.busy;
  const locked = gs.busy !== null || gs.stale;
  const [retrying, setRetrying] = useState(false);
  // When the open confirm appeared: its go button arms ARM_MS later (GoButton).
  const [openedAt, setOpenedAt] = useState(0);

  // Gold card.
  const [confirm, setConfirm] = useState<null | 'mk' | 'rm' | 'send' | 'remind'>(null);
  const [preview, setPreview] = useState<LinksPreview | null>(null);
  const [needsNote, setNeedsNote] = useState<Note | null>(null);
  // "Not booked yet": the result line of the last reminder.
  const [waitNote, setWaitNote] = useState<Note | null>(null);
  // The ticket whose Teams link was just copied ("Copied" shows for two seconds).
  const [copied, setCopied] = useState<string | null>(null);

  // Calendar.
  const [sel, setSel] = useState<string | null>(null);
  // The last day opened in each week, so a week's panel keeps its content while it folds closed.
  const [shown, setShown] = useState<Record<number, string>>({});
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [added, setAdded] = useState<{ text: string; undo: string | null } | null>(null);
  const [undoIds, setUndoIds] = useState<string[]>([]);
  // The removals still showing Undo, read by the 5-second timer (state is stale inside it).
  const undoRef = useRef<string[]>([]);
  useEffect(() => {
    undoRef.current = undoIds;
  }, [undoIds]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [timesNote, setTimesNote] = useState<Note | null>(null);
  const seq = useRef(0);

  // Booked.
  const [openTk, setOpenTk] = useState<Record<string, boolean>>({});
  const [lk, setLk] = useState<string | null>(null);
  const [lkVal, setLkVal] = useState('');
  const [lkErr, setLkErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, Note>>({});
  // The Teams-links sheet under Booked (when the gold card is on another task): its result line.
  const [linksNote, setLinksNote] = useState<Note | null>(null);

  // Board.
  const [nudge, setNudge] = useState<'none' | 'draft' | 'sent'>('none');
  const [editing, setEditing] = useState(false);
  const [nudgeText, setNudgeText] = useState(NUDGE_TEXT);
  const [boardNote, setBoardNote] = useState<Note | null>(null);
  const [boardAsk, setBoardAsk] = useState<BoardAsk | null>(null);

  // Clears every pending timer when the page goes away.
  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // Fresh data arrived (a new view from the server): writes may run again.
  useEffect(() => {
    gate.landed();
  }, [view, gate]);

  // Runs `fn` after `ms`, cleared on unmount.
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Moves focus after the next render to the first element matching one of `sels` (comma list), never to the page body.
  useEffect(() => {
    const s = focusSel.current;
    if (!s || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(s);
    if (!el) return;
    focusSel.current = null;
    el.focus({ preventScroll: true });
    // A target inside a fold that is still opening (hidden) can't take focus yet: try again once it has opened.
    if (document.activeElement !== el) later(() => rescue(s), RESCUE_MS);
  });
  const focusNext = (sel: string) => {
    focusSel.current = sel;
  };

  // If focus has fallen to the page body (its element went away), puts it on the first of `sel` that can take it, else
  // on the gold card's result line or heading, the Teams-links result, or today's cell.
  function rescue(sel?: string) {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    const sels = [sel, FALLBACK].filter(Boolean).join(', ');
    for (const el of root.current?.querySelectorAll<HTMLElement>(sels) ?? []) {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return;
    }
  }

  // Reads a message to screen readers once (cleared first, so the same words are read again).
  const say = (m: string) => {
    setAnnounce('');
    later(() => setAnnounce(m), 30);
  };

  // The time of a change: the real Eastern time live; the demo's fixed times in mock mode.
  const stamp = (demo: string) => (live ? clock(new Date().toISOString()) : demo);

  // Flashes a new or restored time for 1.6 seconds.
  const flash = (id: string) => {
    setFresh((f) => [...f, id]);
    later(() => setFresh((f) => f.filter((x) => x !== id)), 1700);
  };

  const byId = useMemo(() => new Map(d.bookings.map((b) => [b.id, b])), [d.bookings]);
  const mine = (b: IzBooking) => b.pair.some((p) => p.id === d.me);
  const weeks = useMemo(() => weeksOf(d.first, d.last), [d.first, d.last]);
  const ordered = useMemo(() => bookingOrder(d.bookings), [d.bookings]);
  const missing = ordered.filter((b) => !b.link && b.pair.length === 2);
  const myBooked = ordered.filter(mine);
  const otherBooked = ordered.filter((b) => !mine(b));
  const openTimes = d.times.filter((t) => t.booking === null && t.heldBy === null && !undoIds.includes(t.id)).length;
  const notBooked = Math.max(0, d.applicants - d.booked);
  const stage = needsStage(d);
  // "Not booked yet" list (admins): the students without a time, once times are open, with Remind.
  const waitList = d.unbooked ?? [];
  const showWaiting = d.isAdmin && caps.seeWho && d.times.some((t) => t.opened) && waitList.length > 0;
  const toRemind = waitList.filter((w) => !w.remindedToday);
  const notSent = d.people.filter((p) => !p.sent).map((p) => p.name);
  const anyOpened = d.times.some((t) => t.opened);
  // The Teams-links confirm sits in the gold card while links are its task, otherwise in a sheet under Booked.
  const mkInCard = stage === 'links';
  const stageKey = stage;

  // When the gold card's task changes (its content is drawn anew) or fresh data redraws the page, focus that was on a
  // part that went away lands on the card's heading (or today's cell), never on the page body. Skipped on first draw.
  const drawn = useRef(false);
  useEffect(() => {
    if (!drawn.current) {
      drawn.current = true;
      return;
    }
    // The gold card's new content opens over a short fold (hidden until then), so check once it has opened.
    const t = window.setTimeout(() => rescue(), RESCUE_MS);
    return () => window.clearTimeout(t);
  }, [stageKey, view]);

  /** Marks a confirm as just opened (its go button arms ARM_MS from now) and moves focus to its words. */
  function opened(focus: string) {
    setOpenedAt(new Date().getTime());
    focusNext(focus);
  }

  /**
   * One live call through the gate. Pressed while another runs (or before fresh data landed after a write): nothing is
   * called and "Another change is still saving." is read. After a write, whatever came back, the page reloads its data.
   */
  async function call<T>(key: string, fn: () => Promise<Answer<T>>, kind: CallKind): Promise<GateResult<T>> {
    const r = await gate.run(key, fn, kind);
    if (r.kind === 'locked') say(STILL_SAVING);
    else if (kind.write) router.refresh();
    return r;
  }

  /** The Teams-links preview from the server's answer. */
  const fromTeams = (p: TeamsPreview): LinksPreview => ({ text: p.confirm, toMake: p.toMake, toEmail: p.toEmail, sig: linksSig(p), changed: false });

  // ---------- Gold card and the Teams-links sheet ----------

  // A result of the Teams links: in the gold card while links are its task, otherwise in the sheet under Booked.
  function putLinks(n: Note) {
    if (mkInCard) setNeedsNote(n);
    else setLinksNote(n);
    say(n.text);
    focusNext(mkInCard ? '#iz-ndone, #iz-nh' : '#iz-lknote');
  }

  // "Make Teams links": live checks first what it would do (changes nothing), then shows the confirm.
  async function openMake() {
    setLinksNote(null);
    if (!live) {
      const n = missing.length;
      setPreview({ text: n ? DEMO_MK : ALL_LINKS, toMake: n, toEmail: n, sig: '', changed: false });
      setConfirm('mk');
      opened('#iz-mkq');
      return;
    }
    const r = await call('mkcheck', previewLinksLive, { write: false, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'fail') return putLinks({ text: r.message, ok: false });
    setPreview(fromTeams(r.value));
    setConfirm('mk');
    opened('#iz-mkq');
  }

  // Closes the Teams-links confirm.
  function closeMake() {
    setConfirm(null);
    setPreview(null);
    focusNext(mkInCard ? '#iz-mk' : '#iz-mksheet');
  }

  // Makes the links: mock fills them in after a moment. Live checks the preview again first (the server plans anew on
  // confirm): changed, it shows the new one and does nothing; the same, it runs and waits (up to five minutes).
  async function makeLinks() {
    if (gate.locked()) return say(STILL_SAVING);
    if (!live) {
      gate.hold('mk');
      later(() => {
        const names = missing.map((b) => b.name);
        const ids = new Set(missing.map((b) => b.id));
        setMock((m) => ({ ...m, bookings: m.bookings.map((b) => (ids.has(b.id) ? { ...b, link: `https://teams.microsoft.com/l/meetup-join/btx-${b.code.toLowerCase()}` } : b)) }));
        gate.release();
        setConfirm(null);
        setPreview(null);
        // Commas: the sentence already ends "and their interviewers", as the demo writes it.
        setNeedsNote({ text: `Made ${names.length} Teams ${names.length === 1 ? 'link' : 'links'} today, ${stamp('9:14 AM')}. Emailed ${names.join(', ')} and their interviewers.`, ok: true });
        say(`Made ${names.length} Teams links and emailed them`);
        focusNext('#iz-rm, #iz-nh');
      }, 900);
      return;
    }
    const shownSig = preview?.sig;
    const c = await call('mkcheck', previewLinksLive, { write: false, sends: false });
    if (c.kind === 'locked') return;
    if (c.kind === 'fail') {
      setConfirm(null);
      setPreview(null);
      return putLinks({ text: c.message, ok: false });
    }
    const now = fromTeams(c.value);
    if (now.sig !== shownSig || !linksGo(now)) {
      setPreview({ ...now, changed: true });
      say(`${CHANGED} ${now.text}`);
      opened('#iz-mkq');
      return;
    }
    const r = await call('mk', makeLinksLive, { write: true, sends: true });
    if (r.kind === 'locked') return;
    setConfirm(null);
    setPreview(null);
    if (r.kind === 'ok') putLinks({ text: r.value.message, ok: noteOk(r.value.message) });
    else putLinks({ text: sentFail(r.message, 'Some links or emails may already have gone out, so check the list before trying again.'), ok: false });
  }

  // "Remind" on one student who has not booked, or "Remind all" (after its confirm): the booking email again, at most
  // once a day each (live: remindStudentsAction). Mock marks them reminded today.
  async function remind(ids: string[] | null) {
    if (gate.locked()) return say(STILL_SAVING);
    const list = d.unbooked ?? [];
    const targets = list.filter((w) => !w.remindedToday && (!ids || ids.includes(w.id)));
    const key = ids && ids.length === 1 ? `rm:${ids[0]}` : 'rm';
    const put = (n: Note) => {
      setConfirm(null);
      setWaitNote(n);
      say(n.text);
      focusNext('#iz-wnote');
    };
    if (!live) {
      gate.hold(key);
      later(() => {
        const sentIds = new Set(targets.map((w) => w.id));
        setMock((m) => ({ ...m, unbooked: (m.unbooked ?? []).map((w) => (sentIds.has(w.id) ? { ...w, remindedToday: true, emailed: '2026-11-10T14:15:00Z' } : w)) }));
        gate.release();
        put({ text: targets.length === 1 ? `Reminded ${targets[0].name} today, ${stamp('9:15 AM')}.` : `Reminded ${targets.length} students today, ${stamp('9:15 AM')}.`, ok: true });
      }, 800);
      return;
    }
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call(key, () => remindStudentsLive(cycle, ids), { write: true, sends: true });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') put({ text: r.value.message, ok: noteOk(r.value.message) });
    else put({ text: sentFail(r.message, 'Some emails may already have gone out.'), ok: false });
  }

  // Copies an interview's Teams link; the button says "Copied" for two seconds.
  function copyLink(b: IzBooking) {
    if (!b.link) return;
    const link = b.link;
    void (async () => {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(b.id);
        say('Link copied');
        later(() => setCopied((c) => (c === b.id ? null : c)), 2000);
      } catch {
        say("Couldn't copy the link. Use Join instead.");
      }
    })();
  }

  // A gold-card result: the server's words, a tick only when nothing in them failed.
  function putNeeds(n: Note) {
    setConfirm(null);
    setNeedsNote(n);
    say(n.text);
    focusNext('#iz-ndone, #iz-nh');
  }

  // "Send times": opens the times in the Portal and emails applicants to book (live: sendTimes).
  async function sendAll() {
    if (gate.locked()) return say(STILL_SAVING);
    if (!live) {
      gate.hold('send');
      later(() => {
        setMock((m) => ({ ...m, times: m.times.map((t) => ({ ...t, opened: true })), sentLine: `Sent to all ${m.applicants} today, ${stamp('9:15 AM')}` }));
        gate.release();
        putNeeds({ text: `Emailed ${notBooked} applicants. The times are open in the Portal.`, ok: true });
      }, 800);
      return;
    }
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call('send', () => sendTimesLive(cycle), { write: true, sends: true });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') putNeeds({ text: r.value.message, ok: noteOk(r.value.message) });
    else putNeeds({ text: sentFail(r.message, 'Some emails may already have gone out.'), ok: false });
  }

  // "Remind them": emails board members who have not sent free hours (live: remindBoard).
  async function remindOthers() {
    if (gate.locked()) return say(STILL_SAVING);
    if (!live) {
      putNeeds({ text: `Emailed ${joinNames(notSent)}.`, ok: true });
      return;
    }
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call('remind', () => remindBoardLive(cycle), { write: true, sends: true });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') putNeeds({ text: r.value.message, ok: noteOk(r.value.message) });
    else putNeeds({ text: r.message, ok: false });
  }

  // "Rebuild from availability" (and "Build times" in the gold card when there are none).
  async function rebuild(fromCard: boolean) {
    if (gate.locked()) return say(STILL_SAVING);
    const put = (n: Note) => {
      if (fromCard) setNeedsNote(n);
      else setTimesNote(n);
      say(n.text);
      focusNext(fromCard ? '#iz-ndone, #iz-nh' : '#iz-tnote');
    };
    if (!live) {
      if (d.times.length === 0) {
        setMock((m) => ({ ...m, times: MOCK_BUILT_TIMES }));
        put({ text: `Built ${MOCK_BUILT_TIMES.length} times from availability, ${stamp('9:16 AM')}. Nothing is sent yet.`, ok: true });
      } else put({ text: `Rebuilt from availability, ${stamp('9:16 AM')}. Nothing changed: booked times stay and every open time still has 2 or more free.`, ok: true });
      return;
    }
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call('rebuild', () => rebuildLive(cycle), { write: true, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') put({ text: r.value.message, ok: noteOk(r.value.message) });
    else put({ text: r.message, ok: false });
  }

  // ---------- Calendar ----------

  // Opens a day under its week (or closes it when it is already open).
  function openDay(day: string) {
    const wi = weeks.findIndex((wk) => wk.includes(day));
    setShown((m) => ({ ...m, [wi]: day }));
    setSel((s) => (s === day ? null : day));
    setAdding(false);
    setAddText('');
    setAddErr(null);
    setAdded(null);
  }

  // Closes the open day and puts focus back on its cell.
  function closeDay() {
    const day = sel;
    setSel(null);
    setAdding(false);
    if (day) focusNext(`#iz-day-${day}`);
  }

  // Removes an open time. Mock: it folds to "Removed 6:00 PM · Undo" for 5 seconds. Live: removeProposedTime, then reload.
  async function removeTime(t: IzTime) {
    if (t.booking || t.heldBy) return;
    if (gate.locked()) return say(STILL_SAVING);
    if (!live) {
      setUndoIds((u) => [...u, t.id]);
      focusNext(`#iz-undo-${t.id}`);
      say(`Removed ${clockOf(t.minute)} on ${shortDate(t.day)}. It is no longer in the Portal. Undo available for 5 seconds.`);
      later(() => {
        // Undo was not pressed: the time goes for good.
        if (!undoRef.current.includes(t.id)) return;
        setUndoIds((u) => u.filter((x) => x !== t.id));
        setMock((m) => ({ ...m, times: m.times.filter((x) => x.id !== t.id) }));
      }, 5000);
      return;
    }
    const r = await call(`rm:${t.id}`, () => removeTimeLive(t.id), { write: true, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') {
      say(`Removed ${clockOf(t.minute)} on ${shortDate(t.day)}.`);
      focusNext(`#iz-day-${t.day}`);
    } else {
      setTimesNote({ text: r.message, ok: false });
      say(r.message);
      focusNext('#iz-tnote');
    }
  }

  // Undo of a removal (mock only).
  function unremove(t: IzTime) {
    setUndoIds((u) => u.filter((x) => x !== t.id));
    flash(t.id);
    focusNext(`#iz-rmv-${t.id}`);
    say(`Restored ${clockOf(t.minute)}`);
  }

  // Adds the time typed in the field.
  async function addTime(e: FormEvent) {
    e.preventDefault();
    if (!sel) return;
    if (gate.locked()) {
      setAddErr(STILL_SAVING);
      say(STILL_SAVING);
      return;
    }
    const p = parseAdd(addText, sel, d.today, d.first, d.last, (day, minute) => d.times.some((t) => t.day === day && t.minute === minute && !undoIds.includes(t.id)));
    if (p.minute === null) {
      setAddErr('Type a time, e.g. 7:30 pm.');
      say('Type a time, e.g. 7:30 pm.');
      return;
    }
    if (p.err) {
      setAddErr(null);
      say(p.err);
      return;
    }
    const minute = p.minute;
    const words = `Added ${shortDate(p.day)}, ${clockOf(minute)}.${anyOpened ? ' Open in the Portal now.' : ''}`;
    if (!live) {
      seq.current += 1;
      const id = `n${seq.current}`;
      setMock((m) => ({ ...m, times: [...m.times, { id, day: p.day, minute, free: 2, opened: anyOpened, booking: null, heldBy: null }] }));
      flash(id);
      setShown((m) => ({ ...m, [weeks.findIndex((wk) => wk.includes(p.day))]: p.day }));
      setSel(p.day);
      setAddText('');
      setAddErr(null);
      setAdded({ text: words, undo: caps.undoTime ? id : null });
      focusNext('.iz-add-in');
      say(`Added ${clockOf(minute)} on ${fullDate(p.day)}.${anyOpened ? ' Open in the Portal now.' : ''}`);
      return;
    }
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call('add', () => addTimeLive(cycle, p.day, hhmm(minute), anyOpened), { write: true, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') {
      setShown((m) => ({ ...m, [weeks.findIndex((wk) => wk.includes(p.day))]: p.day }));
      setSel(p.day);
      setAddText('');
      setAddErr(null);
      setAdded({ text: words, undo: null });
      focusNext('.iz-add-in');
      say(words);
    } else {
      setAddErr(r.message);
      say(r.message);
      focusNext('.iz-add-in');
    }
  }

  // Undo of an added time (mock only).
  function unadd(id: string) {
    setMock((m) => ({ ...m, times: m.times.filter((t) => t.id !== id) }));
    setAdding(false);
    setAdded(null);
    focusNext('.iz-add-open');
    say('Time removed');
  }

  // Escape in the add field closes it and puts focus back on "Add a time".
  function addKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    setAdding(false);
    setAddText('');
    setAddErr(null);
    focusNext('.iz-add-open');
  }

  // ---------- Booked ----------

  // Opens the Teams link field on a ticket.
  function editLink(b: IzBooking) {
    setLk(b.id);
    setLkVal(b.link ?? '');
    setLkErr(null);
    focusNext(`#iz-lk-${b.id}`);
  }

  // Closes the field without saving.
  function cancelLink(id: string) {
    setLk(null);
    setLkErr(null);
    focusNext(`#iz-lked-${id}`);
  }

  // "Save and send": a Teams link only. Live: saveVideoLinks for this one interview, which may email the student and both
  // interviewers; the line under it is the server's own words, with a tick only when nothing in them failed.
  async function saveLink(e: FormEvent, b: IzBooking) {
    e.preventDefault();
    if (gate.locked()) {
      setLkErr(STILL_SAVING);
      say(STILL_SAVING);
      return;
    }
    const v = lkVal.trim();
    if (!isVideoUrl(v)) {
      setLkErr(LINK_ERR);
      say(LINK_ERR);
      focusNext(`#iz-lk-${b.id}`);
      return;
    }
    const done = (n: Note, words: string) => {
      setSaved((s) => ({ ...s, [b.id]: n }));
      setLk(null);
      setLkErr(null);
      focusNext(`#iz-lked-${b.id}, #iz-saved-${b.id}`);
      say(words);
    };
    if (!live) {
      gate.hold(`lk:${b.id}`);
      later(() => {
        setMock((m) => ({ ...m, bookings: m.bookings.map((x) => (x.id === b.id ? { ...x, link: v } : x)) }));
        gate.release();
        done({ text: `Saved and sent ${stamp('9:21 AM')}`, ok: true }, `Saved and sent the Teams link for ${b.name}`);
      }, 600);
      return;
    }
    const r = await call(`lk:${b.id}`, () => saveLinkLive(b.id, v), { write: true, sends: true });
    if (r.kind === 'locked') return;
    if (r.kind === 'ok') done({ text: r.value.message, ok: noteOk(r.value.message) }, r.value.message);
    else {
      setLkErr(r.message);
      say(r.message);
      focusNext(`#iz-lk-${b.id}`);
    }
  }

  // ---------- Board ----------

  // A Board result line: the server's words (tick only when nothing failed); focus goes to the line itself.
  function putBoard(n: Note) {
    setBoardAsk(null);
    setBoardNote(n);
    say(n.text);
    focusNext('#iz-bnote');
  }

  // The rebalance confirm for a preview's moves (null when nothing needs to move).
  const rebalAsk = (moves: MoveView[], message: string): BoardAsk | null =>
    moves.length === 0
      ? null
      : { kind: 'rebal', text: message || `Moves ${moves.length} ${moves.length === 1 ? 'interview' : 'interviews'}. The people affected get an email.`, lines: moves.map(moveLine), go: `Move ${moves.length} ${moves.length === 1 ? 'interview' : 'interviews'}`, n: moves.length, sig: movesSig(moves), changed: false };

  // The pairing confirm for a preview (null when nothing is unpaired).
  const pairAsk = (p: PairingPreview): BoardAsk | null => {
    if (p.unpaired === 0) return null;
    const short = p.uncovered > 0 ? ` ${p.uncovered} can't be paired: fewer than two board members are free.` : '';
    return { kind: 'pair', text: `Pairs ${p.wouldPair} of the ${p.unpaired} booked ${p.unpaired === 1 ? 'interview' : 'interviews'} with no interviewers.${short}`, lines: [], go: `Pair ${p.wouldPair}`, n: p.wouldPair, sig: pairSig(p), changed: false };
  };

  // Shows a Board confirm (or the "nothing to do" line when there is none).
  function showAsk(ask: BoardAsk | null, none: string) {
    if (!ask) return putBoard({ text: none, ok: true });
    setBoardNote(null);
    setBoardAsk(ask);
    opened('#iz-askq');
  }

  const NO_MOVES = 'Nothing needs to move. Everyone is as even as the limits and free times allow.';
  const NO_PAIRS = 'Every booked interview has two interviewers. Nothing to pair.';

  // Rebalance. Mock: the demo's result. Live: what it would move first, then the confirm.
  async function rebalance() {
    setBoardAsk(null);
    if (!live) return putBoard({ text: 'Already even: everyone has 1 or 2 of the 5 booked. Nothing moved.', ok: true });
    if (!d.cycleId) return;
    const cycle = d.cycleId;
    const r = await call('rebalcheck', () => previewRebalanceLive(cycle), { write: false, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'fail') return putBoard({ text: r.message, ok: false });
    showAsk(rebalAsk(r.value.moves, r.value.message), NO_MOVES);
  }

  // Re-run pairing. Mock: the demo's result. Live: how many it would pair first, then the confirm.
  async function pairing() {
    setBoardAsk(null);
    if (!live) return putBoard({ text: 'All 5 booked interviews have two interviewers. Nothing to pair.', ok: true });
    const r = await call('paircheck', previewPairingLive, { write: false, sends: false });
    if (r.kind === 'locked') return;
    if (r.kind === 'fail') return putBoard({ text: r.message, ok: false });
    showAsk(pairAsk(r.value), NO_PAIRS);
  }

  // Runs the confirmed rebalance or pairing, after checking the preview again (the server plans anew on confirm): if it
  // changed, the new one shows with "Things changed. Check this list again." and nothing is done.
  async function runAsk() {
    const ask = boardAsk;
    if (!ask) return;
    if (gate.locked()) return say(STILL_SAVING);
    const cycle = d.cycleId ?? '';
    let now: BoardAsk | null;
    if (ask.kind === 'rebal') {
      const c = await call('rebalcheck', () => previewRebalanceLive(cycle), { write: false, sends: false });
      if (c.kind === 'locked') return;
      if (c.kind === 'fail') return putBoard({ text: c.message, ok: false });
      now = rebalAsk(c.value.moves, c.value.message);
    } else {
      const c = await call('paircheck', previewPairingLive, { write: false, sends: false });
      if (c.kind === 'locked') return;
      if (c.kind === 'fail') return putBoard({ text: c.message, ok: false });
      now = pairAsk(c.value);
    }
    if (!now) return putBoard({ text: ask.kind === 'rebal' ? NO_MOVES : NO_PAIRS, ok: true });
    if (now.sig !== ask.sig) {
      setBoardAsk({ ...now, changed: true });
      say(`${CHANGED} ${now.text}`);
      opened('#iz-askq');
      return;
    }
    if (ask.kind === 'rebal') {
      const r = await call('rebal', () => rebalanceLive(cycle), { write: true, sends: true });
      if (r.kind === 'locked') return;
      if (r.kind === 'ok') putBoard({ text: r.value.message, ok: noteOk(r.value.message) });
      else putBoard({ text: sentFail(r.message, 'Some emails may already have gone out.'), ok: false });
    } else {
      const r = await call('pair', rerunPairingLive, { write: true, sends: false });
      if (r.kind === 'locked') return;
      if (r.kind === 'ok') putBoard({ text: r.value.message, ok: noteOk(r.value.message) });
      else putBoard({ text: r.message, ok: false });
    }
  }

  // The nudge (mock only): opens the draft, sends it, or closes it.
  function toggleNudge() {
    const next = nudge === 'draft' ? 'none' : 'draft';
    setNudge(next);
    if (next === 'draft') focusNext('#iz-nsend');
  }
  function sendNudge() {
    if (gate.locked()) return;
    gate.hold('nudge');
    later(() => {
      gate.release();
      setNudge('sent');
      setEditing(false);
      say('Nudge sent to Miles Donovan');
      focusNext('#iz-nudged');
    }, 450 + 230);
  }

  // Try again on the load-error state: reloads the page's data.
  function retry() {
    setRetrying(true);
    router.refresh();
    later(() => setRetrying(false), 800);
  }

  // ---------- Drawing ----------

  const header = (
    <PageHeader
      title="Interviews"
      date={
        <>
          {d.first && d.last ? <span className="rf-nowrap">{rangeLabel(d.first, d.last)}</span> : null}
          <Link className="rf-lnk" href={QUESTIONS}>
            Interview questions
          </Link>
          <Link className="rf-lnk" href={AVAILABILITY}>
            Your availability
          </Link>
        </>
      }
    />
  );

  if (d.loadError) {
    return (
      <div className="rf iz" ref={root}>
        {header}
        <div className="rf-pcard">
          <StateLine kind="error" onRetry={retry} retrying={retrying}>
            Interviews didn&apos;t load.
          </StateLine>
        </div>
      </div>
    );
  }

  // No published cycle: nothing to plan yet, so no tasks and no controls.
  if (d.cycleId === null) {
    return (
      <div className="rf iz" ref={root}>
        {header}
        <div className="rf-pcard">
          <StateLine kind="empty">No interview cycle is published yet.</StateLine>
        </div>
      </div>
    );
  }

  // The names in a pair, so they never break across lines.
  const names = (pair: IzInterviewer[]) => pair.map((p) => p.name);
  const yoursCount = (day: string) => d.bookings.filter((b) => b.day === day && mine(b)).length;
  const maxH = Math.max(32, ...d.people.map((p) => p.hours));

  // One time in a day cell: booked shows the student's first name; open shows its free board members as dots.
  const tm = (t: IzTime) => {
    const b = t.booking ? byId.get(t.booking) : undefined;
    const booked = b !== undefined || t.heldBy !== null;
    const cls = `iz-tm${booked ? ' iz-booked' : ''}${b && mine(b) ? ' iz-yours' : ''}${fresh.includes(t.id) ? ' iz-fresh' : ''}`;
    return (
      <span key={t.id} className={cls}>
        <span className="iz-tt">{clockOf(t.minute)}</span>
        {booked ? <span className="iz-bn">{(b?.name ?? t.heldBy ?? '').split(' ')[0]}</span> : <Dots n={t.free} />}
      </span>
    );
  };

  // One row in an opened day.
  const slot = (t: IzTime) => {
    if (undoIds.includes(t.id)) {
      return (
        <li key={t.id}>
          <Fold open appear>
            <div className="iz-undo-line">
              <span className="iz-ul-tick">
                <Icon name="check" />
              </span>
              <span>Removed {clockOf(t.minute)}</span>
              <span aria-hidden="true">·</span>
              <button type="button" className="rf-lnk" id={`iz-undo-${t.id}`} onClick={() => unremove(t)}>
                Undo
              </button>
            </div>
          </Fold>
        </li>
      );
    }
    const b = t.booking ? byId.get(t.booking) : undefined;
    const yours = b !== undefined && mine(b);
    return (
      <li key={t.id}>
        <div className={`iz-slot${yours ? ' iz-yours' : ''}${fresh.includes(t.id) ? ' iz-fresh' : ''}`}>
          <span className="iz-st">{clockOf(t.minute)}</span>
          <span className="iz-sb">
            {b ? (
              <>
                <Link className="iz-nm iz-open" href={interviewHref(b.id)}>
                  {b.name}
                </Link>
                <span className="iz-cd">{b.code}</span>
                <span className="iz-pr">
                  <Nw text={b.pair.length ? names(b.pair).join(' + ') : 'Not paired yet'} names={names(b.pair)} />
                </span>
              </>
            ) : t.heldBy !== null ? (
              <span className="iz-nm">{t.heldBy}</span>
            ) : (
              <span className="iz-fr">
                <Dots n={t.free} />
                {t.free} board {t.free === 1 ? 'member' : 'members'} free
              </span>
            )}
          </span>
          <span className="iz-sa">
            {b?.needsCover ? (
              <span className="iz-cover">Needs cover</span>
            ) : b || t.heldBy !== null ? (
              yours ? (
                <span className="iz-chip-gold">Yours</span>
              ) : (
                <span title="Booked times can't be removed">Booked</span>
              )
            ) : caps.removeTime ? (
              <button type="button" className="rf-lnk" id={`iz-rmv-${t.id}`} {...busyProps(`rm:${t.id}`)} aria-label={`Remove ${clockOf(t.minute)} on ${shortDate(t.day)}`} onClick={() => void removeTime(t)}>
                {busy === `rm:${t.id}` ? 'Removing…' : 'Remove'}
              </button>
            ) : null}
          </span>
        </div>
      </li>
    );
  };

  // The opened day, drawn under its week.
  const dayPanel = (day: string) => {
    const ts = timesOn(d.times, day);
    const n = ts.filter((t) => !undoIds.includes(t.id)).length;
    const p = adding && addText.trim() ? parseAdd(addText, day, d.today, d.first, d.last, (dd, m) => d.times.some((t) => t.day === dd && t.minute === m && !undoIds.includes(t.id))) : null;
    return (
      <div className="iz-dd-in">
        <div className="iz-dd-h">
          <h3>{fullDate(day)}</h3>
          <span className="iz-r">
            <span>
              {n} {n === 1 ? 'time' : 'times'}
            </span>
            <button type="button" className="rf-lnk" onClick={closeDay}>
              Close
            </button>
          </span>
        </div>
        {ts.length > 0 ? <ul className="iz-slots">{ts.map(slot)}</ul> : null}
        {caps.addTime ? (
          <div className="iz-add">
            <button type="button" className="iz-add-open" hidden={adding} onClick={() => { setAdding(true); focusNext('.iz-add-in'); }}>
              <span className="iz-plus">
                <Icon name="plus" />
              </span>
              <span>Add a time on {weekday(day)}</span>
            </button>
            <form className="iz-add-form" hidden={!adding} autoComplete="off" onSubmit={(e) => void addTime(e)}>
              <div className="iz-add-field">
                <span className="iz-plus">
                  <Icon name="plus" />
                </span>
                <input
                  className="iz-add-in"
                  type="text"
                  enterKeyHint="done"
                  aria-label={`New time on ${fullDate(day)}. A day word like sat moves it.`}
                  placeholder="A time, e.g. 7:30 pm"
                  value={addText}
                  readOnly={busy === 'add'}
                  onChange={(e) => { setAddText(e.target.value); setAddErr(null); }}
                  onKeyDown={addKey}
                />
                <span className="iz-add-hint">{busy === 'add' ? 'Adding…' : 'Enter to add'}</span>
              </div>
              <div className="iz-chips">
                {p && (p.dayWord || p.minute !== null) ? (
                  <span className="iz-pchip">
                    <Icon name="cal" />
                    {addDayChip(p.day, d.first, d.last)}
                  </span>
                ) : null}
                {p && p.minute !== null ? (
                  <span className="iz-pchip">
                    <Icon name="clock" />
                    {clockOf(p.minute)}
                  </span>
                ) : null}
                {addErr ? <span className="iz-perr">{addErr}</span> : p && p.err && p.minute !== null ? <span className="iz-perr">{p.err}</span> : null}
              </div>
            </form>
            {added ? (
              <div className="iz-added">
                <span className="iz-tick">
                  <Icon name="check" />
                </span>
                <span>
                  <Nw text={added.text} />
                </span>
                {added.undo ? (
                  <button type="button" className="rf-lnk" onClick={() => unadd(added.undo as string)}>
                    Undo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const calendar =
    weeks.length === 0 ? (
      <StateLine kind="empty">The cycle has no interview dates yet.</StateLine>
    ) : (
      <div className="iz-cal-wrap">
        <div className="iz-wkhd" aria-hidden="true">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
            <span key={w}>
              <span className="iz-l">{w}</span>
              <span className="iz-s">{w[0]}</span>
            </span>
          ))}
        </div>
        <div className="iz-cal">
          {weeks.map((wk, wi) => {
            const open = sel !== null && wk.includes(sel);
            const last = shown[wi];
            return [
              ...wk.map((day) => {
                const n = Number(day.slice(8));
                if (!inWindow(day, d.first, d.last)) {
                  return (
                    <span key={day} className="iz-day iz-out" aria-hidden="true">
                      <span className="iz-dh">
                        <b>{n}</b>
                      </span>
                    </span>
                  );
                }
                const ts = timesOn(d.times, day).filter((t) => !undoIds.includes(t.id));
                return (
                  <button
                    key={day}
                    type="button"
                    id={`iz-day-${day}`}
                    className={`iz-day${day === d.today ? ' iz-today' : ''}`}
                    aria-expanded={sel === day}
                    aria-controls={`iz-dd-${wi}`}
                    onClick={() => openDay(day)}
                  >
                    {/* The name screen readers hear is this one sentence (as hidden text, not aria-label, so the
                        drawn number and bars never disagree with the name); the drawn parts are hidden from them. */}
                    <span className="rf-sr">{cellLabel(day, d.today, ts, yoursCount(day))}</span>
                    <span className="iz-dh" aria-hidden="true">
                      <b>{n}</b>
                      {day === d.today ? <span className="iz-tday">Today</span> : null}
                    </span>
                    <span className="iz-tms" aria-hidden="true">{ts.map(tm)}</span>
                  </button>
                );
              }),
              <Fold key={`dd-${wi}`} open={open} id={`iz-dd-${wi}`} className="iz-dd">
                {last ? dayPanel(open && sel ? sel : last) : null}
              </Fold>,
            ];
          })}
        </div>
        <p className="iz-legend">
          <span>
            <i className="iz-lg" />
            Open
          </span>
          <span>
            <i className="iz-lg iz-b" />
            Booked
          </span>
          <span>
            <i className="iz-lg iz-y" />
            Yours
          </span>
          <span className="iz-lgd">
            <Dots n={3} />
            board members free
          </span>
        </p>
      </div>
    );

  // One booked interview.
  const ticket = (b: IzBooking) => {
    const open = !!openTk[b.id];
    const toggle = () => setOpenTk((o) => ({ ...o, [b.id]: !o[b.id] }));
    const stub = b.day ? stubOf(b.day) : null;
    const isMine = mine(b);
    const faces = [...b.pair].sort((x, y) => (x.id === d.me ? -1 : y.id === d.me ? 1 : 0));
    return (
      <li key={b.id} className={`iz-ticket${isMine ? ' iz-mine' : ''}`}>
        {/* The date block opens the ticket too (a larger target); the button beside it is the control screen readers get. */}
        <span className="iz-stub" aria-hidden="true" onClick={toggle}>
          <span>{stub?.wd ?? ''}</span>
          <strong>{stub?.n ?? ''}</strong>
          <span>{stub?.mon ?? ''}</span>
        </span>
        <button type="button" className="iz-tk-head" aria-expanded={open} aria-controls={`iz-tkm-${b.id}`} onClick={toggle}>
          <span className="iz-tb">
            <span className="iz-eb">
              {b.day ? (
                <>
                  <span className="iz-cd" title={fullDate(b.day)}>
                    {izRel(d.today, b.day)}
                  </span>
                  <span className="iz-kw">{clockOf(b.minute)}</span>
                </>
              ) : (
                <span className="iz-cd">{b.whenText}</span>
              )}
            </span>
            <span className="iz-tl">
              <span className="iz-nm">{b.name}</span>
            </span>
            <span className="iz-tmarks">
              <span className="iz-who">
                {faces.length > 0 ? (
                  <span className="iz-faces" aria-hidden="true">
                    {faces.map((p) => (
                      <span key={p.id} className={`iz-fc${p.id === d.me ? ' iz-me' : ''}`}>
                        {p.initials}
                      </span>
                    ))}
                  </span>
                ) : null}
                <span>
                  <Nw text={pairText(b.pair, d.me)} names={names(b.pair)} />
                </span>
              </span>
              {b.needsCover ? (
                <span className="iz-cover">
                  <Icon name="alert" />
                  Needs cover
                </span>
              ) : null}
              {/* An old non-Teams link reads as one to replace (Make Teams links does that); another pair's hidden link as set. */}
              {(b.link && isVideoUrl(b.link)) || b.linkHidden ? (
                <span className="iz-haslink">
                  <Icon name="video" />
                  {b.linkHidden ? 'Link set' : 'Teams link ready'}
                </span>
              ) : b.link ? (
                <span className="iz-nolink">
                  <Icon name="clock" />
                  Not a Teams link
                </span>
              ) : (
                <span className="iz-nolink">
                  <Icon name="clock" />
                  No Teams link
                </span>
              )}
            </span>
          </span>
          <Icon name="down" className="iz-tk-chev" />
        </button>
        {/* Open the interview's page; Join and Copy link for its two interviewers and admins (no folding needed). */}
        <span className="iz-tk-acts">
          <Link className="rf-lnk" href={interviewHref(b.id)} aria-label={`Open ${b.name}'s interview`}>
            Open
          </Link>
          {b.link && isVideoUrl(b.link) && (isMine || d.isAdmin) ? (
            <>
              <a className="rf-lnk" href={b.link} target="_blank" rel="noopener noreferrer" aria-label={`Join ${b.name}'s interview on Teams`}>
                <Icon name="video" />
                Join
              </a>
              <button type="button" className="rf-lnk" aria-label={copied === b.id ? 'Copied' : `Copy link for ${b.name}'s interview`} onClick={() => copyLink(b)}>
                {copied === b.id ? <Icon name="check" /> : null}
                {copied === b.id ? 'Copied' : 'Copy link'}
              </button>
            </>
          ) : null}
        </span>
        <Fold open={open} id={`iz-tkm-${b.id}`} className="iz-tk-fold">
          <dl className="iz-tk-more">
            <dt>Applicant</dt>
            <dd className="rf-nowrap">{b.code}</dd>
            <dt>Teams link</dt>
            <dd>
              {lk === b.id ? (
                <form className="iz-lk-form" autoComplete="off" onSubmit={(e) => void saveLink(e, b)}>
                  <input
                    id={`iz-lk-${b.id}`}
                    type="url"
                    inputMode="url"
                    placeholder="Teams link"
                    aria-label={`Teams link for ${b.code}`}
                    aria-invalid={lkErr ? true : undefined}
                    aria-describedby={lkErr ? `iz-lkerr-${b.id}` : undefined}
                    value={lkVal}
                    onChange={(e) => setLkVal(e.target.value)}
                  />
                  <span className="iz-note">
                    Saving sends it to <span className="iz-wrapname">{b.name}</span> and both interviewers.
                  </span>
                  {lkErr ? (
                    <span className="iz-err" id={`iz-lkerr-${b.id}`}>
                      {lkErr}
                    </span>
                  ) : null}
                  <span className="iz-dact">
                    <button type="submit" className="rf-btn" {...busyProps(`lk:${b.id}`)}>
                      <Icon name="send" />
                      {busy === `lk:${b.id}` ? 'Sending…' : 'Save and send'}
                    </button>
                    <button type="button" className="rf-lnk" onClick={() => cancelLink(b.id)}>
                      Cancel
                    </button>
                  </span>
                </form>
              ) : (
                <span className="iz-acts">
                  {/* A Teams link's Join and Copy link sit on the ticket itself; an old non-Teams link still opens from here. */}
                  {b.link && (isMine || d.isAdmin) && !isVideoUrl(b.link) ? (
                    <a className="rf-lnk" href={b.link} target="_blank" rel="noopener noreferrer">
                      Open old link
                    </a>
                  ) : b.link && (isMine || d.isAdmin) ? (
                    <span>Set</span>
                  ) : b.link || b.linkHidden ? (
                    <span>Set for its two interviewers</span>
                  ) : (
                    <span>None yet</span>
                  )}
                  {/* Only a paired interview takes a link (the server refuses one with no interviewers). */}
                  {caps.pasteLink && b.pair.length === 2 ? (
                    <button type="button" className="rf-lnk" id={`iz-lked-${b.id}`} disabled={locked} onClick={() => editLink(b)}>
                      {b.link ? 'Change' : 'Paste one'}
                    </button>
                  ) : null}
                  {saved[b.id] ? (
                    <span className={`iz-nudged${saved[b.id].ok ? '' : ' iz-bad'}`} id={`iz-saved-${b.id}`} tabIndex={-1}>
                      <Icon name={saved[b.id].ok ? 'check' : 'alert'} />
                      {saved[b.id].text}
                    </span>
                  ) : null}
                </span>
              )}
            </dd>
            <dt>Prep</dt>
            <dd>
              <Link className="rf-lnk" href={QUESTIONS}>
                Interview questions
              </Link>
            </dd>
          </dl>
        </Fold>
      </li>
    );
  };

  // One board member.
  const person = (p: IzPerson) => {
    const n = p.interviews;
    const cap = p.most ?? Math.max(d.target, n);
    const isMe = p.id === d.me;
    const hoursText = !p.sent ? 'No free hours sent' : `${p.hours} h${p.weekOnly ? ', this week only' : ''}${p.most ? ` · most ${p.most}` : ''}`;
    const label = `${n} of ${cap} interviews${p.most ? ', their most' : d.target ? `, target ${d.target}` : ''}`;
    return (
      <li key={p.id}>
        <div className="iz-pp">
          <span className={`iz-av${isMe ? ' iz-me' : ''}`} aria-hidden="true">
            {p.initials}
          </span>
          <span className="iz-pn">
            <span className="rf-nowrap">{p.name}</span>
            {isMe ? <span> (you)</span> : null}
          </span>
          <span className="iz-sq" role="img" aria-label={label}>
            {Array.from({ length: cap }, (_, i) => (
              <span key={i} className={i < n ? 'iz-on' : undefined} />
            ))}
            <b>{n}</b>
          </span>
          <span className="iz-hrs">
            <span className={`iz-track${p.weekOnly ? ' iz-half' : ''}`} aria-hidden="true">
              <i style={{ width: `${((p.hours / maxH) * 100).toFixed(1)}%` }} />
            </span>
            <span className="rf-nowrap">{hoursText}</span>
          </span>
          {p.weekOnly && caps.nudge ? (
            nudge === 'sent' ? (
              <div className="iz-waitbar iz-done">
                <span className="iz-nudged" id="iz-nudged" tabIndex={-1}>
                  <Icon name="check" />
                  Nudged just now
                </span>
              </div>
            ) : (
              <div className="iz-waitbar">
                <span className="iz-wt">
                  <Icon name="clock" />
                  Next week missing
                </span>
                <button type="button" className="iz-nudge" aria-expanded={nudge === 'draft'} aria-controls="iz-nudgebox" onClick={toggleNudge}>
                  Nudge {p.name.split(' ')[0]}
                </button>
              </div>
            )
          ) : !p.sent ? (
            <div className="iz-waitbar">
              <span className="iz-wt">
                <Icon name="clock" />
                Waiting on free hours
              </span>
            </div>
          ) : null}
        </div>
        {p.weekOnly && caps.nudge && nudge !== 'sent' ? (
          <Fold open={nudge === 'draft'} id="iz-nudgebox">
            <div className="iz-draft">
              <span className="iz-dl">
                To <span className="rf-nowrap">{p.name}</span> in Board chat
              </span>
              {editing ? (
                <textarea className="iz-dtext" rows={3} aria-label={`Message to ${p.name}`} value={nudgeText} onChange={(e) => setNudgeText(e.target.value)} />
              ) : (
                <p className="iz-dtext">{nudgeText}</p>
              )}
              <div className="iz-dact">
                <button type="button" className="rf-btn" id="iz-nsend" {...busyProps('nudge')} onClick={sendNudge}>
                  <Icon name="send" />
                  {busy === 'nudge' ? 'Sending…' : 'Send'}
                </button>
                <button type="button" className="rf-lnk" onClick={() => { setEditing(true); focusNext('textarea.iz-dtext'); }}>
                  Edit
                </button>
                <button type="button" className="rf-lnk" onClick={() => { setNudge('none'); setEditing(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          </Fold>
        ) : null}
      </li>
    );
  };

  // A write control: disabled while any call runs or fresh data is awaited, except the one whose call is running (it keeps
  // focus, reads "busy" to screen readers, and a press on it does nothing more).
  // (A function declaration, so the day drawer and tickets drawn above may use it.)
  function busyProps(key: string) {
    return { disabled: locked && busy !== key, 'aria-disabled': busy === key ? true : undefined };
  }

  // The words over a confirm: "Things changed. Check this list again." first when its preview changed on recheck.
  const askWords = (id: string, text: string, changed: boolean) => (
    <p id={id} tabIndex={-1}>
      {changed ? (
        <>
          <b>{CHANGED}</b>{' '}
        </>
      ) : null}
      {text}
    </p>
  );

  // The Teams-links confirm (in the gold card, or the sheet under Booked). Live it shows the server's preview only (its
  // words carry the fresh counts); mock shows the demo's line and the names of the interviews without a link.
  const mkConfirm = () => {
    const go = preview ? linksGo(preview) : null;
    const n = preview?.toMake ?? 0;
    return (
      <div className="iz-confirm">
        {askWords('iz-mkq', preview?.text ?? DEMO_MK, preview?.changed ?? false)}
        {!live && missing.length > 0 ? (
          <ul>
            {missing.map((b) => (
              <li key={b.id}>
                <b className="rf-nowrap">{b.name}</b> with <Nw text={pairText(b.pair, d.me).replace(/^You /, 'you ')} names={names(b.pair)} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="iz-dact">
          {go ? (
            <GoButton className="rf-btn rf-btn-gold" id="iz-mkgo" {...busyProps('mk')} aria-describedby="iz-mkq" openedAt={openedAt} onGo={() => void makeLinks()}>
              <Icon name="video" />
              <span>{busy === 'mk' ? (n > 0 ? `Making ${n} Teams ${n === 1 ? 'link' : 'links'}…` : 'Sending the emails…') : busy === 'mkcheck' ? 'Checking…' : go}</span>
            </GoButton>
          ) : null}
          <button type="button" className="rf-lnk" id="iz-mkback" disabled={busy === 'mk'} onClick={closeMake}>
            Back
          </button>
        </div>
      </div>
    );
  };

  // The gold card's content for the stage that waits now.
  const needsBody = () => {
    if (stage === 'links') {
      return (
        <>
          <div className="iz-n-top">
            <h2 id="iz-nh" tabIndex={-1}>
              No Teams link yet
            </h2>
          </div>
          <div className="iz-n-body">
            <ul className="iz-miss">
              {missing.map((b) => (
                <li key={b.id}>
                  <b>{b.name}</b>
                  <span>
                    {b.day ? `${shortDate(b.day)}, ${clockOf(b.minute)}` : b.whenText}
                    {mine(b) ? ' · yours' : ''}
                  </span>
                </li>
              ))}
            </ul>
            {confirm !== 'mk' ? (
              <div className="iz-n-act">
                <button type="button" className="rf-btn rf-btn-gold" id="iz-mk" {...busyProps('mkcheck')} onClick={() => void openMake()}>
                  <Icon name="video" />
                  <span>{busy === 'mkcheck' ? 'Checking…' : 'Make Teams links'}</span>
                </button>
              </div>
            ) : null}
          </div>
          <Fold open={confirm === 'mk'}>{mkConfirm()}</Fold>
        </>
      );
    }
    if (stage === 'waiting') {
      return (
        <>
          <div className="iz-n-top">
            <h2 id="iz-nh" tabIndex={-1}>
              No interview times yet
            </h2>
          </div>
          <div className="iz-n-body">
            <p className="iz-n-sub">
              <Nw text={notSent.length ? `Waiting on free hours from ${joinNames(notSent)}.` : 'Everyone has sent free hours.'} names={notSent} />
            </p>
            {caps.rebuild && confirm !== 'remind' ? (
              <div className="iz-n-act">
                {caps.remindBoard && notSent.length > 0 ? (
                  <button type="button" className="rf-lnk" id="iz-remind" disabled={locked} onClick={() => { setConfirm('remind'); opened('#iz-remindq'); }}>
                    Remind them
                  </button>
                ) : null}
                <button type="button" className="rf-btn rf-btn-gold" id="iz-build" {...busyProps('rebuild')} onClick={() => void rebuild(true)}>
                  <Icon name="cal" />
                  <span>{busy === 'rebuild' ? 'Building…' : 'Build times'}</span>
                </button>
              </div>
            ) : null}
          </div>
          {caps.remindBoard ? (
            <Fold open={confirm === 'remind'}>
              <div className="iz-confirm">
                {askWords('iz-remindq', 'Each one who hasn’t sent free hours gets an email asking for them, once a day at most.', false)}
                <div className="iz-dact">
                  <GoButton className="rf-btn rf-btn-gold" id="iz-remindgo" {...busyProps('remind')} aria-describedby="iz-remindq" openedAt={openedAt} onGo={() => void remindOthers()}>
                    <Icon name="send" />
                    <span>{busy === 'remind' ? `Emailing ${notSent.length} board ${notSent.length === 1 ? 'member' : 'members'}…` : 'Send reminder'}</span>
                  </GoButton>
                  <button type="button" className="rf-lnk" disabled={busy === 'remind'} onClick={() => { setConfirm(null); focusNext('#iz-remind, #iz-build'); }}>
                    Back
                  </button>
                </div>
              </div>
            </Fold>
          ) : null}
        </>
      );
    }
    if (stage === 'send') {
      return (
        <>
          <div className="iz-n-top">
            <h2 id="iz-nh" tabIndex={-1}>
              Times not sent yet
            </h2>
          </div>
          <div className="iz-n-body">
            <p className="iz-n-sub">
              {openTimes} {openTimes === 1 ? 'time is' : 'times are'} ready for {d.applicants} {d.applicants === 1 ? 'applicant' : 'applicants'}.
            </p>
            {caps.sendTimes && confirm !== 'send' ? (
              <div className="iz-n-act">
                <button type="button" className="rf-btn rf-btn-gold" id="iz-send" disabled={locked} onClick={() => { setConfirm('send'); opened('#iz-sendq'); }}>
                  <Icon name="send" />
                  <span>Send times</span>
                </button>
              </div>
            ) : null}
          </div>
          {caps.sendTimes ? (
            <Fold open={confirm === 'send'}>
              <div className="iz-confirm">
                {askWords('iz-sendq', `Opens every time in the Portal and emails the ${notBooked} ${notBooked === 1 ? 'applicant' : 'applicants'} without a time a link to pick one.`, false)}
                <div className="iz-dact">
                  <GoButton className="rf-btn rf-btn-gold" id="iz-sendgo" {...busyProps('send')} aria-describedby="iz-sendq" openedAt={openedAt} onGo={() => void sendAll()}>
                    <Icon name="send" />
                    <span>{busy === 'send' ? `Sending to ${notBooked}…` : `Open times and email ${notBooked}`}</span>
                  </GoButton>
                  <button type="button" className="rf-lnk" disabled={busy === 'send'} onClick={() => { setConfirm(null); focusNext('#iz-send'); }}>
                    Back
                  </button>
                </div>
              </div>
            </Fold>
          ) : null}
        </>
      );
    }
    if (stage === 'book') {
      return (
        <>
          <div className="iz-n-top">
            <h2 id="iz-nh" tabIndex={-1}>
              Not booked yet
            </h2>
            {d.dueDay ? (
              <span className="iz-n-due" title={`Due ${fullDate(d.dueDay)}`}>
                Due {weekday(d.dueDay)}
              </span>
            ) : null}
          </div>
          <div className="iz-n-body">
            <p className="iz-n-sub">
              {notBooked} of {d.applicants} {d.applicants === 1 ? 'applicant hasn’t' : 'applicants haven’t'} picked a time.
            </p>
            {showWaiting ? (
              <div className="iz-n-act">
                <a className="rf-lnk" href="#iz-wh">
                  See who
                </a>
              </div>
            ) : null}
          </div>
        </>
      );
    }
    return (
      <div className="iz-n-top">
        <h2 id="iz-nh" tabIndex={-1}>
          Every applicant has a time
        </h2>
      </div>
    );
  };

  const showNeeds = stage !== 'clear' || needsNote !== null;
  const segs = Math.min(Math.max(d.applicants, 1), 40);
  const onSegs = d.applicants > 0 ? Math.round((d.booked / d.applicants) * segs) : 0;
  // "Make Teams links" under Booked: admins, whenever a paired interview exists and the gold card is on another task (the
  // old Video links sheet's paths: links never emailed, old non-Teams links, and the retry the server's words ask for).
  const linksSheet = caps.makeLinks && !mkInCard && d.bookings.some((b) => b.pair.length === 2);
  const bookedBar =
    d.applicants > 0 ? (
      <div className="iz-bk-bar">
        <span className="iz-bar" role="img" aria-label={`${d.booked} of ${d.applicants} booked`} title={`${d.booked} of ${d.applicants} booked`}>
          {Array.from({ length: segs }, (_, i) => (
            <span key={i} className={i < onSegs ? 'iz-on' : undefined} />
          ))}
        </span>
        <b>
          {d.booked} of {d.applicants}
        </b>
      </div>
    ) : null;

  // A result line under a panel heading: tick or alert, focusable so focus can land on it after the action.
  const result = (id: string, n: Note | null) => (
    <div className="iz-result">
      <p id={id} tabIndex={-1}>
        <span className="iz-tick">
          <Icon name={n?.ok === false ? 'alert' : 'check'} />
        </span>
        <span>{n?.text}</span>
      </p>
    </div>
  );

  return (
    <div className="rf iz" ref={root}>
      {header}
      <div className="iz-board">
        {showNeeds ? (
          <section className="iz-needs iz-span" aria-labelledby="iz-nh">
            {needsNote ? (
              <p id="iz-ndone" tabIndex={-1} className={`iz-done-line${needsNote.ok ? '' : ' iz-bad'}`}>
                <span className="iz-tick">
                  <Icon name={needsNote.ok ? 'check' : 'alert'} />
                </span>
                <span>{needsNote.text}</span>
              </p>
            ) : null}
            <Fold open appear key={stageKey}>
              {needsBody()}
            </Fold>
          </section>
        ) : null}

        <Panel
          id="iz-fh"
          title="Interview times"
          className="iz-span"
          action={
            <div className="iz-r">
              <span>{d.sentLine}</span>
              {caps.rebuild && d.times.length > 0 ? (
                <span className="iz-adm">
                  <button type="button" className="rf-lnk" id="iz-rebuild" {...busyProps('rebuild')} onClick={() => void rebuild(false)}>
                    {busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild from availability'}
                  </button>
                </span>
              ) : null}
            </div>
          }
        >
          <Fold open={timesNote !== null}>{result('iz-tnote', timesNote)}</Fold>
          {calendar}
        </Panel>

        <Panel
          id="iz-bkh"
          title="Booked"
          action={
            linksSheet ? (
              <div className="iz-r iz-bk-act">
                {bookedBar}
                <span className="iz-adm">
                  <button type="button" className="rf-lnk" id="iz-mksheet" aria-expanded={confirm === 'mk'} {...busyProps('mkcheck')} onClick={() => void openMake()}>
                    {busy === 'mkcheck' && confirm !== 'mk' ? 'Checking…' : 'Make Teams links'}
                  </button>
                </span>
              </div>
            ) : (
              (bookedBar ?? undefined)
            )
          }
        >
          {linksSheet || linksNote ? (
            <Fold open={(confirm === 'mk' && !mkInCard) || linksNote !== null}>
              {linksNote ? result('iz-lknote', linksNote) : null}
              {confirm === 'mk' && !mkInCard ? mkConfirm() : null}
            </Fold>
          ) : null}
          {ordered.length === 0 ? (
            <StateLine kind="empty">No interviews booked yet.</StateLine>
          ) : myBooked.length > 0 && otherBooked.length > 0 ? (
            <>
              <h3 className="iz-grp">Your interviews</h3>
              <ul className="iz-tickets">{myBooked.map(ticket)}</ul>
              <h3 className="iz-grp">Everyone else</h3>
              <ul className="iz-tickets">{otherBooked.map(ticket)}</ul>
            </>
          ) : (
            <ul className="iz-tickets">{ordered.map(ticket)}</ul>
          )}
        </Panel>

        {showWaiting ? (
          <Panel
            id="iz-wh"
            title="Not booked yet"
            className="iz-span"
            action={
              toRemind.length > 0 && confirm !== 'rm' ? (
                <div className="iz-r iz-adm">
                  <button type="button" className="rf-lnk" id="iz-rm" disabled={locked} onClick={() => { setConfirm('rm'); opened('#iz-rmq'); }}>
                    Remind all {toRemind.length}
                  </button>
                </div>
              ) : undefined
            }
          >
            <Fold open={confirm === 'rm' || waitNote !== null}>
              {confirm === 'rm' ? (
                <div className="iz-confirm">
                  {askWords('iz-rmq', `Send a reminder to ${toRemind.length} ${toRemind.length === 1 ? 'student' : 'students'}?`, false)}
                  <div className="iz-dact">
                    <GoButton className="rf-btn rf-btn-gold" id="iz-rmgo" {...busyProps('rm')} aria-describedby="iz-rmq" openedAt={openedAt} onGo={() => void remind(null)}>
                      <Icon name="send" />
                      <span>{busy === 'rm' ? `Sending to ${toRemind.length}…` : 'Send reminders'}</span>
                    </GoButton>
                    <button type="button" className="rf-lnk" disabled={busy === 'rm'} onClick={() => { setConfirm(null); focusNext('#iz-rm'); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                result('iz-wnote', waitNote)
              )}
            </Fold>
            <ul className="iz-wait">
              {waitList.map((w) => (
                <li key={w.id}>
                  <span className="iz-wnm">{w.name}</span>
                  <span className="iz-cd">{w.code}</span>
                  <span className="iz-wem">{w.emailed ? `Emailed ${shortDate(easternDay(w.emailed))}, ${clock(w.emailed)}` : 'Not emailed yet'}</span>
                  {w.remindedToday ? (
                    <span className="iz-wdone">Reminded today</span>
                  ) : (
                    <button type="button" className="rf-lnk" {...busyProps(`rm:${w.id}`)} aria-label={`Remind ${w.name}`} onClick={() => void remind([w.id])}>
                      {busy === `rm:${w.id}` ? 'Sending…' : 'Remind'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel
          id="iz-bh"
          title="Board"
          card={false}
          action={
            caps.rebalance || caps.pairing ? (
              <div className="iz-r iz-adm">
                {caps.rebalance ? (
                  <button type="button" className="rf-lnk" id="iz-rebal" {...busyProps('rebalcheck')} onClick={() => void rebalance()}>
                    {busy === 'rebalcheck' && !boardAsk ? 'Checking…' : 'Rebalance'}
                  </button>
                ) : null}
                {caps.pairing ? (
                  <button type="button" className="rf-lnk" id="iz-pair" {...busyProps('paircheck')} onClick={() => void pairing()}>
                    {busy === 'paircheck' && !boardAsk ? 'Checking…' : 'Re-run pairing'}
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
        >
          <Fold open={boardNote !== null || boardAsk !== null}>
            {boardAsk ? (
              <div className="iz-confirm iz-askbox">
                {askWords('iz-askq', boardAsk.text, boardAsk.changed)}
                {boardAsk.lines.length > 0 ? (
                  <ul>
                    {boardAsk.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="iz-dact">
                  {boardAsk.n > 0 ? (
                    <GoButton className="rf-btn rf-btn-gold" id="iz-askgo" {...busyProps(boardAsk.kind)} aria-describedby="iz-askq" openedAt={openedAt} onGo={() => void runAsk()}>
                      <span>
                        {busy === boardAsk.kind
                          ? boardAsk.kind === 'rebal'
                            ? `Moving ${boardAsk.n} ${boardAsk.n === 1 ? 'interview' : 'interviews'}…`
                            : `Pairing ${boardAsk.n}…`
                          : busy === 'rebalcheck' || busy === 'paircheck'
                            ? 'Checking…'
                            : boardAsk.go}
                      </span>
                    </GoButton>
                  ) : null}
                  <button type="button" className="rf-lnk" id="iz-askback" disabled={busy === 'rebal' || busy === 'pair'} onClick={() => { setBoardAsk(null); focusNext(boardAsk.kind === 'rebal' ? '#iz-rebal' : '#iz-pair'); }}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              result('iz-bnote', boardNote)
            )}
          </Fold>
          <div className="rf-pcard">
            {d.people.length > 0 ? (
              <>
                <div className="iz-colhd" aria-hidden="true">
                  <span>Free hours</span>
                  <span>Interviews{d.target ? `, target ${d.target}` : ''}</span>
                </div>
                <ul>{d.people.map(person)}</ul>
              </>
            ) : (
              <StateLine kind="empty">No board members yet.</StateLine>
            )}
          </div>
        </Panel>
      </div>
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

// The free board members of a time, drawn as dots (at most eight).
function Dots({ n }: { n: number }) {
  return (
    <span className="iz-dots" aria-hidden="true">
      {Array.from({ length: Math.min(Math.max(n, 0), 8) }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/**
 * A confirm's go button. It acts on a pointer click, or on Enter/Space key-up after a fresh key-down that began on it
 * (lib/interviews-map.ts goKey); never sooner than ARM_MS after `openedAt` (when its confirm appeared) and never on a held,
 * repeating key, so a held Enter on the button that opened the confirm cannot also confirm it. A click with no pointer (a
 * screen reader's activation) acts too, once armed.
 */
function GoButton({ openedAt, onGo, children, ...rest }: { openedAt: number; onGo: () => void; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children' | 'type'>) {
  // A key-down began on this button (armed, not repeated); and when a key-up last acted (the click a browser may add
  // right after is ignored).
  const keyDown = useRef(false);
  const keyActed = useRef(0);
  const isKey = (k: string) => k === 'Enter' || k === ' ';
  return (
    <button
      type="button"
      {...rest}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (e.detail === 0 && Date.now() - keyActed.current < 500) return;
        if (armed(openedAt, Date.now())) onGo();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        keyDown.current = goKey('down', e.repeat, keyDown.current, armed(openedAt, Date.now())) === 'wait';
      }}
      onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        const r = goKey('up', false, keyDown.current, armed(openedAt, Date.now()));
        keyDown.current = false;
        if (r !== 'go') return;
        keyActed.current = Date.now();
        onGo();
      }}
    >
      {children}
    </button>
  );
}
