'use client';

// The refreshed Cycle page (demo p-cycle, Ops Hub refresh): the title with the award and amount, the news card (what the
// stage needs now), the schedule (the cycle's dates drawn on one line on laptops, then one block per stage; a stage jumps
// to its steps), the checklist grouped by stage, and the Scholarships chat (beside them on wide screens).
// Mock mode changes its own state, like the demo: the reminder (behind a confirm), sharing with the board, ticks and
// nudges, each with its "after" line and Undo. None of those exist live (lib/cycle-live.ts liveCaps): the reminder would
// email students, and sharing, ticks and nudges have no write on this page. Live, the steps show their state and a link to
// where they are done, and the only write is a message in the Scholarships chat.
import '@/components/refresh/refresh.css';
import './cycle.css';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { StateLine } from '@/components/refresh/state-line';
import { axisFor, fixedSteps, fixedWord, GROUPS, newsFor, progress, rowWhen, stagesFor, subParts, waitingOn, type CyStage } from '@/lib/cycle-map';
import type { CyGroupId, CyOwner, CyRow, CycleView } from '@/lib/cycle-view';
import { chain, mockClock } from '@/lib/mentorship-map';
import { clock } from '@/lib/refresh-time';
import { CycleChat } from './cycle-chat';
import { CY_SETTINGS, CyHead, CyPanelsSkel } from './cycle-skeleton';

/** The checklist group heading repeats its stage's name and number: the stage card jumps to it, as the signed-off demo draws it. */
const KEEP_GROUP = 'Checklist group heading names its schedule stage on purpose: the stage card jumps here (signed-off demo, 2026-11-11)';

type Props = { view: CycleView; live: boolean };

/** A mock action laid over a step: its done value, the done words, and the line after it. */
type Over = { done: boolean; doneText: string | null; after: { kind: 'remind' | 'share' | 'tick'; t: string; k?: number | null } | null };

// True when the person asked the system for reduced motion.
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A slim step bar: n steps, k filled; past 40 one continuous bar.
function StepBar({ k, n, label, ink = false }: { k: number; n: number; label: string; ink?: boolean }) {
  const cls = `cy-bar${ink ? ' cy-ink' : ''}`;
  if (n > 40) {
    return (
      <span className={`${cls} cy-cont`} role="img" aria-label={label} title={label}>
        <i style={{ width: `${(k / n) * 100}%` }} />
      </span>
    );
  }
  return (
    <span className={cls} role="img" aria-label={label} title={label}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={i < k ? 'cy-on' : undefined} />
      ))}
    </span>
  );
}

// The small gold check of an "after" line.
function Tick() {
  return (
    <span className="cy-tick" aria-hidden="true">
      <Icon name="check" />
    </span>
  );
}

// "Done 9:14 AM · Undo": the moment after an action, right where it happened.
function After({ children, onUndo }: { children: ReactNode; onUndo?: () => void }) {
  return (
    <span className="cy-after">
      <Tick />
      <span>{children}</span>
      {onUndo ? (
        <>
          <span aria-hidden="true">·</span>
          <button type="button" className="rf-lnk" data-x="undo" onClick={onUndo}>
            Undo
          </button>
        </>
      ) : null}
    </span>
  );
}

// A step's owner: a small face (initials, gold for me; the automatic mark for the bot; people for a group) and the name.
function Owner({ o }: { o: CyOwner }) {
  const face =
    o.kind === 'me' || o.kind === 'person' ? (
      <span className={`cy-fc${o.kind === 'me' ? ' cy-me' : ''}`} aria-hidden="true">
        {o.initials}
      </span>
    ) : (
      <span className="cy-fc cy-ic" aria-hidden="true">
        <Icon name={o.kind === 'bot' ? 'auto' : 'people'} />
      </span>
    );
  return (
    <span className="cy-ow">
      {face}
      <span className="cy-own">{o.label}</span>
    </span>
  );
}

// One schedule stage as a button (it jumps to the stage's steps).
function Stage({ st, i, onJump }: { st: CyStage; i: number; onJump: () => void }) {
  const d = st.drawn;
  return (
    <button type="button" className={`cy-stg cy-${st.state}`} onClick={onJump}>
      <span className="cy-sh">
        <span className="cy-node">{st.state === 'done' ? <Icon name="check" /> : i + 1}</span>
        <b>{st.name}</b>
      </span>
      {st.dates ? (
        <span className="cy-sd" title={st.title ?? undefined}>
          {st.dates.map((x, j) => (
            <Fragment key={j}>
              {j ? st.sep : ''}
              <span className="rf-nowrap">{x}</span>
            </Fragment>
          ))}
        </span>
      ) : null}
      {st.note?.kind === 'closed' ? (
        <span className="cy-tag">
          <Icon name="lock" />
          Closed
        </span>
      ) : st.note?.kind === 'text' ? (
        <span className={`cy-ss${st.note.ink ? ' cy-ink' : ''}`}>{st.note.text}</span>
      ) : st.note?.kind === 'unset' ? (
        <span className="cy-unset">Date not set</span>
      ) : null}
      {d?.kind === 'applied' ? (
        <span className="cy-drawn">
          <span className="cy-lab">
            {d.n == null ? (
              "Couldn't count"
            ) : (
              <>
                <b>{d.n}</b> applied
              </>
            )}
          </span>
        </span>
      ) : d?.kind === 'bar' && st.state !== 'unset' ? (
        <span className="cy-drawn">
          {d.k != null && d.n != null && d.n > 0 ? <StepBar k={Math.min(d.k, d.n)} n={d.n} ink={d.ink} label={`${d.k} of ${d.n} ${d.what}`} /> : null}
          <span className="cy-lab">
            {d.k == null || d.n == null ? (
              "Couldn't count"
            ) : (
              <>
                <b>
                  {d.k} of {d.n}
                </b>{' '}
                {d.what}
              </>
            )}
          </span>
        </span>
      ) : null}
      <span className="rf-sr">, show its steps</span>
    </button>
  );
}

// The page.
export function CycleBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, today, now, cycle } = view;

  // Mock actions laid over the steps (live has none: every action cap is off).
  const [over, setOver] = useState<Record<string, Over>>({});
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState<Partial<Record<CyGroupId, boolean>>>({});
  const [nudged, setNudged] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  // Mock "Try again": a short skeleton, then the page (the demo's 900 ms). Live: a server refresh.
  const [mockFailed, setMockFailed] = useState(view.loadFailed);
  const [reloading, setReloading] = useState(false);
  const [retrying, startRetry] = useTransition();
  const [listRetrying, startListRetry] = useTransition();
  const [, startRefresh] = useTransition();
  const loadFailed = live ? view.loadFailed : mockFailed;

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  const actions = useRef(0);
  const focusSel = useRef<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

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

  // Reads a message to screen readers once (cleared first so the same words are read again).
  const say = useCallback((m: string) => {
    setAnnounce('');
    window.setTimeout(() => setAnnounce(m), 30);
  }, []);

  // Live "Try again": says "Cycle loaded" once the refreshed data reads.
  const wasFailed = useRef(view.loadFailed);
  useEffect(() => {
    if (live && wasFailed.current && !view.loadFailed) say('Cycle loaded');
    wasFailed.current = view.loadFailed;
  }, [view.loadFailed, live, say]);

  // Runs `fn` after `ms` (cleared if the page goes first).
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // "9:14 AM": the real Eastern time in live mode; the demo's 9:14 AM plus one minute per action in mock mode.
  const stamp = () => (live ? clock(new Date().toISOString()) : mockClock(actions.current++));

  // Lights a step gold for a moment.
  const flashRow = (id: string) => {
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(id));
    later(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  // Runs a chat write after every earlier one on the same key; when the last settles, one refresh (live only).
  const enqueue = <T,>(k: string, write: () => Promise<T>): Promise<T> => {
    const next = chain(queue.current, k, write);
    running.current += 1;
    // The caller handles (and announces) a failure; this side chain only swallows it so nothing is left unhandled.
    next
      .finally(() =>
        window.setTimeout(() => {
          if (queue.current.get(k) === next) queue.current.delete(k);
          running.current -= 1;
          if (running.current === 0 && live) startRefresh(() => router.refresh());
        }, 0),
      )
      .catch(() => {});
    return next;
  };

  // "Try again" on the load error: mock shows the skeleton for 900 ms, then the page; live reloads the server data.
  const retry = () => {
    if (live) {
      startRetry(() => router.refresh());
      return;
    }
    setReloading(true);
    later(() => {
      setMockFailed(false);
      setReloading(false);
      say('Cycle loaded');
    }, 900);
  };

  const liveRegion = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (reloading || retrying) {
    return (
      <div className="rf cy" data-state="loading" aria-busy="true" ref={rootRef}>
        <h1 className="rf-sr">Cycle</h1>
        {liveRegion}
        <CyHead loading />
        <CyPanelsSkel />
      </div>
    );
  }

  const title = cycle?.title ?? 'Cycle';
  const sub = cycle ? subParts(cycle) : [];

  if (loadFailed || !cycle) {
    return (
      <div className="rf cy" ref={rootRef}>
        {liveRegion}
        <CyHead title={title} sub={sub} settings={loadFailed} />
        {loadFailed ? (
          <section className="cy-box" aria-label="Cycle">
            <StateLine kind="error" onRetry={retry}>
              The cycle didn&apos;t load.
            </StateLine>
          </section>
        ) : (
          <section className="cy-box" aria-label="Cycle">
            <div className="cy-empty">
              <p>A published cycle shows its schedule and checklist here.</p>
              <Link className="rf-btn rf-btn-gold" href={CY_SETTINGS}>
                Open cycle settings
              </Link>
            </div>
          </section>
        )}
      </div>
    );
  }

  // The steps with the mock actions laid over them.
  const rows: CyRow[] = view.rows.map((r) => (over[r.id] ? { ...r, done: over[r.id].done, doneAt: over[r.id].done ? r.doneAt : null } : r));
  const unbooked = cycle.applied != null && cycle.booked != null ? Math.max(0, cycle.applied - cycle.booked) : null;
  const stages = stagesFor(cycle, today, now);
  const axis = axisFor(cycle, stages, today);
  const mockNews = !live && caps.remind && unbooked != null;
  const news = newsFor(rows, today, mockNews ? { unbooked } : null);
  const actOn = (r: CyRow) => r.act != null && !r.done && caps[r.act];
  const primaryId = live ? null : (rows.find((r) => r.act === 'remind' && actOn(r)) ?? rows.find((r) => r.act === 'share' && actOn(r)))?.id ?? null;
  const prog = progress(cycle, rows, now, !live);
  const stageOf = (g: (typeof GROUPS)[number]) => stages.find((s) => s.key === g.stage);
  const sel = (id: string) => `[data-row="${id}"]`;

  // Lays a mock action over a step.
  const put = (id: string, o: Over) => setOver((x) => ({ ...x, [id]: o }));

  // A stage jumps to its steps: a folded group opens, its heading scrolls into view, lights up and takes focus.
  const jump = (g: CyGroupId) => {
    if (fixedSteps(g, cycle, now, !live).length) setOpen((o) => ({ ...o, [g]: true }));
    const h = rootRef.current?.querySelector<HTMLElement>(`#cy-grp-${g}`);
    if (!h) return;
    h.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    setPulse(null);
    window.requestAnimationFrame(() => setPulse(g));
    later(() => setPulse((p) => (p === g ? null : p)), 1600);
    h.focus({ preventScroll: true });
  };

  // The news card: the step scrolls into view and lights up; the reminder opens its confirm (focus on its button); live,
  // the step's link takes focus.
  const seeStep = (id: string) => {
    const row = rootRef.current?.querySelector<HTMLElement>(sel(id));
    if (!row) return;
    const r = rows.find((x) => x.id === id);
    if (r?.act === 'remind' && actOn(r) && !confirm) {
      setConfirm(true);
      later(() => rootRef.current?.querySelector<HTMLElement>('[data-x="remindGo"]')?.focus({ preventScroll: true }), 50);
    } else if (live) row.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashRow(id);
  };

  // The reminder's button opens or closes its confirm.
  const toggleRemind = () => {
    const next = !confirm;
    setConfirm(next);
    if (next) later(() => rootRef.current?.querySelector<HTMLElement>('[data-x="remindGo"]')?.focus({ preventScroll: true }), 50);
  };

  // Back on the confirm: it closes, focus returns to the reminder's button.
  const remindBack = () => {
    setConfirm(false);
    focusSel.current = ['[data-x="remind"]'];
  };

  // "Email 16 students" (mock only: nothing is sent): the step is done, "Emailed 16 students · 9:14 AM", no Undo.
  const remindGo = (r: CyRow) => {
    const t = stamp();
    setConfirm(false);
    put(r.id, { done: true, doneText: `today, ${t}`, after: { kind: 'remind', t, k: unbooked } });
    flashRow(r.id);
    focusSel.current = [`${sel(r.id)} .cy-ck`];
    say(unbooked != null ? `Reminder emailed to ${unbooked} students.` : 'Reminder emailed.');
  };

  // "Share with the board" (mock only): done, "Shared with the board · 9:14 AM · Undo".
  const share = (r: CyRow) => {
    const t = stamp();
    put(r.id, { done: true, doneText: `today, ${t}`, after: { kind: 'share', t } });
    flashRow(r.id);
    focusSel.current = [`${sel(r.id)} [data-x="undo"]`];
    say('Interview schedule shared with the board. Undo is available.');
  };

  // Undo: the step is not done again.
  const undo = (r: CyRow) => {
    put(r.id, { done: false, doneText: null, after: null });
    flashRow(r.id);
    focusSel.current = [`${sel(r.id)} .cy-ck`];
    say('Undone.');
  };

  // A tick (mock only): done with "Done 9:14 AM · Undo", or not done again (an emailed reminder stays done).
  const tick = (r: CyRow) => {
    if (!caps.tick) return;
    focusSel.current = [`${sel(r.id)} .cy-ck`];
    if (r.done) {
      if (over[r.id]?.after?.kind === 'remind') {
        say('The reminder was already emailed. It stays done.');
        return;
      }
      put(r.id, { done: false, doneText: null, after: null });
      flashRow(r.id);
      say(`Marked not done: ${r.title}`);
      return;
    }
    const t = stamp();
    put(r.id, { done: true, doneText: `today, ${t}`, after: { kind: 'tick', t } });
    if (r.act === 'remind') setConfirm(false);
    flashRow(r.id);
    say(`Done: ${r.title}. Undo is available.`);
  };

  // Nudge a late step's owner (mock only), and its Undo.
  const nudge = (r: CyRow, who: string) => {
    setNudged((n) => ({ ...n, [r.id]: stamp() }));
    focusSel.current = [`${sel(r.id)} [data-x="unnudge"]`];
    say(`Nudged ${who} in board chat. Undo is available.`);
  };
  const unnudge = (r: CyRow) => {
    setNudged((n) => {
      const x = { ...n };
      delete x[r.id];
      return x;
    });
    focusSel.current = [`${sel(r.id)} [data-x="nudge"]`];
    say('Nudge undone.');
  };

  // The checklist's load error "Try again": mock goes back to the sample, live reloads the server data.
  const retryList = () => startListRetry(() => (live ? router.refresh() : router.replace(pathname)));

  // The action at a step's right: its "after" line, the reminder or share (gold when it is the one primary), or its link.
  const action = (r: CyRow) => {
    const o = over[r.id];
    if (o?.after) {
      const a = o.after;
      if (a.kind === 'remind') {
        return (
          <After>
            Emailed <b>{a.k != null ? `${a.k} students` : 'the students'}</b> · {a.t}
          </After>
        );
      }
      return <After onUndo={() => undo(r)}>{a.kind === 'share' ? `Shared with the board · ${a.t}` : `Done ${a.t}`}</After>;
    }
    if (r.done) return null;
    const prim = primaryId === r.id;
    if (r.act === 'remind' && actOn(r)) {
      return prim ? (
        <button type="button" className={`rf-btn${confirm ? '' : ' rf-btn-gold'}`} data-x="remind" aria-expanded={confirm} aria-controls="cy-cf-remind" onClick={toggleRemind}>
          <Icon name="send" />
          <span>{unbooked != null ? `Remind the ${unbooked}` : 'Remind'}</span>
        </button>
      ) : (
        <button type="button" className="rf-lnk" data-x="remind" aria-expanded={confirm} aria-controls="cy-cf-remind" onClick={toggleRemind}>
          Remind
        </button>
      );
    }
    if (r.act === 'share' && actOn(r)) {
      return prim ? (
        <button type="button" className="rf-btn rf-btn-gold" data-x="share" onClick={() => share(r)}>
          <Icon name="send" />
          <span>Share with the board</span>
        </button>
      ) : (
        <button type="button" className="rf-lnk" data-x="share" onClick={() => share(r)}>
          Share
        </button>
      );
    }
    if (r.link) {
      return (
        <Link className="rf-lnk" href={r.link.href}>
          {r.link.label}
        </Link>
      );
    }
    return null;
  };

  // One step: the check, the when line, the title, the owner, the waiting line, and the action.
  const stepRow = (r: CyRow) => {
    const w = rowWhen(today, r, over[r.id]?.doneText);
    const who = waitingOn(today, r);
    const mine = r.owner?.kind === 'me';
    const cls = `cy-row${r.done ? ' cy-done' : ''}${primaryId === r.id ? ' cy-primary' : ''}${mine ? ' cy-mine' : ''}${flash === r.id ? ' cy-flash' : ''}`;
    return (
      <li key={r.id} className={cls} data-row={r.id}>
        <div className="cy-rw">
          {caps.tick ? (
            <button type="button" className="cy-ck" aria-pressed={r.done} aria-label={`${r.done ? 'Done' : 'Mark done'}: ${r.title}`} onClick={() => tick(r)}>
              <span className="cy-cb">
                <Icon name="check" />
              </span>
            </button>
          ) : (
            <span className={`cy-ck cy-static${r.done ? ' cy-on' : ''}`} aria-hidden="true">
              <span className="cy-cb">
                <Icon name="check" />
              </span>
            </span>
          )}
          <span className="cy-rt">
            <span className="cy-eb">
              {w.kind === 'done' ? (
                w.text
              ) : w.kind === 'late' ? (
                <span className="cy-late" title={w.title}>
                  {w.text}
                </span>
              ) : w.kind === 'due' ? (
                <span title={w.title}>{w.text}</span>
              ) : null}
            </span>
            <b className="cy-t">{r.title}</b>
            {r.owner ? (
              <span className="cy-meta">
                <Owner o={r.owner} />
              </span>
            ) : null}
            {who ? (
              caps.nudge && nudged[r.id] ? (
                <span className="cy-wait cy-wdone">
                  <span className="cy-wt">
                    <Tick />
                    <span>Nudged {nudged[r.id]}</span>
                  </span>
                  <button type="button" className="rf-lnk" data-x="unnudge" onClick={() => unnudge(r)}>
                    Undo
                  </button>
                </span>
              ) : (
                <span className="cy-wait">
                  <span className="cy-wt">
                    <Icon name="clock" />
                    Waiting on {who}
                  </span>
                  {caps.nudge ? (
                    <button type="button" className="cy-nudge" data-x="nudge" onClick={() => nudge(r, who)}>
                      Nudge {who}
                    </button>
                  ) : null}
                </span>
              )
            ) : null}
          </span>
          <span className="cy-ac">{action(r)}</span>
        </div>
        {r.act === 'remind' && actOn(r) ? (
          <Fold open={confirm} id="cy-cf-remind">
            <div className="cy-more">
              <div className="cy-confirm">
                <p>
                  {unbooked != null ? `Each of the ${unbooked}` : 'Each student who has not booked'} gets the {'"Interview times are open"'} email again, with a link to pick an open time in the Portal.
                </p>
                <div className="cy-dact">
                  <button type="button" className="rf-btn rf-btn-gold" data-x="remindGo" onClick={() => remindGo(r)}>
                    <Icon name="send" />
                    <span>{unbooked != null ? `Email ${unbooked} students` : 'Email the students'}</span>
                  </button>
                  <button type="button" className="rf-lnk" data-x="remindBack" onClick={remindBack}>
                    Back
                  </button>
                </div>
              </div>
            </div>
          </Fold>
        ) : null}
      </li>
    );
  };

  // One checklist group: its heading (a fold button for the fixed Applications and Award steps), then its steps.
  const group = (g: (typeof GROUPS)[number], i: number) => {
    const st = stageOf(g)?.state;
    const node =
      st === 'done' ? (
        <span className="cy-node cy-gn cy-done" aria-hidden="true">
          <Icon name="check" />
        </span>
      ) : (
        <span className={`cy-node cy-gn${st === 'now' ? ' cy-now' : ''}`} aria-hidden="true">
          {i + 1}
        </span>
      );
    const nowChip = st === 'now' ? <span className="cy-nowc">Now</span> : null;
    const fixed = fixedSteps(g.id, cycle, now, !live);
    const rs = rows.filter((r) => r.group === g.id);
    const list = rs.length ? <ul>{rs.map(stepRow)}</ul> : null;
    const pcls = pulse === g.id ? ' cy-pulse' : '';
    if (fixed.length) {
      const isOpen = !!open[g.id];
      return (
        <Fragment key={g.id}>
          <button type="button" className={`cy-grp${pcls}`} id={`cy-grp-${g.id}`} data-design-keep={KEEP_GROUP} aria-expanded={isOpen} aria-controls={`cy-st-${g.id}`} onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>
            <span className="cy-gl">
              {node}
              <b>{g.label}</b>
              <span className="cy-gs">{fixedWord(fixed)}</span>
              {nowChip}
            </span>
            <Icon name="down" />
          </button>
          <Fold open={isOpen} id={`cy-st-${g.id}`}>
            <ul className="cy-steps">
              {fixed.map((s) => (
                <li key={s.label}>
                  {s.done ? <Icon name="check" /> : <span className="cy-node cy-node-sm" aria-hidden="true" />}
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </Fold>
          {list}
        </Fragment>
      );
    }
    return (
      <Fragment key={g.id}>
        <p className={`cy-grp${pcls}`} id={`cy-grp-${g.id}`} tabIndex={-1} data-design-keep={KEEP_GROUP}>
          <span className="cy-gl">
            {node}
            <b>{g.label}</b>
            {nowChip}
          </span>
        </p>
        {list}
      </Fragment>
    );
  };

  return (
    <div className="rf cy" ref={rootRef}>
      {liveRegion}
      <CyHead title={title} sub={sub} news={news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.go} gold onClick={() => seeStep(news.id)} /> : null} />
      <div className="cy-grid">
        <div className="cy-main">
          <section className="rf-panel cy-panel" aria-labelledby="cy-sh">
            <div className="rf-ph cy-ph">
              <h2 id="cy-sh">Schedule</h2>
              <span className="cy-r">Eastern time</span>
            </div>
            <div className="rf-pcard">
              {axis ? (
                <div className="cy-axis" aria-hidden="true">
                  <span className="cy-ax-base" />
                  {axis.segs.map((s, j) => (
                    <span key={`s${j}`} className={`cy-ax-seg cy-${s.kind}`} style={{ left: `${s.left}%`, width: `${s.width}%` }} />
                  ))}
                  {axis.pts.map((p, j) => (
                    <span key={`p${j}`} className="cy-ax-pt" style={{ left: `${p.left}%` }} />
                  ))}
                  {axis.today != null ? <span className="cy-ax-today" style={{ left: `${axis.today}%` }} /> : null}
                  {axis.nums.map((n) => (
                    <span key={`n${n.n}`} className="cy-ax-n" style={{ left: `${n.left}%` }}>
                      {n.n}
                    </span>
                  ))}
                  {axis.labels.map((l, j) => (
                    <span key={`l${j}`} className={`cy-ax-lab cy-${l.cls}`} style={{ left: `${l.left}%` }}>
                      {l.text}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="cy-stages">
                {stages.map((st, i) => (
                  <Stage key={st.key} st={st} i={i} onJump={() => jump(st.group)} />
                ))}
              </div>
            </div>
          </section>

          <section className="rf-panel cy-panel" aria-labelledby="cy-lh">
            <div className="rf-ph cy-ph">
              <h2 id="cy-lh">Checklist</h2>
              {view.listFailed ? null : (
                <div className="cy-prog">
                  <StepBar k={prog.done} n={prog.total} ink label={`${prog.done} of ${prog.total} steps done`} />
                  <b>
                    {prog.done} of {prog.total} done
                  </b>
                </div>
              )}
            </div>
            <div className="rf-pcard">
              {view.listFailed ? (
                <StateLine kind="error" retrying={listRetrying} onRetry={retryList}>
                  The checklist didn&apos;t load.
                </StateLine>
              ) : (
                GROUPS.map(group)
              )}
            </div>
          </section>
        </div>
        <CycleChat chat={view.chat} me={view.me} canSend={caps.send} live={live} failSend={!live && !!view.failFirst?.send} stamp={stamp} say={say} enqueue={enqueue} />
      </div>
    </div>
  );
}
