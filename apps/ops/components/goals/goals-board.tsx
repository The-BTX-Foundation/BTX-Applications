'use client';

// The refreshed Goals page (demo p-goals, Ops Hub refresh 2026-11-11): the title with the year picker, the news card (the
// money still to raise), this year's goals drawn as bars, steps and marks, "Scholars funded, by award cycle", and "Year
// over year", where a past year's figure is typed in once (open, Save, Cancel, then "Saved · Undo").
// Mock mode changes its own state, like the demo. Live mode writes year_figures (components/goals/goals-writes.ts):
// optimistic, serialized per cell; a refused write puts the cell back to the server's data and reloads it on the next
// refresh (the figure boxes' state machine is lib/goals-figures.ts, unit-tested).
import '@/components/refresh/refresh.css';
import './goals.css';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { Panel } from '@/components/refresh/panel';
import { clock } from '@/lib/refresh-time';
import { chain, figReducer, initFigs, refusalFocus, SAVE_ERR, undoOutcome, type FigAction, type Figs } from '@/lib/goals-figures';
import { count, cyclesTotal, figureKey, goalsNews, money, moneyUp, parseFigure, parseKey, yearDone } from '@/lib/goals-map';
import type { CycleRow, FigureMetric, GoalRow, GoalStatus, GoalsView } from '@/lib/goals-view';
import { GoalsHead, GoalsSkelCard } from './goals-skeleton';
import { saveFigure, undoFigure } from './goals-writes';

const STATUS: Record<GoalStatus, string> = {
  in_planning: 'In planning',
  in_progress: 'In progress',
  on_track: 'On track',
  at_risk: 'At risk',
  met: 'Goal met',
  missed: 'Missed',
  not_started: 'Not started',
};

const METRICS: { id: FigureMetric; label: string; icon: 'money' | 'people' }[] = [
  { id: 'money_raised_cents', label: 'Money raised', icon: 'money' },
  { id: 'applicants', label: 'Applicants', icon: 'people' },
];

/** Past this many steps or applicants, one slim bar replaces a box or mark each. */
const MAX_MARKS = 40;

type Props = { view: GoalsView; live: boolean };

// A figure as the page shows it: dollars for money (from cents), a plain count for applicants.
const showFigure = (metric: FigureMetric, v: number) => (metric === 'money_raised_cents' ? money(v) : count(v));

// The figures as a key -> value map ("money_raised_cents:2023" -> cents).
const figureMap = (view: GoalsView): Figs => Object.fromEntries(view.figures.map((f) => [figureKey(f.metric, f.year), f.value]));

// The signature of the server's figures: a change means fresh data to take in.
const figSig = (view: GoalsView) => view.figures.map((f) => `${f.metric}:${f.year}:${f.value}`).join('|');

// One slim bar for a count (steps or applicants past MAX_MARKS).
function CountBar({ have, of, label }: { have: number; of: number; label: string }) {
  return (
    <div className="gl-mbar" role="img" aria-label={label}>
      <span className="gl-f" style={{ width: `${Math.min(1, have / of) * 100}%` }} />
    </div>
  );
}

// The drawing of one goal: a money bar with today's mark, step boxes, or one mark per applicant (a slim bar past 40).
function GoalDraw({ g, done }: { g: GoalRow; done: number }) {
  if (g.uncounted) {
    return (
      <p className="gl-uncount">
        <Icon name="alert" />
        Couldn&apos;t count. Check your connection, then try again.
      </p>
    );
  }
  if (g.of <= 0) return g.kind === 'money' ? <p className="gl-mbar-l">No target set</p> : null;
  if (g.kind === 'money') {
    const f = Math.min(1, g.have / g.of);
    return (
      <>
        <div className="gl-mbar" role="img" aria-label={`${Math.round((g.have / g.of) * 100)}% of ${money(g.of)}; the year is ${Math.round(done * 100)}% through`}>
          <span className="gl-f" style={{ width: `${f * 100}%` }} />
          <span className="gl-now" style={{ left: `${done * 100}%` }} />
        </div>
        <div className="gl-mbar-l" aria-hidden="true">
          <span>$0</span>
          <span>{money(g.of)}</span>
        </div>
      </>
    );
  }
  const label = g.kind === 'steps' ? `${g.have} of ${g.of} steps done` : `${g.have} of ${g.of} ${g.unit}`;
  if (g.of > MAX_MARKS) return <CountBar have={g.have} of={g.of} label={label} />;
  return (
    <div className={g.kind === 'steps' ? 'gl-steps' : 'gl-marks'} role="img" aria-label={label}>
      {Array.from({ length: g.of }, (_, k) => (
        <span key={k} className={k < g.have ? 'gl-on' : ''} />
      ))}
    </div>
  );
}

// The number at the end of a goal row (none when the goal could not be counted).
function GoalValue({ g }: { g: GoalRow }) {
  if (g.uncounted) return null;
  if (g.kind === 'money') {
    if (g.of > 0 && g.have > g.of) {
      return (
        <>
          <b>{money(g.have)}</b>
          <span>{money(g.have - g.of)} over</span>
        </>
      );
    }
    return (
      <>
        <b>{money(g.have)}</b>
        <span>{g.of > 0 ? `${g.unit} of ${money(g.of)}` : g.unit}</span>
      </>
    );
  }
  return (
    <>
      <b>
        {g.have} of {g.of}
      </b>
      <span>{g.unit}</span>
    </>
  );
}

// One goal row: icon | name and status | the drawing | the number.
function Goal({ g, done }: { g: GoalRow; done: number }) {
  return (
    <div className={`gl-goal${g.lead ? ' gl-k-gold' : ''}`}>
      <span className="gl-kt" aria-hidden="true">
        <Icon name={g.icon} />
      </span>
      <div className="gl-name">
        <span className="gl-t">{g.title}</span>
        <span className="gl-sub">
          <span className={`gl-st gl-s-${g.status}`}>{STATUS[g.status]}</span>
          {g.note ? <span>{g.note}</span> : null}
        </span>
      </div>
      <div className="gl-draw">
        <GoalDraw g={g} done={done} />
      </div>
      <div className="gl-val">
        <GoalValue g={g} />
      </div>
    </div>
  );
}

// "Scholars funded, by award cycle": one slim bar per cycle, the cycle being decided as a dashed "?" bar.
function Cycles({ rows }: { rows: CycleRow[] }) {
  if (rows.length === 0) {
    return (
      <ul className="gl-cyc">
        <li className="gl-cnone">No scholarships awarded yet.</li>
      </ul>
    );
  }
  const max = Math.max(1, ...rows.map((r) => r.count ?? 0));
  return (
    <ul className="gl-cyc">
      {rows.map((r) =>
        r.count == null ? (
          <li key={r.label} className="gl-next">
            <span className="gl-cl">{r.label}</span>
            <span className="gl-cb" aria-hidden="true">
              <i className="gl-dash" style={{ width: `${(1 / max) * 100}%` }} />
            </span>
            <span className="gl-cn">
              <span aria-hidden="true">?</span>
              <span className="rf-sr">not decided yet</span>
            </span>
            {r.note ? <span className="gl-cnote">{r.note}</span> : null}
          </li>
        ) : (
          <li key={r.label}>
            <span className="gl-cl">{r.label}</span>
            <span className="gl-cb" role="img" aria-label={`${r.count} funded`}>
              <i style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="gl-cn">{r.count}</span>
          </li>
        ),
      )}
    </ul>
  );
}

// The page.
export function GoalsBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps } = view;
  const [year, setYear] = useState(view.year);
  const reducer = useMemo(() => figReducer(caps), [caps]);
  const [st, dispatch] = useReducer(reducer, undefined, () => initFigs(figureMap(view), figSig(view), view.openFigure, caps));
  const { figs, open, typed, err, saved, bad } = st;
  const [flash, setFlash] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();

  // Live writes still running, whether the server data on hand predates a write, and the refresh once they settle. New
  // server figures are taken in only when no write is running, the data is not stale and no refresh is pending (or when a
  // refused write forced a reload: lib/goals-figures.ts).
  const [busy, setBusy] = useState(0);
  const [stale, setStale] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const sig = figSig(view);
  const quiet = busy === 0 && !stale && !refreshing;
  if (sig !== st.seenSig && quiet) dispatch({ type: 'server', sig, figs: figureMap(view), quiet });

  const queue = useRef(new Map<string, Promise<unknown>>());
  const running = useRef(0);
  // Where focus goes after the next render: the first of these selectors that exists.
  const focusSel = useRef<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(0);
  const flashT = useRef(0);
  // The latest server figures, for putting a refused cell back (read inside write callbacks that outlive a render).
  const serverRef = useRef<Figs>(figureMap(view));
  useEffect(() => {
    serverRef.current = figureMap(view);
  }, [view]);
  // The boxes' state as last drawn (refusal focus is decided on it, inside write callbacks).
  const stRef = useRef(st);
  useEffect(() => {
    stRef.current = st;
  }, [st]);
  // Each save's number (newest wins) and its live result (an Undo of a refused save has nothing to undo).
  const seqRef = useRef(0);
  const saveResults = useRef(new Map<number, Promise<boolean>>());

  const done = useMemo(() => yearDone(view.today), [view.today]);
  const isThisYear = year === view.year;
  const goals = isThisYear ? view.goals : [];
  const news = isThisYear ? goalsNews(view.goals) : null;

  // The mock clock starts at the sample's 9:14 AM when the page opens (the demo's "now").
  useEffect(() => {
    mountedAt.current = Date.now();
    return () => window.clearTimeout(flashT.current);
  }, []);

  // Moves focus where the last action asked (after the render that drew the target).
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

  // "9:14 AM": the real Eastern time in live mode; the sample's 9:14 AM plus the minutes since the page opened in mock mode.
  const stamp = () => {
    if (live) return clock(new Date().toISOString());
    const m = Math.min(23 * 60 + 59, 9 * 60 + 14 + Math.floor((Date.now() - mountedAt.current) / 60_000));
    return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
  };

  // Runs a live write after every earlier write on the same cell, counting it as running until it settles. When the last
  // one settles (and its own success or failure handling has run), one refresh fetches fresh server data.
  const enqueue = <T,>(k: string, write: () => Promise<T>): Promise<T> => {
    const next = chain(queue.current, k, write);
    running.current += 1;
    setBusy((b) => b + 1);
    setStale(true);
    void next.finally(() =>
      window.setTimeout(() => {
        if (queue.current.get(k) === next) queue.current.delete(k);
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

  // Opens one cell's figure box (one at a time) and puts the cursor in it.
  const openCell = (k: string) => {
    dispatch({ type: 'open', k });
    focusSel.current = ['#gl-in'];
  };

  // Closes the box without saving; focus goes back to that cell's Add.
  const cancel = () => {
    const k = open;
    dispatch({ type: 'cancel' });
    if (k) focusSel.current = [`[data-cell="${k}"]`, `[data-row="${k}"]`];
  };

  // Saves the typed figure: drawn at once with "Saved · Undo"; in live mode a refusal puts the cell back to the server's
  // value and reopens its box with what was typed (or, if another box is open, shows the error under the list).
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!open) return;
    const k = open;
    const { metric, year: y } = parseKey(k);
    const parsed = parseFigure(metric, typed);
    if (!parsed.ok) {
      dispatch({ type: 'invalid', error: parsed.error });
      focusSel.current = ['#gl-in'];
      return;
    }
    const text = typed;
    const seq = (seqRef.current += 1);
    dispatch({ type: 'save', k, value: parsed.value, at: stamp(), seq });
    setFlash(k);
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlash(null), 1600);
    focusSel.current = caps.figureUndo ? ['[data-x="undo"]'] : [`[data-row="${k}"]`];
    // The "Saved ... · Undo" line is not a live region, so this is the one announcement.
    say(caps.figureUndo ? 'Saved. Undo available.' : 'Saved.');
    if (!live) return;
    const result = enqueue(k, () => saveFigure(y, metric, parsed.value));
    // Kept so an Undo of this save can tell whether there is anything to undo (lib/goals-figures.ts undoOutcome).
    saveResults.current.set(seq, result);
    void result.then((ok) => {
      if (ok) return;
      refuse({ type: 'saveRefused', k, seq, text, server: serverRef.current });
    });
  };

  // Applies a refusal, moving focus only when no other box is open (the person typing elsewhere keeps their place).
  const refuse = (a: Extract<FigAction, { type: 'saveRefused' | 'undoRefused' }>) => {
    const target = refusalFocus(stRef.current, a);
    dispatch(a);
    if (target) focusSel.current = target;
  };

  // Undo the last save: the figure goes, the box opens again (live mode writes the reverse, only over our own value).
  const undo = () => {
    if (!saved) return;
    const { k, before, value, seq } = saved;
    const { metric, year: y } = parseKey(k);
    dispatch({ type: 'undo' });
    focusSel.current = before == null ? ['#gl-in'] : [`[data-row="${k}"]`];
    say(before == null ? 'Undone. The figure was removed.' : 'Undone.');
    if (!live) return;
    const saveOk = saveResults.current.get(seq) ?? Promise.resolve(true);
    // Runs after the save (same cell queue). A refused save leaves nothing to undo: no write and no second error.
    void enqueue(k, async () => {
      const ok = await saveOk;
      return undoOutcome(ok, ok ? await undoFigure(y, metric, value, before) : false);
    }).then((outcome) => {
      if (outcome !== 'refused') return;
      // Refused, or a colleague changed the figure first: the saved figure stays on screen with the error line.
      refuse({ type: 'undoRefused', k, seq, value });
    });
  };

  // Escape in the figure box closes it.
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    cancel();
  };

  // "Try again" on the error card: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // "See it" on the news card: brings the goals into view.
  const seeGoals = () => {
    const el = document.getElementById('gl-gh')?.closest('section');
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const picker =
    view.years.length > 1 ? (
      <label className="gl-ypick">
        <span>{year}</span>
        <Icon name="down" />
        <select
          aria-label="Year"
          value={year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setYear(y);
            say(`${y} goals`);
          }}
        >
          {view.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  const newsCard =
    news && !view.loadFailed ? <NewsCard icon="money" kicker={`${moneyUp(news.left)} to go, by Dec 31`} title={news.title} go="See it" onClick={seeGoals} /> : null;

  return (
    <div className="rf gl" ref={rootRef}>
      <GoalsHead picker={picker} news={newsCard} />

      {view.loadFailed ? (
        retrying ? (
          <div aria-busy="true">
            <GoalsSkelCard />
          </div>
        ) : (
          <div className="gl-errcard gl-err" role="alert">
            <p>
              <Icon name="alert" />
              Check your connection, then try again.
            </p>
            <button type="button" className="rf-btn rf-btn-gold" onClick={retry}>
              Try again
            </button>
          </div>
        )
      ) : (
        <>
          <Panel
            id="gl-gh"
            title={`${year} goals`}
            action={
              goals.some((g) => g.kind === 'money') ? (
                <span className="gl-aside">
                  <span className="gl-key-now" aria-hidden="true" />
                  Today, {Math.round(done * 100)}% through the year
                </span>
              ) : null
            }
          >
            {goals.length ? goals.map((g) => <Goal key={g.id} g={g} done={done} />) : <p className="gl-none">Goals the board sets for the year show here, counted from what is logged in the app.</p>}
          </Panel>

          <div className="gl-lower">
            <Panel id="gl-ch" title="Scholars funded, by award cycle" action={view.cycles.length ? <span className="gl-aside">{cyclesTotal(view.cycles)}</span> : null}>
              <Cycles rows={view.cycles} />
            </Panel>
            <Panel id="gl-yh" title="Year over year">
              <div className="gl-yoy">
                {METRICS.map((m) => {
                  const vals = view.yoyYears.map((y) => figs[figureKey(m.id, y)]).filter((v): v is number => v != null);
                  const max = Math.max(1, ...vals);
                  const isMoney = m.id === 'money_raised_cents';
                  return (
                    <div key={m.id} className="gl-metric">
                      <h3>
                        <span className="gl-kt gl-sm" aria-hidden="true">
                          <Icon name={m.icon} />
                        </span>
                        {m.label}
                      </h3>
                      {view.yoyYears.map((y) => {
                        const k = figureKey(m.id, y);
                        const v = figs[k];
                        const isOpen = caps.figure && open === k;
                        return (
                          <div key={k} className={`gl-yr${isOpen ? ' gl-open' : ''}${flash === k ? ' gl-flash' : ''}`} data-row={k} tabIndex={-1}>
                            <span className="gl-y">{y}</span>
                            {isOpen ? (
                              <>
                                <form className="gl-yform" onSubmit={submit} autoComplete="off" noValidate>
                                  <label className="gl-yfield">
                                    {isMoney ? <span aria-hidden="true">$</span> : null}
                                    <input
                                      id="gl-in"
                                      data-k={k}
                                      inputMode={isMoney ? 'decimal' : 'numeric'}
                                      enterKeyHint="done"
                                      placeholder={isMoney ? 'Amount' : 'Number'}
                                      aria-label={`${m.label}, ${y}`}
                                      aria-invalid={err ? true : undefined}
                                      aria-describedby={err ? 'gl-yerr' : undefined}
                                      value={typed}
                                      onChange={(e) => dispatch({ type: 'type', text: e.target.value })}
                                      onKeyDown={onInputKey}
                                    />
                                  </label>
                                  <button className="rf-btn rf-btn-gold" type="submit">
                                    Save
                                  </button>
                                  <button className="rf-lnk" type="button" onClick={cancel}>
                                    Cancel
                                  </button>
                                </form>
                                {err ? (
                                  <p className="gl-yerr" id="gl-yerr" role="alert">
                                    {err}
                                  </p>
                                ) : null}
                              </>
                            ) : v == null ? (
                              <>
                                <span className="gl-ybar gl-empty" aria-hidden="true" />
                                {caps.figure ? (
                                  <button type="button" className="gl-yadd" data-cell={k} onClick={() => openCell(k)}>
                                    <Icon name="plus" />
                                    Add<span className="rf-sr"> {m.label.toLowerCase()} for {y}</span>
                                  </button>
                                ) : (
                                  <span className="gl-v gl-v-none">Not entered</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="gl-ybar" aria-hidden="true">
                                  <i style={{ width: `${(v / max) * 100}%` }} />
                                </span>
                                <span className="gl-v">{showFigure(m.id, v)}</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {saved && parseKey(saved.k).metric === m.id ? (
                        <p className="gl-after">
                          <span className="rf-tick" aria-hidden="true">
                            <Icon name="check" />
                          </span>
                          Saved {parseKey(saved.k).year}, {saved.at}
                          {caps.figureUndo ? (
                            <>
                              {' '}
                              <span aria-hidden="true">·</span>{' '}
                              <button type="button" className="rf-lnk" data-x="undo" onClick={undo}>
                                Undo
                              </button>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {bad && parseKey(bad).metric === m.id ? (
                        <p className="gl-after gl-bad" role="alert">
                          <Icon name="alert" />
                          {SAVE_ERR}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </>
      )}
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
