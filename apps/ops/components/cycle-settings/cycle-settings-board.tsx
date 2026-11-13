'use client';

// Cycle settings (Ops Hub refresh 2026-11-12, demo p-cycle-settings): one setting edited at a time in place, with
// "Saved 9:14 AM · Undo"; a confirm ("students will see…") before money or a student-facing date changes on a published
// cycle (Undo of those asks too); the dates drawn on a line; the requirements edited, removed and added in place; the
// Portal landing preview; the publish checklist on a draft. Mock mode changes its own copy like the demo. Live mode sends
// each change to the admin-only server action (cycle-settings-writes.ts), shows "Saving…" and settles on the server's
// answer: the saved row on success, the error in the editor on failure, then a refresh so the server's values win.
// A write's answer only touches its own row (another row's open editor keeps its words). Undo shows only while the row
// still holds the value that save wrote. The confirms' gold buttons are armed (lib/cycle-settings-arm.ts).
import '@/components/refresh/refresh.css';
import './cycle-settings-page.css';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { clockName, easternToIso, LIMITS, MONTHS, parseAmountCents, rowToForm, type CycleForm } from '@/lib/cycle-settings';
import { createArm, nowMs } from '@/lib/cycle-settings-arm';
import { patchProblem, unchanged, type CyclePatch } from '@/lib/cycle-settings-merge';
import {
  amountField,
  capsFor,
  confirmLabel,
  confirmWhat,
  confirmWho,
  CONFIRM,
  dateLine,
  display,
  FORM_KEYS,
  hasOpened,
  KIND_ICON,
  LABEL,
  missingRows,
  money,
  pick,
  relOf,
  rowError,
  SECTIONS,
  SEEN,
  undoable,
  type RowKey,
  type SaveKey,
} from '@/lib/cycle-settings-rows';
import type { CycleSettingsView } from '@/lib/cycle-settings-view';
import { clock, shortDate } from '@/lib/refresh-time';
import { CzHead, CzSkelBody } from './cycle-settings-skeleton';
import { publishLive, saveFieldsLive, unpublishLive } from './cycle-settings-writes';

type Props = { view: CycleSettingsView; live: boolean };

/** "Saved 9:14 AM · Undo" under a row (`old` is what Undo puts back, `saved` what that save wrote), or "Undone 9:15 AM". */
type After = { t: string; old?: CyclePatch; saved?: CyclePatch; undone?: boolean };

const BLANK: CycleForm = rowToForm({
  id: '',
  term: '',
  status: '',
  award_name: null,
  award_amount_cents: null,
  opens_at: null,
  closes_at: null,
  interview_start: null,
  interview_end: null,
  decision_date: null,
  next_cycle_month: null,
  requirements: [],
  photo_due: null,
  payment_note: null,
  event_enabled: false,
  event_at: null,
});

// Set by "Try again", read once the retried page has drawn (survives mock mode's remount).
const retryFocus = { pending: false };

// The editor's starting values for a row (the amount as typed, "2,500").
function editorStart(form: CycleForm, k: SaveKey): CyclePatch {
  const p = pick(form, k);
  if (k === 'amount') p.amount = amountField(parseAmountCents(form.amount));
  return p;
}

export function CycleSettingsBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, startRefresh] = useTransition();
  const [retrying, startRetry] = useTransition();
  const cycle = view.cycle;

  // The page's own copy of the settings and status (mock mode changes it; live mode takes the server's answers).
  const [form, setForm] = useState<CycleForm>(() => (cycle ? rowToForm(cycle) : BLANK));
  const [status, setStatus] = useState(cycle?.status ?? '');
  // Which write is waiting for the server (live only); every write control is off meanwhile.
  const [busy, setBusy] = useState<string | null>(null);
  // A settled live refresh brings the server's values: take them in, unless a write is still out (re-seeded after it).
  const [seen, setSeen] = useState(view);
  if (live && seen !== view && !busy && !refreshing) {
    setSeen(view);
    setForm(view.cycle ? rowToForm(view.cycle) : BLANK);
    setStatus(view.cycle?.status ?? '');
  }

  const [edit, setEdit] = useState<RowKey | null>(null);
  const [draft, setDraft] = useState<CyclePatch>({});
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SaveKey | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [after, setAfter] = useState<Partial<Record<SaveKey, After>>>({});
  const [fresh, setFresh] = useState<{ k: SaveKey; n: number } | null>(null);
  const [news, setNews] = useState<SaveKey | null>(null);
  const [reqEdit, setReqEdit] = useState<number | null>(null);
  const [reqText, setReqText] = useState('');
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [reqAfter, setReqAfter] = useState<{ i: number; t: string; old: string[]; saved: string[] } | null>(null);
  const [removed, setRemoved] = useState<{ text: string; old: string[]; saved: string[]; t: string } | null>(null);
  const [reqFresh, setReqFresh] = useState<{ i: number; n: number } | null>(null);
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [pub, setPub] = useState(false);
  const [unpub, setUnpub] = useState(false);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  // A failed write with no editor open (the event switch, an Undo) shows its line under the row.
  const [rowErr, setRowErr] = useState<{ k: SaveKey; m: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  // The moment the open confirm appeared (its deadline sentence compares against it).
  const [shownAt, setShownAt] = useState(0);
  const flashN = useRef(0);
  const minute = useRef(14);
  const focusSel = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  // The open editor, read by a write's answer when it comes back (its own row only).
  const editRef = useRef<RowKey | null>(null);
  const [arm] = useState(createArm);

  const opened = hasOpened(easternToIso(form.opensDate, form.opensTime || '00:00'), Date.parse(view.now));
  const caps = capsFor(view.caps.edit, status, view.applications, opened);
  const published = status === 'published';
  const term = cycle?.term ?? '';
  const missing = missingRows(form);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useLayoutEffect(() => {
    editRef.current = edit;
  }, [edit]);

  // Moves focus where the last action asked for it, after the render that drew the target (never to the body: a missing
  // target falls back to the page title).
  useLayoutEffect(() => {
    const sel = focusSel.current;
    if (!sel) return;
    focusSel.current = null;
    const el = rootRef.current?.querySelector<HTMLElement>(sel) ?? document.getElementById('cz-h1');
    el?.focus({ preventScroll: true });
  });

  // After "Try again" settles, focus lands on the page title (or Try again if it failed again).
  useEffect(() => {
    if (!retryFocus.pending || retrying) return;
    retryFocus.pending = false;
    const el = (view.loadFailed ? rootRef.current?.querySelector<HTMLElement>('.cz-load-err .rf-btn') : null) ?? document.getElementById('cz-h1');
    el?.focus({ preventScroll: true });
  });

  // The one polite announcement (cleared first, so the same words are read again).
  const say = (m: string) => {
    setAnnounce('');
    timers.current.push(window.setTimeout(() => setAnnounce(m), 30));
  };
  // The time of a save: the demo's clock in mock mode (9:14 AM, then a minute later each time), the real one live.
  const now = () => (live ? clock(new Date().toISOString()) : `9:${String(minute.current++).padStart(2, '0')} AM`);
  const flash = (k: SaveKey) => setFresh({ k, n: (flashN.current += 1) });
  // True while the person is typing in a field (a write's answer then leaves focus where it is).
  const typing = () => {
    const a = document.activeElement;
    return !!a && !!rootRef.current?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  };
  // The moment a confirm opens: its words get focus, its gold button arms after a moment.
  const openConfirm = (sel: string) => {
    arm.open(nowMs());
    setShownAt(live ? nowMs() : Date.parse(view.now));
    focusSel.current = sel;
  };
  // A confirm's gold button (data-go names it) acts only once armed (see lib/cycle-settings-arm.ts).
  const goClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (arm.click(nowMs())) goAct(e.currentTarget.dataset.go ?? '');
    else e.currentTarget.focus();
  };
  const goDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!arm.keyDown(e.currentTarget.dataset.go ?? '', e.key, e.repeat)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const goUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    const id = e.currentTarget.dataset.go ?? '';
    const r = arm.keyUp(id, e.key, nowMs());
    if (!r.handled) return;
    e.preventDefault();
    if (r.act) goAct(id);
  };
  // Asks the server for the page again (live): its values replace the page's once it settles.
  const refresh = () => startRefresh(() => router.refresh());

  const retry = () =>
    startRetry(() => {
      retryFocus.pending = true;
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // ---------- one row at a time ----------

  const closeAll = () => {
    setEdit(null);
    setErr(null);
    setConfirm(null);
    setUndoing(false);
    setReqEdit(null);
    setAdding(false);
    setReqErr(null);
  };

  const openEdit = (k: RowKey) => {
    closeAll();
    setEdit(k);
    setDraft(editorStart(form, k));
    focusSel.current = '#cz-ed-a';
    timers.current.push(window.setTimeout(() => document.getElementById(`cz-row-${k}`)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 0));
  };

  const closeEdit = (k: RowKey) => {
    setEdit(null);
    setErr(null);
    setConfirm(null);
    setUndoing(false);
    focusSel.current = `[data-k="edit:${k}"]`;
  };

  // The editor's values as a patch (only the row's own fields).
  const draftPatch = (k: SaveKey): CyclePatch => Object.fromEntries(FORM_KEYS[k].map((p) => [p, draft[p] ?? form[p]])) as CyclePatch;

  // Sends a change of row `k` (mock: at once; live: to the server, "Saving…" until it answers). `undo` marks an Undo, and
  // `before` is what the server must still hold (an Undo: the value its save wrote). The answer only touches row `k`: an
  // editor open on another row keeps its words, and an error shows in `k`'s editor or under `k`.
  const apply = async (k: SaveKey, next: CyclePatch, undo = false, before?: CyclePatch) => {
    const old = pick(form, k);
    const mine = () => editRef.current === k;
    const done = (saved: CycleForm) => {
      setForm(saved);
      if (mine()) {
        setEdit(null);
        setConfirm(null);
        setUndoing(false);
        setErr(null);
      }
      const t = now();
      const wrote = pick(saved, k);
      setAfter((a) => ({ ...a, [k]: undo ? { t, undone: true } : { t, old, saved: wrote } }));
      flash(k);
      setNews(!undo && published && SEEN.has(k) ? k : null);
      if (k === 'event') {
        focusSel.current = `[data-k="ev:${next.eventEnabled ? 1 : 0}"]`;
        say(undo ? `${LABEL[k]} change undone.` : `Meet-the-board event ${next.eventEnabled ? 'on' : 'off'}. Undo is available.`);
      } else {
        focusSel.current = undo ? `[data-k="edit:${k}"]` : `[data-k="undo:${k}"]`;
        say(undo ? `${LABEL[k]} change undone.` : `${LABEL[k]} saved. Undo is available.`);
      }
    };
    if (!live || !cycle) {
      done({ ...form, ...next });
      return;
    }
    setBusy(k);
    const r = await saveFieldsLive(cycle.id, next, before ?? old);
    setBusy(null);
    if (r.ok) {
      setStatus(r.row.status);
      done(rowToForm(r.row));
    } else {
      const m = rowError(k, r.errors, r.message);
      const stay = typing();
      if (k !== 'event' && mine()) {
        // The row's own editor is open: the error shows there (focus stays in a field being typed in).
        setErr(m);
        setConfirm(null);
        if (!stay) focusSel.current = '#cz-ed-a';
      } else {
        // No editor of its own (the event switch, an Undo): the row's own error line. Another row's editor is left alone.
        setRowErr({ k, m });
        if (!stay) focusSel.current = k === 'event' ? `[data-k="ev:${form.eventEnabled ? 1 : 0}"]` : `[data-k="undo:${k}"]`;
      }
      say(m);
    }
    refresh();
  };

  // "Save": the row's own check first, then (published money or dates) the confirm, then the write.
  const save = (k: RowKey) => {
    if (busy) return;
    const next = draftPatch(k);
    const problem = patchProblem(form, next, status);
    setRowErr(null);
    if (problem) {
      const m = rowError(k, problem.errors, problem.message);
      setErr(m);
      focusSel.current = '#cz-ed-a';
      say(m);
      return;
    }
    setErr(null);
    if (unchanged(form, next)) {
      closeEdit(k);
      return;
    }
    if (published && CONFIRM.has(k) && confirm !== k) {
      setConfirm(k);
      openConfirm(`#cz-cf-${k}`);
      say(confirmWho(term, view.applications));
      return;
    }
    void apply(k, next, undoing, undoing ? after[k]?.saved : undefined);
  };

  // "Undo": puts the earlier value back. On a published cycle, money and dates ask first (the editor opens at the confirm).
  const undo = (k: SaveKey) => {
    if (busy) return;
    const a = after[k];
    if (!a?.old || !undoable(form, a.saved)) return;
    setRowErr(null);
    if (published && CONFIRM.has(k) && k !== 'reqs' && k !== 'event') {
      closeAll();
      setEdit(k as RowKey);
      setDraft(k === 'amount' ? { amount: amountField(parseAmountCents(a.old.amount ?? '')) } : a.old);
      setUndoing(true);
      setConfirm(k);
      openConfirm(`#cz-cf-${k}`);
      say(confirmWho(term, view.applications));
      return;
    }
    void apply(k, a.old, true, a.saved);
  };

  // The event's On / Off switch saves at once (no editor).
  const setEvent = (on: boolean) => {
    if (busy || on === form.eventEnabled) return;
    setRowErr(null);
    void apply('event', { eventEnabled: on });
  };

  // ---------- requirements ----------

  const reqs = form.requirements;

  // Sends a new requirements list. `what` says which "after" line to draw.
  // An Undo passes `before`: the list its save wrote (the server refuses if the list changed since).
  const commitReqs = async (next: string[], what: { kind: 'edit' | 'add'; i: number } | { kind: 'remove'; text: string } | { kind: 'undo' | 'restore' }, before?: string[]) => {
    const old = [...reqs];
    const problem = patchProblem(form, { requirements: next }, status);
    if (problem) {
      const m = rowError('reqs', problem.errors, problem.message);
      setReqErr(m);
      say(m);
      return;
    }
    const done = (saved: CycleForm) => {
      setForm(saved);
      setReqErr(null);
      setReqEdit(null);
      setNews(published && (what.kind === 'edit' || what.kind === 'add' || what.kind === 'remove') ? 'reqs' : null);
      const wrote = [...saved.requirements];
      if (what.kind === 'edit') {
        setReqAfter({ i: what.i, t: now(), old, saved: wrote });
        setRemoved(null);
        setReqFresh({ i: what.i, n: (flashN.current += 1) });
        focusSel.current = '[data-k="rundo"]';
        say('Requirement saved. Undo is available.');
      } else if (what.kind === 'add') {
        setReqAfter({ i: what.i, t: now(), old, saved: wrote });
        setRemoved(null);
        setAddText('');
        setReqFresh({ i: what.i, n: (flashN.current += 1) });
        focusSel.current = next.length >= LIMITS.requirements ? '[data-k="rundo"]' : '#cz-add-in';
        say('Requirement added. Undo is available.');
      } else if (what.kind === 'remove') {
        setRemoved({ text: what.text, old, saved: wrote, t: now() });
        setReqAfter(null);
        focusSel.current = '[data-k="rrestore"]';
        say('Requirement removed. Undo is available.');
      } else if (what.kind === 'undo') {
        setReqAfter(null);
        focusSel.current = '[data-k="reqs-h"]';
        say('Requirement change undone.');
      } else {
        setRemoved(null);
        focusSel.current = '[data-k="reqs-h"]';
        say('Requirement restored.');
      }
      flash('reqs');
    };
    if (!live || !cycle) {
      done({ ...form, requirements: next });
      return;
    }
    setBusy('reqs');
    const r = await saveFieldsLive(cycle.id, { requirements: next }, { requirements: before ?? old });
    setBusy(null);
    if (r.ok) {
      setStatus(r.row.status);
      done(rowToForm(r.row));
    } else {
      setReqErr(r.message);
      focusSel.current = reqEdit !== null ? '#cz-req-in' : adding ? '#cz-add-in' : '[data-k="reqs-h"]';
      say(r.message);
    }
    refresh();
  };

  const openReq = (i: number) => {
    closeAll();
    setReqEdit(i);
    setReqText(reqs[i]);
    focusSel.current = '#cz-req-in';
  };
  const cancelReq = () => {
    const j = reqEdit;
    setReqEdit(null);
    setReqErr(null);
    focusSel.current = `[data-k="redit:${j}"]`;
  };
  const saveReq = (i: number) => {
    if (busy) return;
    const v = reqText.trim();
    if (!v) {
      setReqErr('Write the requirement, or use Remove.');
      focusSel.current = '#cz-req-in';
      say('Write the requirement, or use Remove.');
      return;
    }
    if (v === reqs[i]) {
      setReqEdit(null);
      setReqErr(null);
      focusSel.current = `[data-k="redit:${i}"]`;
      return;
    }
    const next = [...reqs];
    next[i] = v;
    void commitReqs(next, { kind: 'edit', i });
  };
  const removeReq = (i: number) => {
    if (busy) return;
    void commitReqs(
      reqs.filter((_, j) => j !== i),
      { kind: 'remove', text: reqs[i] },
    );
  };
  const openAdd = () => {
    closeAll();
    setAdding(true);
    focusSel.current = '#cz-add-in';
  };
  const closeAdd = () => {
    setAdding(false);
    setReqErr(null);
    setAddText('');
    focusSel.current = '[data-k="ropen"]';
  };
  const addReq = () => {
    if (busy) return;
    const v = addText.trim();
    if (!v) {
      focusSel.current = '#cz-add-in';
      return;
    }
    void commitReqs([...reqs, v], { kind: 'add', i: reqs.length });
  };

  // ---------- publish and unpublish ----------

  const canPublishNow = caps.publish && missing.length === 0 && !view.otherPublishedTerm;

  const doPublish = async () => {
    if (busy || !cycle) return;
    if (!live) {
      setStatus('published');
      setPub(false);
      focusSel.current = '#cz-h1';
      say(`${term} published. Students see it on the Portal.`);
      return;
    }
    setBusy('publish');
    const r = await publishLive(cycle.id);
    setBusy(null);
    if (r.ok) {
      setStatus(r.row.status);
      setForm(rowToForm(r.row));
      setPub(false);
      setStatusErr(null);
      focusSel.current = '#cz-h1';
      say(`${term} published. Students see it on the Portal.`);
    } else {
      setStatusErr(r.message);
      focusSel.current = '[data-k="publish-go"]';
      say(r.message);
    }
    refresh();
  };

  const doUnpublish = async () => {
    if (busy || !cycle) return;
    if (!live) {
      setStatus('draft');
      setUnpub(false);
      focusSel.current = '#cz-h1';
      say(`${term} is a draft again. Students no longer see it.`);
      return;
    }
    setBusy('unpublish');
    const r = await unpublishLive(cycle.id);
    setBusy(null);
    if (r.ok) {
      setStatus(r.row.status);
      setForm(rowToForm(r.row));
      setUnpub(false);
      setStatusErr(null);
      focusSel.current = '#cz-h1';
      say(`${term} is a draft again. Students no longer see it.`);
    } else {
      setStatusErr(r.message);
      focusSel.current = '[data-k="unpublish-go"]';
      say(r.message);
    }
    refresh();
  };

  // What an armed gold button does.
  const goAct = (id: string) => {
    if (id === 'publish') void doPublish();
    else if (id === 'unpublish') void doUnpublish();
    else if (confirm && edit === confirm && id === `confirm:${confirm}`) void apply(confirm, draftPatch(confirm), undoing, undoing ? after[confirm]?.saved : undefined);
  };

  // ---------- keys ----------

  // Escape closes the open editor, or the Publish / Unpublish confirm (focus back on the button that opened it). Enter in
  // a field saves it (not in the payment note, where Enter is a new line); a held Enter does nothing more, and Enter
  // never answers an open confirm (only its armed button does).
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      if (edit) {
        e.preventDefault();
        closeEdit(edit);
      } else if (reqEdit !== null) {
        e.preventDefault();
        cancelReq();
      } else if (adding) {
        e.preventDefault();
        closeAdd();
      } else if (pub && !busy) {
        e.preventDefault();
        setPub(false);
        setStatusErr(null);
        focusSel.current = '[data-k="publish"]';
      } else if (unpub && !busy) {
        e.preventDefault();
        setUnpub(false);
        setStatusErr(null);
        focusSel.current = caps.unpublish ? '[data-k="unpublish"]' : '#cz-h1';
      }
      return;
    }
    if (e.key !== 'Enter' || e.repeat || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;
    if (t.id === 'cz-add-in') {
      e.preventDefault();
      addReq();
    } else if (t.id === 'cz-req-in' && reqEdit !== null) {
      e.preventDefault();
      saveReq(reqEdit);
    } else if (edit && t.closest('.cz-ed')) {
      e.preventDefault();
      if (confirm !== edit) save(edit);
    }
  };

  // "See it" on the news card: brings the Portal preview into view and flashes it.
  const seePreview = () => {
    const el = document.getElementById('cz-pv-panel');
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('cz-flash');
    void el.offsetWidth;
    el.classList.add('cz-flash');
    timers.current.push(window.setTimeout(() => el.classList.remove('cz-flash'), 1700));
  };

  // ---------- drawing ----------

  const tick = (
    <span className="cz-tick" aria-hidden="true">
      <Icon name="check" />
    </span>
  );

  // "Saved 9:14 AM · Undo" (or "Saving…" while the Undo is out, or "Undone 9:15 AM").
  const afterLine = (k: SaveKey) => {
    const a = after[k];
    if (!a) return null;
    if (a.undone) {
      return (
        <span className="cz-after">
          {tick}
          <span>Undone {a.t}</span>
        </span>
      );
    }
    return (
      <span className="cz-after">
        {tick}
        <span>Saved {a.t}</span>
        <span aria-hidden="true">·</span>
        {caps.edit && undoable(form, a.saved) ? (
          <button type="button" className="rf-lnk" data-k={`undo:${k}`} disabled={!!busy} onClick={() => undo(k)}>
            {busy === k && !edit ? 'Saving…' : 'Undo'}
          </button>
        ) : null}
      </span>
    );
  };

  const errLine = (m: string) => (
    <p className="cz-err">
      <Icon name="alert" />
      {m}
    </p>
  );

  // The value cell of a row.
  const valueOf = (k: RowKey, miss: boolean) => {
    if (k === 'event') {
      return (
        <span className="cz-seg" role="group" aria-label="Meet-the-board event">
          {[true, false].map((on) => (
            <button key={String(on)} type="button" data-k={`ev:${on ? 1 : 0}`} aria-pressed={form.eventEnabled === on} disabled={!caps.edit || !!busy} onClick={() => setEvent(on)}>
              {busy === 'event' && form.eventEnabled !== on ? 'Saving…' : on ? 'On' : 'Off'}
            </button>
          ))}
        </span>
      );
    }
    const d = display(form, k);
    const rel = d ? relOf(form, view.today, k) : '';
    return (
      <>
        {d ? (
          <span className="cz-val">
            {d.kind === 'text' ? d.text : null}
            {d.kind === 'money' ? <span className="rf-nowrap">{d.text}</span> : null}
            {d.kind === 'when' ? (
              <span title={d.title}>
                <span className="rf-nowrap">{d.day}</span> <span className="rf-nowrap">{d.time}</span>
              </span>
            ) : null}
            {d.kind === 'range' ? (
              <>
                <span className="rf-nowrap">{d.from}</span> to <span className="rf-nowrap">{d.to}</span>
              </>
            ) : null}
            {d.kind === 'day' ? (
              <span className="rf-nowrap" title={d.title}>
                {d.day}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="cz-unset">Not set</span>
        )}
        {d && rel ? <span className="cz-rel">{rel}</span> : null}
        {miss ? (
          <span className="cz-need">
            <Icon name="alert" />
            Needed to publish
          </span>
        ) : null}
      </>
    );
  };

  // The editor's fields for a row.
  const fieldsOf = (k: RowKey) => {
    const v = (p: keyof CycleForm) => String(draft[p as keyof CyclePatch] ?? form[p] ?? '');
    const set = (p: keyof CyclePatch) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [p]: e.target.value }));
    const date = (id: string, p: keyof CyclePatch, lab: string) => (
      <label className="cz-fl">
        {lab}
        <input className="cz-in" type="date" id={id} value={v(p)} onChange={set(p)} />
      </label>
    );
    const time = (id: string, p: keyof CyclePatch) => (
      <label className="cz-fl">
        Time
        <input className="cz-in" type="time" id={id} value={v(p)} onChange={set(p)} />
      </label>
    );
    switch (k) {
      case 'awardName':
        return <input className="cz-in cz-wide" id="cz-ed-a" value={v('awardName')} maxLength={140} aria-label="Award name" onChange={(e) => setDraft((d) => ({ ...d, awardName: e.target.value.replace(/\n/g, ' ') }))} />;
      case 'amount':
        return (
          <label className="cz-in cz-money">
            <span aria-hidden="true">$</span>
            <input id="cz-ed-a" inputMode="decimal" value={v('amount')} placeholder="2,500" aria-label="Amount in dollars" onChange={set('amount')} />
          </label>
        );
      case 'opens':
        return (
          <>
            {date('cz-ed-a', 'opensDate', 'Date')}
            {time('cz-ed-b', 'opensTime')}
          </>
        );
      case 'closes':
        return (
          <>
            {date('cz-ed-a', 'closesDate', 'Date')}
            {time('cz-ed-b', 'closesTime')}
          </>
        );
      case 'interviews':
        return (
          <>
            {date('cz-ed-a', 'interviewStart', 'Start')}
            <span className="cz-to">to</span>
            {date('cz-ed-b', 'interviewEnd', 'End')}
          </>
        );
      case 'decision':
        return date('cz-ed-a', 'decisionDate', 'Date');
      case 'photoDue':
        return date('cz-ed-a', 'photoDue', 'Date');
      case 'eventAt':
        return (
          <>
            {date('cz-ed-a', 'eventDate', 'Date')}
            {time('cz-ed-b', 'eventTime')}
          </>
        );
      case 'nextMonth':
        return (
          <select className="cz-in" id="cz-ed-a" aria-label="Next cycle opens" value={v('nextCycleMonth')} onChange={set('nextCycleMonth')}>
            <option value="">Not set</option>
            {MONTHS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        );
      case 'payment':
        return <textarea className="cz-in" id="cz-ed-a" rows={3} aria-label="How the award is paid" value={v('paymentNote')} maxLength={LIMITS.paymentNote} onChange={set('paymentNote')} />;
      default:
        return null;
    }
  };

  // The editor under an open row: the fields, the error, then Save / Cancel or the confirm.
  const editorOf = (k: RowKey) => {
    const saving = busy === k;
    const next = { ...form, ...draftPatch(k) };
    return (
      <div className="cz-ed" id={`cz-ed-${k}`}>
        <div className="cz-ed-in">
          <div className="cz-fields" aria-describedby={`cz-lab-${k}`}>
            {fieldsOf(k)}
          </div>
          {err ? errLine(err) : null}
          {confirm === k ? (
            <div className="cz-confirm" role="group" aria-labelledby={`cz-cf-${k}`}>
              <p id={`cz-cf-${k}`} className="cz-who" tabIndex={-1}>
                {confirmWho(term, view.applications)}
              </p>
              <p>{confirmWhat(k, form, next, shownAt, view.applications, view.booked)}</p>
              <div className="cz-dact">
                <button type="button" className="rf-btn rf-btn-gold" data-k="confirm" data-go={`confirm:${k}`} disabled={!!busy} onClick={goClick} onKeyDown={goDown} onKeyUp={goUp}>
                  {saving ? 'Saving…' : confirmLabel(k)}
                </button>
                <button
                  type="button"
                  className="rf-lnk"
                  disabled={saving}
                  onClick={() => {
                    if (undoing) {
                      closeEdit(k);
                      focusSel.current = `[data-k="undo:${k}"]`;
                      return;
                    }
                    setConfirm(null);
                    focusSel.current = '[data-k="save"]';
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="cz-dact">
              <button type="button" className="rf-btn rf-btn-gold" data-k="save" disabled={!!busy} onClick={() => save(k)}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="rf-lnk" disabled={saving} onClick={() => closeEdit(k)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // One setting row.
  const rowOf = (k: RowKey) => {
    if (k === 'eventAt' && !form.eventEnabled) return null;
    const miss = status === 'draft' && caps.edit && missing.some((m) => m.row === k);
    const open = edit === k;
    const hasValue = k === 'event' || display(form, k) !== null;
    const now = k === 'interviews' && relOf(form, view.today, k) === 'Now';
    const isFresh = fresh?.k === k;
    return (
      <div key={isFresh ? `${k}-${fresh.n}` : k} className={`cz-row${open ? ' cz-editing' : ''}${isFresh ? ' cz-fresh' : ''}`} id={`cz-row-${k}`}>
        <div className="cz-rg">
          <span className={`cz-kt${miss || now ? ' cz-kt-gold' : ''}`} aria-hidden="true">
            <Icon name={KIND_ICON[k]} />
          </span>
          <span className="cz-v">
            <span className="cz-l" id={`cz-lab-${k}`}>
              {LABEL[k]}
            </span>
            {valueOf(k, miss)}
            {afterLine(k)}
            {rowErr?.k === k ? errLine(rowErr.m) : null}
          </span>
          <span className="cz-a">
            {caps.edit && k !== 'event' && !open ? (
              <button type="button" className="rf-lnk" data-k={`edit:${k}`} aria-expanded="false" aria-label={`${hasValue ? 'Edit' : 'Set'} ${LABEL[k].toLowerCase()}`} disabled={!!busy} onClick={() => openEdit(k)}>
                {hasValue ? 'Edit' : 'Set'}
              </button>
            ) : null}
          </span>
        </div>
        {open ? editorOf(k) : null}
      </div>
    );
  };

  // The dates drawn on a line (opens to the decision), today marked.
  const line = dateLine(form, view.today);
  const dates = line ? (
    <>
      <div className="cz-dline" aria-hidden="true">
        <span className="cz-dl-base" />
        <span className="cz-dl-seg" style={line.apps} />
        {line.interviews ? <span className="cz-dl-seg cz-iv" style={line.interviews} /> : null}
        <span className="cz-dl-pt" style={{ left: line.decision }} />
        {line.today ? (
          <>
            <span className="cz-dl-today" style={{ left: line.today }} />
            <span className="cz-dl-lab cz-tday" style={{ left: line.today }}>
              Today
            </span>
          </>
        ) : null}
        <span className="cz-dl-lab cz-start" style={{ left: 0 }}>
          {line.start}
        </span>
        <span className="cz-dl-lab cz-end" style={{ left: '100%' }}>
          {line.end}
        </span>
      </div>
      <p className="cz-dl-key" aria-hidden="true">
        <span>
          <i className="cz-k" />
          Applications
        </span>
        <span>
          <i className="cz-k cz-iv" />
          Interviews
        </span>
        <span>
          <i className="cz-k cz-pt" />
          Decision
        </span>
      </p>
    </>
  ) : null;

  // The requirements list, edited in place.
  const reqList = () => {
    const shortText = (t: string) => (t.length > 48 ? `${t.slice(0, 46)}…` : t);
    return (
      <>
        <ol className="cz-reqs">
          {reqs.length === 0 ? (
            <li className="cz-req">
              <span />
              <span className="cz-rt cz-unset-t">Not set</span>
              <span />
            </li>
          ) : null}
          {reqs.map((r, i) => {
            const editing = reqEdit === i;
            const isFresh = reqFresh?.i === i;
            return (
              <li key={isFresh ? `${i}-${reqFresh.n}` : i} className={`cz-req${isFresh ? ' cz-fresh' : ''}`}>
                <span className="cz-rn">{i + 1}</span>
                <span className="cz-rt">{editing ? '' : r}</span>
                {caps.edit && !editing ? (
                  <span className="cz-ra">
                    <button type="button" className="rf-lnk" data-k={`redit:${i}`} aria-label={`Edit requirement ${i + 1}`} disabled={!!busy} onClick={() => openReq(i)}>
                      Edit
                    </button>
                    <button type="button" className="rf-lnk" aria-label={`Remove requirement ${i + 1}`} disabled={!!busy} onClick={() => removeReq(i)}>
                      Remove
                    </button>
                  </span>
                ) : (
                  <span />
                )}
                {editing ? (
                  <div className="cz-req-ed">
                    <input className="cz-in cz-wide" id="cz-req-in" value={reqText} maxLength={LIMITS.requirement} aria-label={`Requirement ${i + 1}`} onChange={(e) => setReqText(e.target.value)} />
                    {reqErr ? errLine(reqErr) : null}
                    <div className="cz-dact">
                      <button type="button" className="rf-btn rf-btn-gold" disabled={!!busy} onClick={() => saveReq(i)}>
                        {busy === 'reqs' ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className="rf-lnk" disabled={!!busy} onClick={cancelReq}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {reqAfter && reqAfter.i === i && undoable(form, { requirements: reqAfter.saved }) ? (
                  <span className="cz-after">
                    {tick}
                    <span>Saved {reqAfter.t}</span>
                    <span aria-hidden="true">·</span>
                    {caps.edit ? (
                      <button type="button" className="rf-lnk" data-k="rundo" disabled={!!busy} onClick={() => void commitReqs(reqAfter.old, { kind: 'undo' }, reqAfter.saved)}>
                        {busy === 'reqs' && reqEdit === null && !adding ? 'Saving…' : 'Undo'}
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
          {removed && undoable(form, { requirements: removed.saved }) ? (
            <li className="cz-req">
              <span />
              <span className="cz-after">
                {tick}
                <span>
                  Removed “{shortText(removed.text)}” · {removed.t}
                </span>
                <span aria-hidden="true">·</span>
                <button type="button" className="rf-lnk" data-k="rrestore" disabled={!!busy} onClick={() => void commitReqs(removed.old, { kind: 'restore' }, removed.saved)}>
                  {busy === 'reqs' && reqEdit === null && !adding ? 'Saving…' : 'Undo'}
                </button>
              </span>
              <span />
            </li>
          ) : null}
        </ol>
        {reqErr && reqEdit === null && !adding ? <div className="cz-req-errline">{errLine(reqErr)}</div> : null}
        {caps.edit && reqs.length < LIMITS.requirements ? (
          adding ? (
            <div className="cz-add-form">
              <label className="cz-add-field">
                <Icon name="plus" />
                <input id="cz-add-in" placeholder="Add a requirement" aria-label="New requirement" maxLength={LIMITS.requirement} value={addText} onChange={(e) => setAddText(e.target.value)} />
              </label>
              {reqErr ? errLine(reqErr) : null}
              <div className="cz-dact">
                <button type="button" className="rf-btn rf-btn-gold" disabled={!!busy} onClick={addReq}>
                  {busy === 'reqs' ? 'Saving…' : 'Add'}
                </button>
                <button type="button" className="rf-lnk" disabled={!!busy} onClick={closeAdd}>
                  Cancel
                </button>
                <span className="cz-add-hint">Enter adds it, Esc closes</span>
              </div>
            </div>
          ) : (
            <button type="button" className="cz-add-open" data-k="ropen" disabled={!!busy} onClick={openAdd}>
              <Icon name="plus" />
              Add a requirement
            </button>
          )
        ) : null}
      </>
    );
  };

  // The Portal landing preview: what a student sees, gaps in gold brackets.
  const preview = () => {
    const c = parseAmountCents(form.amount);
    const br = (t: string) => <span className="cz-br">[{t}]</span>;
    const list = reqs.map((r) => r.trim()).filter(Boolean);
    const gap = !form.awardName.trim() || c === null || !form.opensDate || !form.closesDate || !form.closesTime;
    const ch = fresh?.k;
    // A changed line gets a new key (so its flash plays again) and the flash class.
    const chKey = (id: string, k: SaveKey[]) => (k.includes(ch as SaveKey) ? { key: `${id}-${fresh?.n}`, cls: ' cz-chg' } : { key: id, cls: '' });
    const nm = chKey('nm', ['awardName']);
    const am = chKey('am', ['amount']);
    const dt = chKey('dt', ['opens', 'closes']);
    const rq = chKey('rq', ['reqs']);
    return (
      <>
        <div className="cz-pv" aria-label="Portal landing preview" role="group">
          <p className="cz-pv-term">{term}</p>
          <p key={nm.key} className={`cz-pv-name${nm.cls}`}>
            {form.awardName.trim() ? form.awardName : br('award name')}
          </p>
          <p key={am.key} className={`cz-pv-amt${am.cls}`} data-design-keep="The Portal preview repeats the amount as students see it (the demo draws it twice too)">
            {c !== null ? <span className="rf-nowrap">{money(c)}</span> : br('amount')}
          </p>
          <p key={dt.key} className={`cz-pv-dates${dt.cls}`}>
            Apply <span className="rf-nowrap">{form.opensDate ? shortDate(form.opensDate) : br('open date')}</span> to{' '}
            <span className="rf-nowrap">
              {form.closesDate ? shortDate(form.closesDate) : br('deadline')},
            </span>{' '}
            <span className="rf-nowrap">{form.closesTime ? `${clockName(form.closesTime)} ET` : br('time')}</span>
          </p>
          {list.length ? (
            <>
              <p className="cz-pv-h">Requirements</p>
              <ul key={rq.key} className={`cz-pv-list${rq.cls}`}>
                {list.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          <span className="cz-pv-apply" aria-hidden="true">
            Apply
          </span>
        </div>
        {gap ? (
          <p className="cz-pv-key">
            <span className="cz-br">[ ]</span>Not set yet
          </p>
        ) : null}
      </>
    );
  };

  // The draft's publish card: what is still missing (each a link to its row), or ready, with the one gold action.
  const needsCard = () => {
    if (status !== 'draft' || !caps.edit) return null;
    const publishBtn = (
      <button
        type="button"
        className={`rf-btn rf-btn-gold${canPublishNow ? '' : ' cz-off'}`}
        data-k="publish"
        disabled={!canPublishNow || !!busy}
        aria-disabled={!canPublishNow || undefined}
        onClick={() => {
          setPub(true);
          setStatusErr(null);
          openConfirm('#cz-pub-h');
        }}
      >
        Publish
      </button>
    );
    return (
      <section className="cz-needs" aria-labelledby="cz-nh">
        {missing.length ? (
          <>
            <h2 id="cz-nh">{`Publish needs ${missing.length} setting${missing.length === 1 ? '' : 's'}`}</h2>
            <div className="cz-n-body">
              <ul className="cz-miss">
                {missing.map((m) => (
                  <li key={m.label}>
                    <button type="button" className="rf-lnk" onClick={() => openEdit(m.row)}>
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
              {publishBtn}
            </div>
          </>
        ) : (
          <>
            <h2 id="cz-nh">Ready to publish</h2>
            <div className="cz-n-body">
              <p className="cz-ok">
                {tick}
                Every setting students see first is filled in.
              </p>
              {pub ? null : publishBtn}
              {view.otherPublishedTerm ? (
                <p className="cz-n-note">{`${view.otherPublishedTerm} is published, and only one cycle can be published at a time. Publish ${term} once ${view.otherPublishedTerm} ends.`}</p>
              ) : null}
              {pub ? (
                <div className="cz-confirm cz-n-note" role="group" aria-labelledby="cz-pub-h">
                  <p id="cz-pub-h" className="cz-who" tabIndex={-1}>{`Students see ${term} on the Portal as soon as you publish.`}</p>
                  <p>{form.opensDate ? `Applications open ${shortDate(form.opensDate)}, ${clockName(form.opensTime)}.` : ''}</p>
                  {statusErr ? errLine(statusErr) : null}
                  <div className="cz-dact">
                    <button type="button" className="rf-btn rf-btn-gold" data-k="publish-go" data-go="publish" disabled={!!busy} onClick={goClick} onKeyDown={goDown} onKeyUp={goUp}>
                      {busy === 'publish' ? 'Publishing…' : 'Publish for students'}
                    </button>
                    <button
                      type="button"
                      className="rf-lnk"
                      disabled={!!busy}
                      onClick={() => {
                        setPub(false);
                        setStatusErr(null);
                        focusSel.current = '[data-k="publish"]';
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    );
  };

  // The title line's links: back to the cycle (not for a draft), and the quiet Unpublish while nobody has applied.
  const links =
    cycle && !view.loadFailed ? (
      <>
        {status === 'draft' ? null : (
          <Link className="rf-lnk" href="/scholarships/cycle">
            Back to the cycle
          </Link>
        )}
        {caps.unpublish && !unpub ? (
          <button
            type="button"
            className="rf-lnk"
            data-k="unpublish"
            onClick={() => {
              setUnpub(true);
              setStatusErr(null);
              openConfirm('#cz-unpub-h');
            }}
          >
            Unpublish
          </button>
        ) : null}
      </>
    ) : null;

  const sub = cycle && !view.loadFailed ? (status === 'draft' ? `${term} · Draft` : status === 'archived' ? `${term} · Archived · View only` : `${term} · Published${caps.edit ? '' : ' · View only'}`) : undefined;
  const newsCard = news && cycle ? <NewsCard icon="cap" kicker="Students see it now" title={LABEL[news]} go="See it" onClick={seePreview} /> : null;

  // ---------- the page ----------

  let body;
  if (view.loadFailed) {
    body = retrying ? (
      <div aria-busy="true">
        <CzSkelBody />
      </div>
    ) : (
      <section className="cz-card" aria-label="Cycle settings">
        <div className="cz-load-err">
          <p>
            <Icon name="alert" />
            Cycle settings didn&apos;t load.
          </p>
          <button type="button" className="rf-btn" onClick={retry}>
            Try again
          </button>
        </div>
      </section>
    );
  } else if (!cycle) {
    body = (
      <section className="cz-card" aria-label="Cycle settings">
        <div className="cz-empty">
          <p>There is no draft or published cycle. Ask the person who runs the database to add one.</p>
        </div>
      </section>
    );
  } else {
    body = (
      <div className="cz-grid">
        <div className="cz-main">
          {unpub ? (
            <div className="cz-confirm cz-unpub" role="group" aria-labelledby="cz-unpub-h">
              <p id="cz-unpub-h" className="cz-who" tabIndex={-1}>{`Unpublish ${term}? Students stop seeing it on the Portal until it is published again.`}</p>
              {statusErr ? errLine(statusErr) : null}
              <div className="cz-dact">
                <button type="button" className="rf-btn" data-k="unpublish-go" data-go="unpublish" disabled={!!busy} onClick={goClick} onKeyDown={goDown} onKeyUp={goUp}>
                  {busy === 'unpublish' ? 'Saving…' : 'Unpublish'}
                </button>
                <button
                  type="button"
                  className="rf-lnk"
                  disabled={!!busy}
                  onClick={() => {
                    setUnpub(false);
                    setStatusErr(null);
                    focusSel.current = caps.unpublish ? '[data-k="unpublish"]' : '#cz-h1';
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}
          {needsCard()}
          {caps.edit ? null : (
            <p className="cz-ro">
              <Icon name="lock" />
              Only board members with admin rights can change these settings.
            </p>
          )}

          <section className="rf-panel" aria-labelledby="cz-h-award">
            <div className="rf-ph">
              <h2 id="cz-h-award">Award</h2>
            </div>
            <div className="rf-pcard">{SECTIONS.award.map(rowOf)}</div>
          </section>

          <section className="rf-panel" aria-labelledby="cz-h-dates">
            <div className="rf-ph">
              <h2 id="cz-h-dates">Dates</h2>
              <span className="cz-r">Eastern time</span>
            </div>
            <div className="rf-pcard">
              {dates}
              {SECTIONS.dates.map(rowOf)}
            </div>
          </section>

          <section className="rf-panel" aria-labelledby="cz-h-app">
            <div className="rf-ph">
              <h2 id="cz-h-app" data-k="reqs-h" tabIndex={-1}>
                Requirements
              </h2>
              {reqs.length ? <span className="cz-r">{`${reqs.length} of ${LIMITS.requirements}`}</span> : null}
            </div>
            <div className="rf-pcard">
              {reqList()}
              <p className="cz-hint">The three short-answer questions are the same every cycle, so they are not set here.</p>
            </div>
          </section>

          <section className="rf-panel" aria-labelledby="cz-h-after">
            <div className="rf-ph">
              <h2 id="cz-h-after">After the award</h2>
            </div>
            <div className="rf-pcard">{SECTIONS.after.map(rowOf)}</div>
          </section>
        </div>

        <section className="rf-panel cz-pv-panel" id="cz-pv-panel" aria-labelledby="cz-h-pv">
          <div className="rf-ph">
            <h2 id="cz-h-pv">Portal landing</h2>
          </div>
          <div className="cz-pv-card">{preview()}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="rf cz" ref={rootRef} onKeyDown={onKey}>
      <CzHead sub={sub} links={links} news={newsCard} />
      {body}
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
