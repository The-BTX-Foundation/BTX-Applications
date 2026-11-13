'use client';

// The refreshed Certifications page (demo p-certifications, Ops Hub refresh 2026-11-12): the title with the program's
// status, the news card (the next step), the plan strip (pilot budget and seats), the setup checklist (the step that is
// now holds the ideas for the call and "Add an idea"; "Add a task" in place) and the Programs chat.
// Mock mode changes its own state, like the demo (ticks, idea decisions, adds with day words and names, Undo, the N key).
// Live mode draws only the controls with a real write behind them (view.caps): tick a step, add a task, add an idea,
// write in the chat. Writes are optimistic, serialized per record, and put back with "Couldn't save. Try again." when the
// database says no (components/certifications/cert-writes.ts). Approval tasks are never ticked here: their row links to
// the approval page.
import '@/components/refresh/refresh.css';
import './certifications.css';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { chain } from '@/lib/goals-figures';
import { applyOverrides, certNews, dropOverride, dueLine, ideasPlace, setOverride, type StatusOverrides, nextPosition, plural, progress, settleFailed, type FailedAdd } from '@/lib/cert-map';
import { shouldReseed } from '@/lib/tasks-reseed';
import { parseTask, type Dismissed } from '@/lib/cert-parse';
import { clock, shortDate } from '@/lib/refresh-time';
import { newId, retryIds } from '@/lib/tasks-ids';
import type { CertIdea, CertStatus, CertStep, CertView } from '@/lib/cert-view';
import { CertChatPanel } from './cert-chat';
import { CertSecNav, CertSkelList } from './cert-skeleton';
import { insertChecklist, insertIdea, insertTask, setStepStatus } from './cert-writes';

/** The words after a refused write. */
export const SAVE_ERR = "Couldn't save. Try again.";

/** Why the middle-dot copy stays: the design check's AI-look tell, kept by the coordinator's decision (2026-11-12). */
const KEEP_DOTS = 'Middle-dot copy exactly as the signed-off demo draws it; coordinator reports it to the owner';

/** Where an approval task is decided (never on this page). */
const APPROVAL_HREF = '/finance/budget/approval';

// Retry memories for the two inserts (a failed add's id is reused for the same words within two minutes).
const ideaIds = retryIds();
const taskIds = retryIds();
// The time now in milliseconds (for the retry memories; read in event handlers only).
const nowMs = () => Date.now();

type Props = { view: CertView; live: boolean; failSave?: boolean };

// The last action, drawn as its moment-after line where it happened; `before` is what Undo puts back (mock only).
type Recent = { kind: 'step' | 'idea' | 'ideaAdd'; id: string; text: string; before: { steps: CertStep[]; ideas: CertIdea[] } };

// The signature of the server's data: a change means fresh data to take in.
const sigOf = (v: CertView) => JSON.stringify([v.steps.map((x) => [x.id, x.status, x.title, x.due, x.owner?.id]), v.ideas.map((i) => [i.id, i.decision, i.name])]);

// The plan strip: one square per seat beside the money line.
function Plan({ view }: { view: CertView }) {
  const p = view.plan;
  return (
    <section className="rf-panel cf-plan" aria-labelledby="cf-plh">
      <h2 className="rf-sr" id="cf-plh">
        The plan
      </h2>
      <div className="rf-pcard">
        <div className="cf-pl">
          {p.seats ? (
            <span className="cf-seats" role="img" aria-label={p.seatsLabel}>
              {Array.from({ length: p.seats }, (_, i) => (
                <span key={i} />
              ))}
            </span>
          ) : null}
          <div>
            <p className="cf-pl-a" data-design-keep={KEEP_DOTS}>
              <b>{p.budget}</b> pilot budget{p.note ? ` · ${p.note}` : ''}
            </p>
            <p className="cf-pl-b">{p.line}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// The page.
export function CertBoard({ view, live, failSave = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, today, me } = view;
  // The steps as last taken from the server (plus local adds), and the statuses ticked here since (a refused tick deletes
  // its entry, so the server's status shows again; every re-seed clears them).
  const [rows, setSteps] = useState(view.steps);
  const [ov, setOv] = useState<StatusOverrides>({});
  const steps = useMemo(() => applyOverrides(rows, ov), [rows, ov]);
  const [ideas, setIdeas] = useState(view.ideas);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [dismissed, setDismissed] = useState<Dismissed>({ date: false, owner: false });
  const [ideaText, setIdeaText] = useState('');
  const [saveErr, setSaveErr] = useState(false);
  // Bumped per refusal: the alert line is drawn anew, so each refusal is read once (by the alert, not the live region).
  const [errN, setErrN] = useState(0);
  // Adds reported as failed, until fresh server data shows whether they saved after all.
  const [failedAdds, setFailedAdds] = useState<FailedAdd[]>([]);
  const [flashRow, setFlashRow] = useState<string | null>(null);
  const [flashIdea, setFlashIdea] = useState<string | null>(null);
  const [popId, setPopId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();

  // Live writes still running, whether the server data on hand predates a write, and the refresh once they settle. The
  // server data is taken in after a new list and after EVERY settled refresh (lib/tasks-reseed.ts shouldReseed, as the
  // Tasks page), never while a write runs, the data is stale or a refresh is on its way.
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sig = sigOf(view);
  const [seenSig, setSeenSig] = useState(sig);
  if (shouldReseed({ sigChanged: sig !== seenSig, refreshed, goneListed: false, busy, stale, refreshing })) {
    setSeenSig(sig);
    setRefreshed(false);
    setSteps(view.steps);
    setOv({});
    setIdeas(view.ideas);
    setRecent(null);
    // An add reported as failed that the server lists did save (a lost answer): no error, and its words leave the box.
    if (failedAdds.length) {
      const listed = new Set([...view.steps.map((x) => x.id), ...view.ideas.map((x) => x.id)]);
      const r = settleFailed(failedAdds, listed, { task: addText, idea: ideaText });
      setFailedAdds(r.left);
      if (r.clearErr) setSaveErr(false);
      if (r.task !== addText) setAddText(r.task);
      if (r.idea !== ideaText) setIdeaText(r.idea);
    }
  }
  // Ids the server now lists are on the board: the same words typed again on purpose are a new row, not a retry.
  useEffect(() => {
    taskIds.forget(view.steps.map((x) => x.id));
    ideaIds.forget(view.ideas.map((x) => x.id));
  }, [view]);

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Where focus goes after the next render: the first of these selectors that exists.
  const focusSel = useRef<string[] | null>(null);
  // The setup checklist's id; made once (in the browser) when the program has none, kept for a retry.
  const listId = useRef<string | null>(view.checklistId);
  // A checklist id whose insert failed (or seemed to): the next add reuses it, so a saved-but-unanswered one is not doubled.
  const pendingList = useRef<string | null>(null);
  const flashT = useRef(0);
  const minute = useRef(14);
  // Latest steps and ideas, for rollbacks inside write callbacks that outlive a render.
  const stepsRef = useRef(steps);
  const ideasRef = useRef(ideas);
  useEffect(() => {
    stepsRef.current = steps;
    ideasRef.current = ideas;
  }, [steps, ideas]);
  useEffect(() => () => window.clearTimeout(flashT.current), []);

  // Moves focus where the last action asked (after the render that drew the target); never to the page body.
  useEffect(() => {
    if (!focusSel.current) return;
    const root = rootRef.current;
    const el = focusSel.current.map((s) => root?.querySelector<HTMLElement>(s)).find(Boolean);
    focusSel.current = null;
    el?.focus({ preventScroll: true });
  });

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

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
    const next = chain(queue.current, k, job);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    void next.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(k) === next) queue.current.delete(k);
        running.current -= 1;
        setBusy((b) => b - 1);
        if (running.current === 0) {
          if (live) refresh();
          else setStale(false);
        }
      }, 0),
    );
    return next;
  };

  // Shows the save error under the checklist (its alert role reads it once; the live region stays quiet).
  const refused = () => {
    setSaveErr(true);
    setErrN((n) => n + 1);
  };

  // A short gold flash on a step or an idea row.
  const flash = (kind: 'row' | 'idea', id: string) => {
    window.clearTimeout(flashT.current);
    if (kind === 'row') setFlashRow(id);
    else setFlashIdea(id);
    flashT.current = window.setTimeout(() => {
      setFlashRow(null);
      setFlashIdea(null);
    }, 1700);
  };

  const prog = progress(steps);
  const now = steps.find((x) => x.id === prog.nowId) ?? null;
  const news = view.loadFailed ? null : certNews(today, steps);
  const snapshot = () => ({ steps: stepsRef.current, ideas: ideasRef.current });
  const place = ideasPlace(steps, prog.nowId, ideas.length);

  // Ticks or unticks a step: drawn at once with "Done 9:14 AM"; a refused write puts the step back.
  const tick = (id: string) => {
    const st = steps.find((x) => x.id === id);
    if (!st || st.approval) return;
    const before = snapshot();
    const to: CertStatus = st.status === 'done' ? 'open' : 'done';
    setOv((o) => setOverride(o, id, to));
    setRecent({ kind: 'step', id, text: `${to === 'done' ? 'Done' : 'Reopened'} ${stamp()}`, before });
    setSaveErr(false);
    setPopId(id);
    focusSel.current = caps.undo ? [`[data-k="step:${id}:undo"]`, `[data-k="step:${id}:check"]`] : [`[data-k="step:${id}:check"]`];
    say(to === 'done' ? 'Step done' : 'Step reopened');
    void run(`step:${id}`, () => setStepStatus(id, to)).then((ok) => {
      if (ok) return;
      // Drop only this step's local status: the server's shows again (other changes since stay).
      setOv((o) => dropOverride(o, id));
      setRecent((r) => (r && r.kind === 'step' && r.id === id ? null : r));
      // The row may move (the step that is now changes): focus goes back to its check unless the person moved on.
      const act = document.activeElement;
      const row = rootRef.current?.querySelector(`[data-row="${id}"]`);
      if (!act || act === document.body || row?.contains(act)) focusSel.current = [`[data-k="step:${id}:check"]`];
      refused();
    });
  };

  // Mock: Choose, Drop or "Not decided" on an idea, with "Saved 9:15 AM · Undo".
  const decide = (id: string, decision: CertIdea['decision']) => {
    const before = snapshot();
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, decision } : i)));
    setRecent({ kind: 'idea', id, text: `Saved ${stamp()}`, before });
    focusSel.current = [`[data-k="idea:${id}:undo"]`];
    say(decision === 'chosen' ? 'Idea chosen' : decision === 'dropped' ? 'Idea dropped' : 'Idea back to not decided');
  };

  // Undo of the last action (mock): everything goes back to how it was before it.
  const undo = () => {
    const r = recent;
    if (!r) return;
    setSteps(r.before.steps);
    setOv({});
    setIdeas(r.before.ideas);
    setRecent(null);
    if (r.kind === 'step') {
      focusSel.current = [`[data-k="step:${r.id}:check"]`, '[data-k="add:in"]', '#cf-clh'];
      flash('row', r.id);
    } else if (r.kind === 'idea') {
      const d = r.before.ideas.find((i) => i.id === r.id)?.decision;
      focusSel.current = [`[data-k="idea:${r.id}:${d === 'open' ? 'choose' : 'reopen'}"]`];
    } else focusSel.current = ['[data-k="idea:in"]'];
    say('Undone');
  };

  // "Add an idea": drawn at once with "Added 9:16 AM"; a refused write takes it off and gives the words back.
  const addIdea = (e: FormEvent) => {
    e.preventDefault();
    const name = ideaText.trim();
    if (!name) {
      focusSel.current = ['[data-k="idea:in"]'];
      setIdeaText('');
      return;
    }
    const key = `${view.programId}|${name}|${me}`;
    const id = live || failSave ? ideaIds.take(key, nowMs()) : `n-${newId()}`;
    const before = snapshot();
    setIdeas((list) => [...list, { id, name, by: 'You', decision: 'open' }]);
    setIdeaText('');
    setRecent({ kind: 'ideaAdd', id, text: `Added ${stamp()}`, before });
    setSaveErr(false);
    flash('idea', id);
    focusSel.current = ['[data-k="idea:in"]'];
    say('Idea added');
    void run(`idea:${id}`, () => insertIdea(id, view.programId ?? '', name)).then((ok) => {
      if (ok) {
        ideaIds.done(key);
        return;
      }
      ideaIds.fail(key, id, nowMs());
      setFailedAdds((f) => [...f, { id, kind: 'idea', words: name }]);
      setIdeas((list) => list.filter((i) => i.id !== id));
      setRecent((r) => (r && r.id === id ? null : r));
      setIdeaText((t) => (t ? t : name));
      refused();
    });
  };

  // The parsed add text (mock mode reads day words and names; live mode takes the words as they are).
  const parsed = useMemo(() => {
    if (caps.parse) return parseTask(today, addText, view.people, dismissed);
    const t = addText.replace(/\s+/g, ' ').trim();
    return { title: t, due: null, owner: null };
  }, [caps.parse, today, addText, view.people, dismissed]);

  // Opens "Add a task" and puts the cursor in it.
  const openAdd = () => {
    setAdding(true);
    focusSel.current = ['[data-k="add:in"]'];
  };

  // Closes "Add a task" (clearing it when asked).
  const closeAdd = (clear: boolean) => {
    setAdding(false);
    if (clear) {
      setAddText('');
      setDismissed({ date: false, owner: false });
    }
  };

  // "Add a task": the new step goes at the end with "Added 9:16 AM"; a refused write takes it off and gives the words back.
  const addTask = (e: FormEvent) => {
    e.preventDefault();
    const p = parsed;
    if (!p.title) return;
    const title = p.title.slice(0, 300);
    const key = `${view.programId}|${title}|${me}`;
    const id = live || failSave ? taskIds.take(key, nowMs()) : `n-${newId()}`;
    const position = nextPosition(stepsRef.current);
    const person = p.owner ? view.people.find((x) => x.id === p.owner) : null;
    const before = snapshot();
    const st: CertStep = {
      id,
      title,
      owner: person ? { id: person.id, name: person.name, initials: person.initials, mine: person.id === me } : null,
      unassigned: false,
      due: p.due,
      dueText: null,
      noDue: false,
      sub: null,
      call: null,
      ideas: false,
      status: 'open',
      approval: false,
      position,
    };
    setSteps((list) => [...list, st]);
    setAddText('');
    setDismissed({ date: false, owner: false });
    setRecent({ kind: 'step', id, text: `Added ${stamp()}`, before });
    setSaveErr(false);
    flash('row', id);
    focusSel.current = ['[data-k="add:in"]'];
    say('Task added to the checklist');
    void run(`step:${id}`, async () => {
      // The checklist first, once (its browser-made id is kept, so a retry finishes it instead of making a second).
      if (!listId.current) {
        const made = pendingList.current ?? newId();
        pendingList.current = made;
        if (!(await insertChecklist(made, view.programId ?? ''))) return false;
        listId.current = made;
        pendingList.current = null;
      }
      return insertTask(id, listId.current, title, position);
    }).then((ok) => {
      if (ok) {
        taskIds.done(key);
        return;
      }
      taskIds.fail(key, id, nowMs());
      setFailedAdds((f) => [...f, { id, kind: 'task', words: title }]);
      setSteps((list) => list.filter((x) => x.id !== id));
      setRecent((r) => (r && r.id === id ? null : r));
      setAddText((t) => (t ? t : title));
      refused();
    });
  };

  // Escape closes "Add a task" and clears it; focus goes back to "Add a task".
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeAdd(true);
    focusSel.current = ['#cf-add-open', '[data-x="addfirst"]', '#cf-clh'];
  };

  // Leaving an empty field closes it (not when the move is to a chip or the form itself).
  const onAddBlur = () => {
    window.setTimeout(() => {
      const form = rootRef.current?.querySelector('#cf-add-form');
      if (form && form.contains(document.activeElement)) return;
      setAddText((t) => {
        if (!t.trim()) closeAdd(false);
        return t;
      });
    }, 150);
  };

  // The N key opens "Add a task" (mock; not while typing).
  useEffect(() => {
    if (!caps.nKey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (!rootRef.current?.querySelector('#cf-add-open')) return;
      e.preventDefault();
      setAdding(true);
      focusSel.current = ['[data-k="add:in"]'];
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [caps.nKey]);

  // The news card: brings the next step into view and flashes it (focus stays on the card, as in the demo).
  const openNext = () => {
    const id = prog.nowId;
    const el = id ? rootRef.current?.querySelector<HTMLElement>(`[data-row="${id}"]`) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('cf-flashit');
    void el.offsetWidth;
    el.classList.add('cf-flashit');
    window.setTimeout(() => el.classList.remove('cf-flashit'), 1700);
  };

  // "Try again" on a load error: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  const meInitials = view.people.find((p) => p.id === me)?.initials ?? '';

  // The moment-after line ("Done 9:14 AM · Undo") for the record `id` of `kind`, if it is the last action.
  const after = (kind: Recent['kind'], id: string, k: string) =>
    recent && recent.kind === kind && recent.id === id ? (
      <span className="cf-after" data-design-keep={KEEP_DOTS}>
        <span className="cf-tk" aria-hidden="true">
          <Icon name="check" />
        </span>
        {recent.text}
        {caps.undo ? (
          <>
            {' · '}
            <button type="button" className="rf-lnk" data-k={k} onClick={undo}>
              Undo
            </button>
          </>
        ) : null}
      </span>
    ) : null;

  // One idea row.
  const ideaRow = (i: CertIdea) => {
    const mark = i.decision === 'chosen' ? <span className="cf-chip cf-ink">Chosen</span> : i.decision === 'dropped' ? <span className="cf-chip">Dropped</span> : null;
    const done = after('idea', i.id, `idea:${i.id}:undo`);
    let acts = done;
    if (!acts && caps.decide) {
      acts =
        i.decision === 'open' ? (
          <>
            <button type="button" className="rf-lnk" data-k={`idea:${i.id}:choose`} onClick={() => decide(i.id, 'chosen')}>
              Choose<span className="rf-sr"> {i.name}</span>
            </button>
            <button type="button" className="rf-lnk" data-k={`idea:${i.id}:drop`} onClick={() => decide(i.id, 'dropped')}>
              Drop<span className="rf-sr"> {i.name}</span>
            </button>
          </>
        ) : (
          <button type="button" className="rf-lnk" data-k={`idea:${i.id}:reopen`} onClick={() => decide(i.id, 'open')}>
            Not decided<span className="rf-sr"> {i.name}</span>
          </button>
        );
    }
    return (
      <li key={i.id} className={`cf-idea${i.decision === 'dropped' ? ' cf-dropped' : ''}${flashIdea === i.id ? ' cf-flash' : ''}`}>
        <span className={`cf-kt${i.decision === 'chosen' ? ' cf-gold' : ''}`} aria-hidden="true">
          <Icon name="cert" />
        </span>
        <div>
          <span className="cf-nm">
            <span>{i.name}</span>
            {mark}
          </span>
          <span className="cf-by">
            Suggested by <span className="rf-nowrap">{i.by}</span>
          </span>
        </div>
        <span className="cf-iacts">{acts}</span>
      </li>
    );
  };

  // "Ideas for the call": the list, and (where `place` says) the add form. In their own panel the panel's heading names
  // them, so the small heading is left out and an empty list says so.
  const ideasBlock = (withAdd: boolean, inPanel = false) => (
    <>
      {inPanel ? null : <h3 className="cf-ih">Ideas for the call</h3>}
      {ideas.length ? <ul className="cf-ideas">{ideas.map(ideaRow)}</ul> : inPanel ? <p className="cf-noideas">No certification ideas yet.</p> : null}
      {withAdd && caps.addIdea ? (
        <>
          <form className="cf-idea-add" onSubmit={addIdea} autoComplete="off">
            <label className="cf-fld">
              <span className="rf-sr">Certification</span>
              <input type="text" enterKeyHint="done" placeholder="Name of the certification" maxLength={200} data-k="idea:in" value={ideaText} onChange={(e) => setIdeaText(e.target.value)} />
            </label>
            <button className="rf-btn rf-btn-gold" type="submit" data-k="idea:add">
              <Icon name="plus" />
              Add an idea
            </button>
          </form>
          {recent && recent.kind === 'ideaAdd' && ideas.some((i) => i.id === recent.id) ? <p className="cf-idea-after">{after('ideaAdd', recent.id, 'ideaAdd:undo')}</p> : null}
        </>
      ) : null}
    </>
  );

  // One step: the check (or the approval's Review link), the due line, the title and the meta.
  const stepRow = (st: CertStep) => {
    const due = dueLine(today, st);
    const done = st.status === 'done';
    const meta = (
      <>
        {st.unassigned ? (
          <span className="cf-who cf-nobody">
            <span className="cf-ini" aria-hidden="true" />
            No owner
          </span>
        ) : st.owner ? (
          <span className="cf-who">
            <span className={`cf-ini${st.owner.mine ? ' cf-me' : ''}`} aria-hidden="true">
              {st.owner.initials}
            </span>
            {st.owner.mine ? 'You' : st.owner.name}
          </span>
        ) : null}
        {st.call ? (
          <span className="cf-call">
            <Icon name="video" />
            Planning call {st.call}
          </span>
        ) : null}
        {st.sub ? (
          <span className="cf-note" data-design-keep={KEEP_DOTS}>
            {st.sub}
          </span>
        ) : null}
        {place.at === 'fold' && place.stepId === st.id ? (
          <button type="button" className="rf-lnk" aria-expanded={ideasOpen} aria-controls="cf-ideas-fold" data-k={`step:${st.id}:ideas`} onClick={() => setIdeasOpen((o) => !o)}>
            {plural(ideas.length, 'idea', 'ideas')}
            <Icon name="down" />
          </button>
        ) : null}
        {after('step', st.id, `step:${st.id}:undo`)}
      </>
    );
    const hasMeta = !!(st.unassigned || st.owner || st.call || st.sub || (place.at === 'fold' && place.stepId === st.id) || (recent && recent.kind === 'step' && recent.id === st.id));
    return (
      <div className={`cf-row${done ? ' cf-done' : ''}${due ? '' : ' cf-noeb'}${flashRow === st.id ? ' cf-flash' : ''}`} data-row={st.id}>
        {st.approval ? (
          <Link className="rf-lnk cf-review" href={APPROVAL_HREF}>
            Review<span className="rf-sr"> {st.title}</span>
          </Link>
        ) : caps.tick ? (
          <button
            type="button"
            className={`rf-check${popId === st.id ? ' rf-pop' : ''}`}
            aria-pressed={done}
            aria-label={`Done: ${st.title}`}
            data-k={`step:${st.id}:check`}
            onClick={() => tick(st.id)}
            onAnimationEnd={() => setPopId(null)}
          >
            <Icon name="check" />
          </button>
        ) : (
          <span />
        )}
        <div className="rf-main">
          {due ? (
            <span className="cf-eb">
              <span className={`cf-due${due.muted ? ' cf-muted' : ''}`} title={due.title}>
                {due.late ? <span className="rf-late">{due.text}</span> : due.text}
              </span>
            </span>
          ) : null}
          <span className="cf-t">{st.title}</span>
          {hasMeta ? <span className="cf-meta">{meta}</span> : null}
        </div>
      </div>
    );
  };

  const chips = caps.parse && adding ? parsed : null;
  const chipPerson = chips?.owner ? view.people.find((p) => p.id === chips.owner) : null;

  // Removing a chip stops that part being read; the cursor stays in the field.
  const dropChip = (kind: keyof Dismissed) => {
    setDismissed((d) => ({ ...d, [kind]: true }));
    focusSel.current = ['[data-k="add:in"]'];
  };

  const listPanel = view.loadFailed ? (
    retrying ? (
      <div aria-busy="true">
        <CertSkelList />
      </div>
    ) : (
      <section className="rf-panel" aria-labelledby="cf-errh">
        <div className="rf-pcard">
          {view.noProgram ? (
            // No program row: a retry cannot fix it, so no "Try again".
            <div className="cf-err" role="status">
              <div>
                <b id="cf-errh">There is no certification program yet.</b>
              </div>
            </div>
          ) : (
            <div className="cf-err" role="alert">
              <div>
                <b id="cf-errh">Certification program didn&apos;t load.</b>
                <p>Check your connection, then try again.</p>
              </div>
              <button type="button" className="rf-btn" onClick={retry}>
                <Icon name="refresh" />
                Try again
              </button>
            </div>
          )}
        </div>
      </section>
    )
  ) : (
    <section className="rf-panel" aria-labelledby="cf-clh">
      <div className="rf-ph">
        <h2 id="cf-clh" tabIndex={-1}>
          Setup checklist
        </h2>
        {prog.total ? (
          <span className="cf-prog">
            <span className="cf-bar" role="img" aria-label={`${prog.done} of ${prog.total} steps done`}>
              {steps.map((x) => (
                <span key={x.id} className={x.status === 'done' ? 'cf-on' : x.id === prog.nowId ? 'cf-now' : ''} />
              ))}
            </span>
            <b>
              {prog.done} of {prog.total}
            </b>
          </span>
        ) : null}
      </div>
      <div className="rf-pcard">
        {steps.length === 0 ? (
          <p className="cf-none">
            No setup steps yet.
            {caps.addTask && !adding ? (
              <button type="button" className="rf-lnk" data-x="addfirst" onClick={openAdd}>
                Add the first task
              </button>
            ) : null}
          </p>
        ) : (
          <ul className="cf-items">
            {steps.map((st) => {
              const isNow = st.id === now?.id;
              if (isNow) {
                return (
                  <li key={st.id}>
                    <div className="cf-now">
                      {stepRow(st)}
                      {place.at === 'step' && place.stepId === st.id ? <div className="cf-now-in">{ideasBlock(true)}</div> : null}
                    </div>
                  </li>
                );
              }
              return (
                <li key={st.id}>
                  {stepRow(st)}
                  {place.at === 'fold' && place.stepId === st.id ? (
                    <Fold open={ideasOpen} className="cf-ideas-fold" id="cf-ideas-fold">
                      <div className="cf-sub-in">{ideasBlock(place.withAdd)}</div>
                    </Fold>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {caps.addTask ? (
          <div className="cf-add">
            {!adding && steps.length > 0 ? (
              <button type="button" className="cf-add-open" id="cf-add-open" onClick={openAdd}>
                <span className="cf-plus">
                  <Icon name="plus" />
                </span>
                <span className="cf-lab">Add a task</span>
                {caps.nKey ? (
                  <span className="cf-kbd" aria-hidden="true">
                    N
                  </span>
                ) : null}
              </button>
            ) : null}
            {adding ? (
              <form className="cf-add-form" id="cf-add-form" onSubmit={addTask} autoComplete="off">
                <div className="cf-add-field">
                  <span className="cf-plus" aria-hidden="true">
                    <Icon name="plus" />
                  </span>
                  <input
                    type="text"
                    enterKeyHint="done"
                    maxLength={300}
                    aria-label={caps.parse ? "New task. A day or a board member's first name sets the due date and owner." : 'New task'}
                    placeholder={caps.parse ? 'New task, e.g. Draft the student form fri Toby' : 'New task'}
                    data-k="add:in"
                    value={addText}
                    onChange={(e) => {
                      setAddText(e.target.value);
                      if (!e.target.value.trim()) setDismissed({ date: false, owner: false });
                    }}
                    onKeyDown={onAddKey}
                    onBlur={onAddBlur}
                  />
                  <span className="cf-add-hint">Enter to add</span>
                </div>
                <div className="cf-chips">
                  {chips?.due ? (
                    <button key={`d-${chips.due}`} type="button" className="cf-pchip cf-new" aria-label={`Due ${shortDate(chips.due)}. Remove`} onMouseDown={(e) => e.preventDefault()} onClick={() => dropChip('date')}>
                      <Icon name="cal" />
                      {shortDate(chips.due)}
                      <svg className="rf-i cf-x" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  ) : null}
                  {chipPerson ? (
                    <button key={`o-${chipPerson.id}`} type="button" className="cf-pchip cf-new" aria-label={`Owner ${chipPerson.name}. Remove`} onMouseDown={(e) => e.preventDefault()} onClick={() => dropChip('owner')}>
                      {chipPerson.id === me ? 'You' : chipPerson.name}
                      <svg className="rf-i cf-x" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
        {saveErr ? (
          <p key={errN} className="rf-saveerr" role="alert">
            <Icon name="alert" />
            {SAVE_ERR}
          </p>
        ) : null}
      </div>
    </section>
  );

  return (
    <div className="rf cf" ref={rootRef}>
      <header className="rf-head">
        <div>
          <div className="rf-ptitle">
            <h1>Certifications</h1>
            {view.status ? <span className="rf-pdate">{view.status}</span> : null}
          </div>
          {news ? <div data-design-keep={KEEP_DOTS}><NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go="Open" gold={news.gold} onClick={openNext} /></div> : null}
        </div>
      </header>
      <CertSecNav />
      <div className={`rf-board cf-board${view.loadFailed ? ' cf-solo' : ''}`}>
        <div className="rf-col">
          {view.loadFailed ? null : <Plan view={view} />}
          {listPanel}
          {!view.loadFailed && place.at === 'panel' && (ideas.length > 0 || caps.addIdea) ? (
            <section className="rf-panel" aria-labelledby="cf-idh">
              <div className="rf-ph">
                <h2 id="cf-idh">Certification ideas</h2>
              </div>
              <div className="rf-pcard">
                <div className="cf-ideas-panel">{ideasBlock(true, true)}</div>
              </div>
            </section>
          ) : null}
        </div>
        {view.loadFailed ? null : (
          <div className="rf-col">
            <CertChatPanel
              chat={view.chat}
              me={me}
              meInitials={meInitials}
              live={live}
              canPost={caps.chat}
              failSave={failSave}
              stamp={stamp}
              say={say}
              onSaved={refresh}
              onRetry={retry}
            />
          </div>
        )}
      </div>
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
