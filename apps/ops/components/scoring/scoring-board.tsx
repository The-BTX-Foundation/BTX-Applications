'use client';

// Scholarships > Scoring, refreshed (Ops Hub refresh 2026-11-12; demo apps/design/ops-refresh/directions/p-scoring):
// the signed-in interviewer's queue, their score sheet (laptop: six rows with 1-5 buttons; phone: a full-screen sheet,
// one criterion at a time, then the all-six review) and the interview notes with their private notes.
//
// SENSITIVE (blind scoring): the view carries only the person's own picks; the other interviewer is a published yes/no.
// Nothing here caches a score outside React state, puts one in the URL or browser storage, or logs it. A published score
// is locked (the pick buttons are disabled and applyPick refuses); live mode has no Undo and no Nudge (LIVE_CAPS).
//
// Writes (components/scoring/scoring-writes.ts): a pick saves the draft through a per-application queue (one save in
// flight, latest wins); "Draft saved" shows only after the call returns; a refused draft stays on screen with its picks
// and the plain error. Publish asks first in live mode, runs once, and after a refusal or no answer re-reads the page
// before it can be pressed again, then says what the server holds. Private notes save when the box loses focus.
import '@/components/refresh/refresh.css';
import './scoring.css';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Fold, useFoldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { PageHeader } from '@/components/refresh/page-header';
import { clock } from '@/lib/refresh-time';
import {
  applyPick,
  canPublish,
  createSaveQueue,
  draftAfter,
  draftAnswerCounts,
  draftWords,
  editLocked,
  keepAfterRead,
  publishCheckWords,
  publishAsksFirst,
  publishFailWords,
  withLocal,
  type LocalDraft,
} from '@/lib/scoring-flow';
import { agoWord, firstName, initialsOf, nextUnscored, nextUp, ownScore, pickLabel, pickedCount, PICK_LABELS, queueStatus, titleDate, whenWords } from '@/lib/scoring-map';
import type { ScCriterion, ScSheet, ScoringView } from '@/lib/scoring-view';
import { createArm, nowMs } from '@/lib/scoring-arm';
import { claimUnsent, keepDraft, keepNote, unsentDrafts, unsentNotes } from '@/lib/scoring-unsent';
import { PUB_WHY_ID, PublishGo } from './scoring-confirm';
import { liveWrites, mockWrites, type ScWrites, type WriteOut } from './scoring-writes';

type Step = string | null; // a criterion key, 'review' (phone), or null (nothing gold)
type NoteState = { state: 'saving' | 'saved' | 'failed'; text: string };

const PHONE_Q = '(max-width: 759px)';
const NOTE_FAILED = "That note didn't save. Try again.";

// The phone layout, followed live (false on the server and the first render).
function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_Q);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return phone;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Small pieces ----------

// The six-step bar in a queue row.
function Mini({ n, total }: { n: number; total: number }) {
  return (
    <span className="sc-mini" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < n ? 'sc-on' : undefined} />
      ))}
    </span>
  );
}

// "4 Strong" with the dark number.
function Val({ v }: { v: number }) {
  return (
    <>
      <span className="sc-cv">{v}</span>
      {pickLabel(v)}
    </>
  );
}

// "Your score 4.2" and where it sits on 1 to 5.
function Mark({ v }: { v: string }) {
  const pct = ((Number(v) - 1) / 4) * 100;
  return (
    <div className="sc-mark">
      <p className="sc-mk-l">
        Your score <b>{v}</b>
      </p>
      <div className="sc-mk-t" role="img" aria-label={`${v} on a scale of 1 to 5`}>
        <span>1</span>
        <span className="sc-trk">
          <i style={{ left: `${pct}%` }} />
        </span>
        <span>5</span>
      </div>
    </div>
  );
}

// The gold done tick.
function Tick() {
  return (
    <span className="sc-tick">
      <Icon name="check" />
    </span>
  );
}

// ---------- The board ----------

export function ScoringBoard({ view, live, userId, initialCode }: { view: ScoringView; live: boolean; userId: string; initialCode?: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const phone = usePhoneLayout();
  const foldMs = useFoldMs();
  const { criteria, caps, today } = view;
  const keys = useMemo(() => criteria.map((c) => c.key), [criteria]);
  const total = criteria.length;

  // ---- Data: the server's sheets (mock mode: this device's copy), with local drafts and fresh publishes over them ----
  const [mockSheets, setMockSheets] = useState<ScSheet[]>(view.sheets);
  // A refused draft kept from an earlier board for this person (lib/scoring-unsent.ts) comes back on screen.
  claimUnsent(userId);
  const [locals, setLocals] = useState<Map<string, LocalDraft>>(() => {
    const open = new Set(view.sheets.filter((s) => !s.published).map((s) => s.applicationId));
    return new Map(
      [...unsentDrafts(userId)].filter(([id]) => open.has(id)).map(([id, d]) => [id, { picks: d.picks, state: 'failed', error: d.error, savedLabel: null }] as const),
    );
  });
  const [pubLocal, setPubLocal] = useState<Record<string, string>>({});
  const server = live ? view.sheets : mockSheets;
  const sheets = useMemo(
    () =>
      server.map((s) => {
        const x = withLocal(s, locals.get(s.applicationId));
        const at = pubLocal[s.applicationId];
        return at && !x.published ? { ...x, published: true, publishedAt: at } : x;
      }),
    [server, locals, pubLocal],
  );

  // ---- What is on screen ----
  // The sheet asked for in the address (?code=, from the interview page's "Score" link), else the first one to do.
  const firstTodo = (list: ScSheet[]) => (initialCode ? list.find((s) => s.code === initialCode) : undefined) ?? list.find((s) => !s.published) ?? list[0] ?? null;
  const stepFor = useCallback((s: ScSheet | null): Step => (!s || s.published ? null : nextUnscored(s, criteria) ?? 'review'), [criteria]);
  const [code, setCode] = useState<string | null>(() => firstTodo(view.sheets)?.code ?? null);
  const cur = sheets.find((s) => s.code === code) ?? null;
  const [step, setStep] = useState<Step>(() => stepFor(firstTodo(view.sheets)));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [enter, setEnter] = useState<'enter' | 'back'>('enter');
  const [just, setJust] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [nudge, setNudge] = useState<{ id: string; state: 'draft' | 'sending' | 'sent' } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [pubMsg, setPubMsg] = useState<{ id: string; text: string } | null>(null);
  const [checking, setChecking] = useState<{ id: string; prefix: string } | null>(null);
  const publishingRef = useRef<string | null>(null);
  const [arm] = useState(createArm);

  // ---- Private notes: the words in the box stay until saved; the last saved words per application ----
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const kept = unsentNotes(userId);
    return Object.fromEntries(view.sheets.map((s) => [s.applicationId, kept.get(s.applicationId) ?? s.note]));
  });
  const [noteState, setNoteState] = useState<Record<string, NoteState>>({});
  const [noteLast, setNoteLast] = useState<Record<string, string>>(() => Object.fromEntries(view.sheets.map((s) => [s.applicationId, s.note])));

  // ---- The one live region: each result is said once ----
  const [announce, setAnnounce] = useState('');
  const timers = useRef<Record<string, number>>({});
  const later = (name: string, fn: () => void, ms: number) => {
    window.clearTimeout(timers.current[name]);
    timers.current[name] = window.setTimeout(fn, ms);
  };
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.clearTimeout(timers.current.say);
    timers.current.say = window.setTimeout(() => setAnnounce(m), 30);
  }, []);
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach((x) => window.clearTimeout(x));
  }, []);

  // ---- Focus: moved by key after a render; never to the page body, never out of a box being typed in ----
  const rootRef = useRef<HTMLDivElement>(null);
  const focusWant = useRef<{ keys: string[]; afterWrite: boolean } | null>(null);
  const focusTo = (afterWrite: boolean, ...k: string[]) => {
    focusWant.current = { keys: k, afterWrite };
  };
  useEffect(() => {
    const want = focusWant.current;
    if (!want || !rootRef.current) return;
    focusWant.current = null;
    const active = document.activeElement as HTMLElement | null;
    if (want.afterWrite && active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
    for (const k of want.keys) {
      const el = rootRef.current.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (el && el.offsetParent !== null) {
        el.focus({ preventScroll: true });
        return;
      }
    }
  });

  // ---- Writes (made and called in handlers only) ----
  const mockClock = useRef(Date.parse(view.now));
  // The demo's ticking clock: one minute per write (mock mode).
  const stamp = () => {
    mockClock.current += 60_000;
    return new Date(mockClock.current).toISOString();
  };
  const writesNow = (): ScWrites => (live ? liveWrites : mockWrites(view.sim, () => clock(stamp())));

  // A draft save settled (the latest value for that application): saved with its clock, or refused and kept on screen.
  const settleDraft = (id: string, picks: Record<string, number>, out: WriteOut) => {
    // A late answer for a sheet now published, or being published, changes nothing and says nothing.
    if (!draftAnswerCounts(id, sheets.find((x) => x.applicationId === id), publishingRef.current)) {
      keepDraft(userId, id, null);
      setLocals((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
      return;
    }
    const d = draftAfter(picks, out);
    keepDraft(userId, id, d.state === 'failed' ? { picks, error: d.error ?? '' } : null);
    setLocals((m) => new Map(m).set(id, { ...d, savedLabel: d.savedLabel ?? m.get(id)?.savedLabel ?? null }));
    if (!live && d.state === 'saved') setMockSheets((list) => list.map((s) => (s.applicationId === id ? { ...s, picks } : s)));
    if (d.state === 'failed') say(d.error ?? '');
  };
  // A private note save settled.
  const settleNote = (id: string, text: string, out: WriteOut) => {
    if ('done' in out && out.done && out.value.ok) {
      const label = out.value.savedAt ?? clock(new Date().toISOString());
      setNoteLast((m) => ({ ...m, [id]: text }));
      if ((notes[id] ?? '') === text) keepNote(userId, id, null);
      setNoteState((m) => ({ ...m, [id]: { state: 'saved', text: `Saved ${label} · only you see this` } }));
    } else {
      const words = 'done' in out && out.done ? out.value.message || NOTE_FAILED : 'done' in out ? 'No answer in time. Reload to check.' : NOTE_FAILED;
      setNoteState((m) => ({ ...m, [id]: { state: 'failed', text: words } }));
      say(words);
    }
  };
  // The handlers the queues call, kept current after every render.
  const latest = useRef<{ writes: ScWrites; draft: typeof settleDraft; note: typeof settleNote } | null>(null);
  useEffect(() => {
    latest.current = { writes: writesNow(), draft: settleDraft, note: settleNote };
  });
  // The two save queues (per application, one in flight, latest wins), made on first use.
  const queues = useRef<{ draft: ReturnType<typeof createSaveQueue<Record<string, number>, WriteOut>>; note: ReturnType<typeof createSaveQueue<string, WriteOut>> } | null>(null);
  const getQueues = () => {
    if (!queues.current) {
      const L = () => latest.current as NonNullable<typeof latest.current>;
      queues.current = {
        draft: createSaveQueue<Record<string, number>, WriteOut>(
          (id, picks) => L().writes.save(id, picks),
          (x) => L().draft(x.id, x.value, x.result ?? { thrown: true }),
        ),
        note: createSaveQueue<string, WriteOut>(
          (id, text) => L().writes.note(id, text),
          (x) => L().note(x.id, x.value, x.result ?? { thrown: true }),
        ),
      };
    }
    return queues.current;
  };

  // ---- A fresh read (live): the server wins, except drafts still saving or refused, and notes being edited ----
  const [seenView, setSeenView] = useState(view);
  if (seenView !== view) {
    setSeenView(view);
    if (live) {
      setLocals((m) => keepAfterRead(m, view.sheets));
      for (const s of view.sheets) if (s.published) keepDraft(userId, s.applicationId, null);
      setPubLocal({});
      const next = { ...notes };
      const last = { ...noteLast };
      for (const s of view.sheets) {
        const st = noteState[s.applicationId]?.state;
        if (st !== 'saving' && st !== 'failed' && notes[s.applicationId] === noteLast[s.applicationId]) {
          next[s.applicationId] = s.note;
          last[s.applicationId] = s.note;
        }
      }
      setNotes(next);
      setNoteLast(last);
    }
  }

  // Leaving the phone layout closes the phone sheet.
  const [seenPhone, setSeenPhone] = useState(phone);
  if (seenPhone !== phone) {
    setSeenPhone(phone);
    if (!phone) setOpen(false);
  }

  // After a publish was refused or got no answer: once the re-read settles, say what the server holds, then allow
  // Publish again.
  const finishCheck = (c: { id: string; prefix: string }, published: boolean | null) => {
    const words = published === false && c.prefix ? `${c.prefix} ${publishCheckWords(false)}` : publishCheckWords(published);
    setChecking(null);
    setPublishing(null);
    publishingRef.current = null;
    setPubMsg({ id: c.id, text: words });
    say(words);
    if (published) {
      setStep(null);
      focusTo(true, 'go', 'published');
    } else focusTo(true, 'publish');
  };
  const sawRefresh = useRef(false);
  useEffect(() => {
    if (!checking || !live) return;
    if (refreshing) {
      sawRefresh.current = true;
      return;
    }
    if (!sawRefresh.current) return;
    sawRefresh.current = false;
    const s = view.sheets.find((x) => x.applicationId === checking.id);
    // The router's re-read is the outside system here; the answer lands on the next tick.
    const t = window.setTimeout(() => finishCheck(checking, s ? s.published : null), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing, checking, view]);

  // ---- Actions ----
  const savingNow = (s: ScSheet) => locals.get(s.applicationId)?.state === 'saving';
  // Picks, keys, the note box and draft saves wait while a publish is in flight or being checked.
  const locked = (s: ScSheet) => editLocked(s, publishing, checking?.id ?? null);

  // Timers that belong to the sheet on screen (the advance after a pick and its words) never land on another one.
  const clearSheetTimers = () => {
    for (const k of ['adv', 'say2', 'pop']) window.clearTimeout(timers.current[k]);
  };

  const scrollBodyTop = () => {
    const body = document.querySelector<HTMLElement>('.rf.sc .sc-ps-body');
    if (body) body.scrollTop = 0;
  };

  function pick(key: string, v: number) {
    const s = cur;
    if (!s || publishingRef.current || locked(s)) return;
    const np = applyPick(s, key, v);
    if (!np) return;
    const id = s.applicationId;
    window.clearTimeout(timers.current.adv);
    setLocals((m) => new Map(m).set(id, { picks: np, state: 'saving', error: null, savedLabel: m.get(id)?.savedLabel ?? null }));
    setPubMsg(null);
    setJust(key);
    setPop(`${key}:${v}`);
    later('pop', () => setPop(null), 300);
    getQueues().draft.push(id, np);
    const c = criteria.find((x) => x.key === key);
    say(`${c?.short ?? key}: ${v}, ${pickLabel(v)}`);
    const nx = nextUnscored({ picks: np }, criteria, key);
    const onPhone = phone;
    later(
      'adv',
      () => {
        if (onPhone) {
          setStep(nx ?? 'review');
          setQ(null);
          setEnter('enter');
          scrollBodyTop();
          focusTo(true, nx ? `seg:${nx}` : 'publish', 'rv-h', 'back');
        } else {
          setStep(nx);
          if (!nx) focusTo(true, 'publish');
          window.requestAnimationFrame(() => {
            const el = rootRef.current?.querySelector(nx ? `[data-crit="${nx}"]` : '[data-k="publish"]');
            el?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
          });
        }
        if (!nx) later('say2', () => say('All six scored. Publish when ready.'), 40);
      },
      onPhone ? 520 : 260,
    );
  }

  function retrySave() {
    if (!cur || publishingRef.current || locked(cur)) return;
    const id = cur.applicationId;
    setLocals((m) => new Map(m).set(id, { picks: cur.picks, state: 'saving', error: null, savedLabel: m.get(id)?.savedLabel ?? null }));
    getQueues().draft.push(id, cur.picks);
  }

  function goStep(k: Step, dir: 'enter' | 'back') {
    setStep(k);
    setQ(null);
    setEnter(dir);
    scrollBodyTop();
  }

  async function publish() {
    const s = cur;
    if (!s || publishingRef.current || !canPublish(s, keys, savingNow(s), false)) return;
    const id = s.applicationId;
    publishingRef.current = id;
    setPublishing(id);
    setConfirm(false);
    setPubMsg(null);
    // Focus stays on the sheet's own (aria-disabled) "Publishing…" button while the answer is on its way.
    focusTo(false, 'publish', 'rv-h');
    const out = await writesNow().publish(id, s.picks);
    if ('done' in out && out.done && out.value.ok) {
      const at = live ? new Date().toISOString() : stamp();
      if (live) {
        setPubLocal((m) => ({ ...m, [id]: at }));
        startRefresh(() => router.refresh());
      } else setMockSheets((list) => list.map((x) => (x.applicationId === id ? { ...x, picks: s.picks, published: true, publishedAt: at } : x)));
      publishingRef.current = null;
      setPublishing(null);
      setStep(null);
      setUndo(caps.undoPublish ? s.code : null);
      if (caps.undoPublish) later('undo', () => setUndo(null), 10_000);
      focusTo(true, 'go', 'published');
      if (!phone) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      else scrollBodyTop();
      const o = firstName(s.otherName);
      say(s.otherPublished ? `Published. ${o} published too.` : `Published. Your score shows once ${o} publishes.`);
      return;
    }
    // Refused or no answer: re-read before Publish can be pressed again, then say what the server holds.
    const prefix = publishFailWords(out);
    const c = { id, prefix };
    setChecking(c);
    if (live) startRefresh(() => router.refresh());
    else {
      const srv = mockSheets.find((x) => x.applicationId === id);
      finishCheck(c, srv ? srv.published : null);
    }
  }

  function undoPublish() {
    if (!cur || !caps.undoPublish) return;
    const id = cur.applicationId;
    window.clearTimeout(timers.current.undo);
    setMockSheets((list) => list.map((x) => (x.applicationId === id ? { ...x, published: false, publishedAt: null } : x)));
    setUndo(null);
    setStep(phone ? 'review' : null);
    focusTo(true, 'publish');
    say('Publish undone. Your scores are a draft again.');
  }

  function openSheet(c: string, fromQueue: boolean) {
    const s = sheets.find((x) => x.code === c) ?? null;
    clearSheetTimers();
    setCode(c);
    setQ(null);
    setConfirm(false);
    setStep(stepFor(s));
    setEnter('enter');
    scrollBodyTop();
    if (phone) {
      setOpen(true);
      focusTo(false, 'back');
    } else if (!fromQueue) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function closeSheet() {
    clearSheetTimers();
    setOpen(false);
    setConfirm(false);
    focusTo(false, `q:${code}`);
  }

  function sendNudge(id: string, name: string) {
    if (!caps.nudge) return;
    setNudge({ id, state: 'sending' });
    later(
      'nudge',
      () => {
        setNudge({ id, state: 'sent' });
        say(`Nudge sent to ${name}`);
      },
      450 + foldMs,
    );
  }

  function noteBlur(id: string) {
    if (publishingRef.current || checking) return;
    const text = notes[id] ?? '';
    if (text === (noteLast[id] ?? '') && noteState[id]?.state !== 'failed') return;
    setNoteState((m) => ({ ...m, [id]: { state: 'saving', text: 'Saving…' } }));
    getQueues().note.push(id, text);
  }

  // ---- Keys: 1 to 5 score the gold row; Esc closes the phone sheet ----
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && open) {
      closeSheet();
      return;
    }
    if (/^[1-5]$/.test(e.key) && cur && !locked(cur) && !publishingRef.current && step && step !== 'review' && (!phone || open)) {
      e.preventDefault();
      pick(step, Number(e.key));
    }
  };
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = onKey;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // A refused draft or note words not saved yet: the browser asks before the tab closes or reloads.
  const unsaved = [...locals.values()].some((d) => d.state !== 'saved') || Object.keys(notes).some((id) => (notes[id] ?? '') !== (noteLast[id] ?? ''));
  useEffect(() => {
    if (!unsaved) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  // The phone sheet holds the page still behind it.
  const sheetOpen = phone && open;
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const sheetRef = useRef<HTMLElement>(null);
  const trapTab = (e: RKeyboardEvent) => {
    if (!sheetOpen || e.key !== 'Tab' || !sheetRef.current) return;
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

  // ---------- Drawing ----------

  const todo = sheets.filter((s) => !s.published);
  const done = sheets.filter((s) => s.published);
  const nu = nextUp(sheets, criteria, view.due);

  const questionsBtn = (c: ScCriterion) => {
    if (view.questionsFailed) return <span>Questions didn&apos;t load</span>;
    const n = c.questions.length;
    if (!n) return null;
    return (
      <button type="button" className="rf-lnk" data-k={`q:${c.key}`} aria-expanded={q === c.key} aria-controls={`sc-qf-${c.key}`} onClick={() => setQ((x) => (x === c.key ? null : c.key))}>
        {n === 1 ? 'Question' : `Questions (${n})`}
        <Icon name="down" />
      </button>
    );
  };
  const questionsFold = (c: ScCriterion) =>
    c.questions.length && !view.questionsFailed ? (
      <Fold open={q === c.key} id={`sc-qf-${c.key}`}>
        <ol className="sc-qs">
          {c.questions.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </Fold>
    ) : null;

  const subLine = (c: ScCriterion) => `${c.weight} points${c.avg ? ` · cycle avg ${c.avg}` : ''}`;

  const scale = (s: ScSheet, c: ScCriterion) => (
    <div className="sc-scale" role="group" aria-label={`Score for ${c.name}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`sc-sb${pop === `${c.key}:${n}` ? ' sc-pop' : ''}`}
          data-k={`p:${s.code}:${c.key}:${n}`}
          aria-pressed={s.picks[c.key] === n}
          title={`${n} ${PICK_LABELS[n - 1]}`}
          aria-label={`${n}, ${PICK_LABELS[n - 1]}`}
          disabled={s.published}
          aria-disabled={!s.published && locked(s) ? true : undefined}
          onClick={() => pick(c.key, n)}
        >
          {n}
        </button>
      ))}
    </div>
  );

  function queueRow(s: ScSheet) {
    const n = pickedCount(s, criteria);
    const on = !phone && code === s.code;
    const score = s.published ? ownScore(s, criteria) : null;
    const o = firstName(s.otherName);
    const nd = nudge?.id === s.applicationId ? nudge : null;
    return (
      <li key={s.applicationId} className="sc-qi">
        <button type="button" className="sc-qr" data-k={`q:${s.code}`} aria-current={on ? 'true' : undefined} onClick={() => openSheet(s.code, true)}>
          {score ? (
            <span className="sc-kt sc-num" aria-hidden="true">
              {score}
            </span>
          ) : (
            <span className={`sc-kt${n ? ' sc-mine' : ''}`} aria-hidden="true">
              {initialsOf(s.name)}
            </span>
          )}
          <span className="sc-qmain">
            {score ? <span className="rf-sr">Your score {score}. </span> : null}
            <span className="sc-qn">
              <b>{s.name}</b>
              <span className="sc-cd rf-nowrap">{s.code}</span>
              {s.test ? <span className="sc-tag">Board test</span> : null}
            </span>
            <span className="sc-qm">
              {s.published ? null : <Mini n={n} total={total} />}
              <span>{queueStatus(s, criteria)}</span>
            </span>
          </span>
          <Icon name="chev" className="sc-chv" />
        </button>
        {s.published && !s.otherPublished ? (
          <div className="sc-qx">
            {nd?.state === 'sent' ? (
              <div className="sc-waitbar sc-done">
                <span className="sc-nudged">
                  <Icon name="check" />
                  Nudged {o} just now
                </span>
              </div>
            ) : (
              <div className="sc-waitbar">
                <span className="sc-wt">
                  <Icon name="clock" />
                  <span>
                    Waiting on <span className="rf-nowrap">{s.otherName}</span>
                  </span>
                </span>
                {caps.nudge ? (
                  <button
                    type="button"
                    className="sc-nudge"
                    data-k="nudge"
                    aria-expanded={nd?.state === 'draft' || nd?.state === 'sending'}
                    aria-controls="sc-nd"
                    onClick={() => {
                      const opening = !(nd && nd.state !== 'sent');
                      setNudge(opening ? { id: s.applicationId, state: 'draft' } : null);
                      if (opening) later('nfocus', () => rootRef.current?.querySelector<HTMLElement>('[data-k="nsend"]')?.focus({ preventScroll: true }), 30);
                    }}
                  >
                    Nudge {o}
                  </button>
                ) : null}
              </div>
            )}
            {caps.nudge && nd?.state !== 'sent' ? (
              <Fold open={nd?.state === 'draft' || nd?.state === 'sending'} id="sc-nd">
                <div className="sc-draft">
                  <span className="sc-dl">
                    To <span className="rf-nowrap">{s.otherName}</span> in Board chat
                  </span>
                  <p className="sc-dtext">
                    Hi {o}, I published my score for <span className="rf-nowrap">{s.name}</span>. Could you publish yours when you get a chance?
                  </p>
                  <div className="sc-dact">
                    <button type="button" className="rf-btn" data-k="nsend" disabled={nd?.state === 'sending'} onClick={() => sendNudge(s.applicationId, s.otherName)}>
                      <Icon name="send" />
                      <span>{nd?.state === 'sending' ? 'Sending…' : 'Send'}</span>
                    </button>
                    <button
                      type="button"
                      className="rf-lnk"
                      onClick={() => {
                        setNudge(null);
                        focusTo(false, 'nudge');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </Fold>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  function notesBody(s: ScSheet, where: 'l' | 'p') {
    const id = s.applicationId;
    const ns = noteState[id];
    return (
      <>
        {view.notesFailed ? (
          <p className="sc-nb sc-mut">Interview notes didn&apos;t load. Reload to try again.</p>
        ) : s.summary ? (
          <p className="sc-nb">{s.summary}</p>
        ) : (
          <p className="sc-nb sc-mut">Interview notes show here once they&apos;re written.</p>
        )}
        {where === 'l'
          ? s.quotes.map((qt, i) => (
              <figure key={i} className="sc-quote">
                <figcaption>
                  <Icon name="video" />
                  <b>{qt.label}</b>
                  <span>{qt.at}</span>
                </figcaption>
                <blockquote>{qt.text}</blockquote>
              </figure>
            ))
          : null}
        {/* The interviewers' notes from the interview's page, by question, read only. */}
        {view.ivNotesFailed ? (
          <p className="sc-nb sc-mut">Notes by question didn&apos;t load. Reload to try again.</p>
        ) : s.ivNotes && s.ivNotes.length ? (
          <div className="sc-ivn">
            <h3>Notes by question</h3>
            <ul>
              {s.ivNotes.map((g) => (
                <li key={g.label}>
                  <p className="sc-ivn-q">{g.label}</p>
                  {g.notes.map((n, i) => (
                    <p key={i} className="sc-ivn-n">
                      <b>{n.name}</b> {n.body}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="sc-pn">
          <label htmlFor={`sc-pn-${where}`}>Your private notes</label>
          <textarea
            id={`sc-pn-${where}`}
            data-k="note"
            placeholder="Add a note only you can see"
            maxLength={10000}
            value={notes[id] ?? ''}
            readOnly={publishing !== null || checking !== null}
            onChange={(e) => {
              const v = e.target.value;
              setNotes((m) => ({ ...m, [id]: v }));
              keepNote(userId, id, v === (noteLast[id] ?? '') ? null : v);
            }}
            onBlur={() => noteBlur(id)}
          />
          <p className={`sc-pn-s${ns?.state === 'failed' ? ' sc-bad' : ''}`}>{ns?.text ?? ''}</p>
        </div>
      </>
    );
  }

  function criterionRow(s: ScSheet, c: ScCriterion) {
    const v = s.picks[c.key];
    const here = !s.published && step === c.key;
    return (
      <div key={c.key} className={`sc-cr${here ? ' sc-cur' : ''}`} data-crit={c.key}>
        <div className="sc-cr-top">
          <span className="sc-cr-n">{c.name}</span>
          <span key={just === c.key ? `j${v}` : 'v'} className={`sc-cr-v${just === c.key ? ' sc-new' : ''}`}>
            {v ? <Val v={v} /> : <span className="sc-mut">{here ? 'Up next' : 'Not scored'}</span>}
          </span>
        </div>
        <div className="sc-cr-sub">
          <span>{subLine(c)}</span>
          {questionsBtn(c)}
        </div>
        {scale(s, c)}
        {questionsFold(c)}
      </div>
    );
  }

  function oneCriterion(s: ScSheet, c: ScCriterion) {
    const i = criteria.indexOf(c);
    const v = s.picks[c.key];
    const quote = s.quotes.find((x) => x.key === c.key);
    return (
      <section key={c.key} className={`sc-one sc-${enter}`} aria-labelledby="sc-one-h">
        <p className="sc-one-k">
          {i + 1} of {total}
        </p>
        <h3 className="sc-one-n" id="sc-one-h">
          {c.name}
        </h3>
        <p className="sc-one-s">{subLine(c)}</p>
        {scale(s, c)}
        <div className="sc-anch" aria-hidden="true">
          <span>1 Not evident</span>
          <span>5 Exceptional</span>
        </div>
        <p key={just === c.key ? `j${v}` : 'v'} className={`sc-chosen${just === c.key ? ' sc-new' : ''}`}>
          {v ? <Val v={v} /> : <span className="sc-mut">Not scored yet</span>}
        </p>
        {quote ? (
          <figure className="sc-quote">
            <figcaption>
              <Icon name="video" />
              <span>From the interview, {quote.at}</span>
            </figcaption>
            <blockquote>{quote.text}</blockquote>
          </figure>
        ) : null}
        <div className="sc-one-q">
          {questionsBtn(c)}
        </div>
        {questionsFold(c)}
        <div className="sc-one-nav">
          <button type="button" className="rf-lnk" data-k="prev" style={i === 0 ? { visibility: 'hidden' } : undefined} onClick={() => i > 0 && goStep(criteria[i - 1].key, 'back')}>
            <Icon name="back" />
            Back
          </button>
          <button
            type="button"
            className="rf-lnk"
            data-k="next"
            onClick={() => {
              if (i < total - 1) goStep(criteria[i + 1].key, 'enter');
              else goStep(pickedCount(s, criteria) === total ? 'review' : nextUnscored(s, criteria), 'enter');
            }}
          >
            {v ? 'Next' : 'Skip for now'}
            <Icon name="chev" />
          </button>
        </div>
      </section>
    );
  }

  function review(s: ScSheet) {
    const ro = s.published;
    const score = ownScore(s, criteria);
    return (
      <section className="sc-rv" aria-labelledby="sc-rv-h">
        <h3 className="sc-rv-h" id="sc-rv-h" data-k="rv-h" tabIndex={-1}>
          {ro ? 'Your scores' : `All ${total === 6 ? 'six' : total} scored`}
        </h3>
        {ro ? <div style={{ height: 12 }} /> : <p className="sc-rv-s">Tap one to change it.</p>}
        <ul>
          {criteria.map((c) => {
            const v = s.picks[c.key];
            const inner = (
              <>
                <span className="sc-rv-n">{c.short}</span>
                <span className="sc-rv-v">{v ? <Val v={v} /> : <span className="sc-mut">Not scored</span>}</span>
              </>
            );
            return (
              <li key={c.key}>
                {ro ? (
                  <div className="sc-rv-r">{inner}</div>
                ) : (
                  <button type="button" className="sc-rv-r" data-k={`rv:${c.key}`} onClick={() => goStep(c.key, 'back')}>
                    {inner}
                    <span className="rf-sr"> Change</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!ro && score ? <Mark v={score} /> : null}
      </section>
    );
  }

  function after(s: ScSheet) {
    const o = firstName(s.otherName);
    const line = s.otherPublished ? `${o} published too, so you both see both scores now.` : `Your score shows once ${o} publishes.`;
    const score = ownScore(s, criteria);
    return (
      <div className="sc-after">
        <p className="sc-af-l">
          <Tick />
          <b data-k="published" tabIndex={-1}>
            Published{s.publishedAt ? ` ${whenWords(today, s.publishedAt)}` : ''}
          </b>
          {caps.undoPublish && undo === s.code ? (
            <button type="button" className="rf-lnk" data-k="undo" onClick={undoPublish}>
              Undo
            </button>
          ) : null}
        </p>
        <p className="sc-af-x">{line}</p>
        {score ? <Mark v={score} /> : null}
      </div>
    );
  }

  function foot(s: ScSheet) {
    const n = pickedCount(s, criteria);
    if (s.published) {
      const i = sheets.indexOf(s);
      const nx = [...sheets.slice(i + 1), ...sheets.slice(0, i)].find((t) => !t.published) ?? null;
      return (
        <div className="sc-foot">
          <span className="sc-saved">{todo.length ? `${todo.length} left to score` : 'Nothing left to score'}</span>
          {nx ? (
            <button type="button" className="rf-btn rf-btn-gold sc-in" data-k="go" onClick={() => openSheet(nx.code, false)}>
              <span>
                Score <span className="rf-nowrap">{nx.name}</span>
              </span>
              <Icon name="chev" />
            </button>
          ) : null}
        </div>
      );
    }
    const local = locals.get(s.applicationId);
    const busyPub = publishing === s.applicationId;
    const isChecking = checking?.id === s.applicationId;
    const msg = pubMsg?.id === s.applicationId ? pubMsg.text : null;
    const saving = savingNow(s);
    let left;
    if (isChecking) left = <span className="sc-saved sc-saving">Checking what saved…</span>;
    else if (confirm && !busyPub)
      left = (
        <span className="sc-saved sc-saving" id={PUB_WHY_ID} data-k="pub-why" tabIndex={-1}>
          Publishing locks your score. You can&apos;t change it after.
        </span>
      );
    else if (local?.state === 'failed')
      left = (
        <span className="sc-saved sc-bad">
          {local.error}{' '}
          <button type="button" className="rf-lnk" data-k="retry" onClick={retrySave}>
            Try again
          </button>
        </span>
      );
    else if (msg) left = <span className="sc-saved sc-bad">{msg}</span>;
    else left = <span className={`sc-saved${local?.state === 'saving' ? ' sc-saving' : ''}`}>{draftWords(local, s.savedAt ? whenWords(today, s.savedAt) : null)}</span>;
    let right;
    if (n < total) right = <span className="sc-togo">{total - n} to go</span>;
    else if (confirm && !busyPub && !isChecking)
      right = (
        <span className="sc-confirm">
          <button
            type="button"
            className="rf-lnk"
            data-k="pub-no"
            onClick={() => {
              setConfirm(false);
              focusTo(false, 'publish');
            }}
          >
            Cancel
          </button>
          <PublishGo arm={arm} onGo={() => void publish()} />
        </span>
      );
    else {
      const blocked = busyPub || isChecking || saving;
      right = (
        <button
          type="button"
          className="rf-btn rf-btn-gold sc-in"
          data-k="publish"
          aria-disabled={blocked || undefined}
          onClick={() => {
            if (blocked) return;
            if (!publishAsksFirst(caps)) void publish();
            else {
              arm.open(nowMs());
              setConfirm(true);
              focusTo(false, 'pub-why');
            }
          }}
        >
          {busyPub || isChecking ? 'Publishing…' : 'Publish score'}
        </button>
      );
    }
    return (
      <div className="sc-foot">
        {left}
        {right}
      </div>
    );
  }

  function sheet(s: ScSheet) {
    const n = pickedCount(s, criteria);
    const crit = step && step !== 'review' ? criteria.find((c) => c.key === step) : undefined;
    return (
      <>
        <header className="sc-ps-head">
          <button type="button" className="sc-iconbtn" data-k="back" aria-label="Back to your queue" onClick={closeSheet}>
            <Icon name="back" />
          </button>
          <div className="sc-ps-t" id="sc-ps-t">
            <b>{s.name}</b>
            <span className="sc-cd rf-nowrap">{s.code}</span>
          </div>
          <span />
        </header>
        <div className="sc-ps-body">
          <div className="sc-sh-top">
            <h2 className="sc-sh-name">
              <span>{s.name}</span>
              <span className="sc-cd rf-nowrap">{s.code}</span>
            </h2>
            {s.interviewDay || s.minutes ? (
              <ul className="sc-sh-meta" aria-label="Interview">
                {s.interviewDay ? <li>Interviewed {agoWord(today, s.interviewDay)}</li> : null}
                {s.minutes ? <li>{s.minutes} min</li> : null}
              </ul>
            ) : null}
            <ul className="sc-pair" aria-label="Who has published">
              <li>
                {s.published ? <Tick /> : <span className="sc-dot" />}
                You<span>{s.published ? 'published' : 'draft'}</span>
              </li>
              <li>
                {s.otherPublished ? <Tick /> : <span className="sc-dot" />}
                <span className="rf-nowrap">{s.otherName}</span>
                <span>{s.otherPublished ? 'published' : 'not yet'}</span>
              </li>
              {s.published ? null : <li className="sc-rule">Private until both publish</li>}
            </ul>
            <div className="sc-prog">
              {phone && !s.published ? (
                <div className="sc-segb" role="group" aria-label="Criteria">
                  {criteria.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`sc-seg${s.picks[c.key] ? ' sc-on' : ''}${step === c.key ? ' sc-at' : ''}`}
                      data-k={`seg:${c.key}`}
                      aria-label={`${c.name}${s.picks[c.key] ? `, ${s.picks[c.key]}` : ', not scored'}`}
                      aria-current={step === c.key ? 'step' : undefined}
                      onClick={() => goStep(c.key, criteria.findIndex((x) => x.key === c.key) < criteria.findIndex((x) => x.key === step) ? 'back' : 'enter')}
                    />
                  ))}
                </div>
              ) : (
                <div className="sc-bar" role="img" aria-label={`${n} of ${total} scored`}>
                  {criteria.map((c) => (
                    <span key={c.key} className={s.picks[c.key] ? 'sc-on' : undefined} />
                  ))}
                </div>
              )}
              <span className="sc-pl">
                <b>
                  {n} of {total}
                </b>{' '}
                scored
              </span>
            </div>
            {phone ? null : (
              <p className="sc-legend">
                {PICK_LABELS.map((l, i) => (
                  <span key={l}>
                    <b>{i + 1}</b> {l}
                  </span>
                ))}
                {s.published ? null : (
                  <span className="sc-kh">
                    <span className="sc-kbd">1</span>to<span className="sc-kbd">5</span>scores the gold row
                  </span>
                )}
              </p>
            )}
          </div>
          {s.published ? after(s) : null}
          {phone ? (
            <>
              {s.published || step === 'review' || !crit ? review(s) : oneCriterion(s, crit)}
              <div className="sc-ps-notes">
                <div className="sc-ph">
                  <h2>Interview notes</h2>
                </div>
                {notesBody(s, 'p')}
              </div>
            </>
          ) : (
            <div className="sc-crs">{criteria.map((c) => criterionRow(s, c))}</div>
          )}
        </div>
        {foot(s)}
      </>
    );
  }

  return (
    <div className="rf sc" ref={rootRef}>
      <PageHeader title="Scoring" date={titleDate(today)} search={false}>
        {nu ? <NewsCard icon="task" gold kicker={nu.kicker} title={nu.sheet.name} go={nu.go} onClick={() => openSheet(nu.sheet.code, false)} /> : null}
      </PageHeader>
      <div className="sc-board">
        <section className="sc-qp" aria-labelledby="sc-qh">
          <div className="sc-ph">
            <h2 id="sc-qh">Your queue</h2>
          </div>
          <div className="sc-pcard">
            {todo.length ? <ul>{todo.map(queueRow)}</ul> : <p className="sc-none">Nothing left to score. New interviews land here once they end.</p>}
            {done.length ? (
              <>
                <div className="sc-grp">Published</div>
                <ul>{done.map(queueRow)}</ul>
              </>
            ) : null}
          </div>
        </section>
        <section
          ref={sheetRef}
          className={`sc-panel sc-sheet${sheetOpen ? ' sc-open' : ''}`}
          aria-label={sheetOpen ? undefined : 'Score sheet'}
          role={sheetOpen ? 'dialog' : undefined}
          aria-modal={sheetOpen || undefined}
          aria-labelledby={sheetOpen ? 'sc-ps-t' : undefined}
          onKeyDown={trapTab}
        >
          {cur ? sheet(cur) : <p className="sc-none sc-first">No interviews to score yet. They land here once they end.</p>}
        </section>
        <aside className="sc-notes" aria-labelledby="sc-nh">
          <div className="sc-ph">
            <h2 id="sc-nh">Interview notes</h2>
          </div>
          <div className="sc-pcard">{cur && !phone ? notesBody(cur, 'l') : null}</div>
        </aside>
      </div>
      <div className="rf-sr" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
