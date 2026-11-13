'use client';

// The refreshed Grants page (demo p-grants, Ops Hub refresh 2026-11-12): the title with the date, the news card (a grant
// waiting on a decision, else the next getting-started step), the phone's Finance tabs, the Pipeline (four stages drawn
// as a track, then the grants under the stages that have any, then "Add a grant"), and "Getting started with grants"
// (steps drawn as a line of marks, then the steps; the one waiting on someone else carries "Waiting on <name>" and a nudge).
// Mock mode changes its own state, like the demo. Live mode writes nothing (lib/grants-map.ts LIVE_CAPS): "Add a grant" is
// the disabled "Coming soon" row, the checklist ticks are drawn, not buttons, and there is no nudge.
import '@/components/refresh/refresh.css';
import './grants.css';
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold, foldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { amountText, cnt, dateLine, doneTitle, grantsNews, groupWords, lateWords, money, nextStep, nudgeText, parseGrant, realCount, STAGES, stepTitle, titleDate } from '@/lib/grants-map';
import { clock, daysFrom, rel } from '@/lib/refresh-time';
import type { GrantItem, GrantsView, GrantStageKey, GrantStep, GrantWho } from '@/lib/grants-view';
import { FinanceTabs, GrantsHead, GrantsSkelBoard } from './grants-skeleton';

type Props = { view: GrantsView; live: boolean };
type Nudge = 'none' | 'draft' | 'sending' | 'closing' | 'sent';

// A person, a group or nobody on a row: the small initial circle (gold when it is the viewer) and the name ("You").
function Who({ who }: { who: GrantWho | null }) {
  if (!who) {
    return (
      <span className="gr-who">
        <em className="gr-unas">Unassigned</em>
      </span>
    );
  }
  if (who.kind === 'group') {
    return (
      <span className="gr-who">
        <span className="gr-av gr-sq" aria-hidden="true">
          <Icon name="people" />
        </span>
        <span className="rf-nowrap">{who.name}</span>
      </span>
    );
  }
  return (
    <span className="gr-who">
      <span className={`gr-av${who.me ? ' gr-me' : ''}`} aria-hidden="true">
        {who.initials}
      </span>
      <span className="rf-nowrap">{who.me ? 'You' : who.name}</span>
    </span>
  );
}

// Whose turn a waiting step is, inside a sentence ("Keith", "the board").
// Set by "Try again", read once the retried board has drawn (survives mock mode's remount).
const retryFocus = { pending: false };

const whoWords =(who: GrantWho) => (who.kind === 'group' ? groupWords(who.name) : who.first);

export function GrantsBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const caps = view.caps;
  const [retrying, startRetry] = useTransition();

  // The page's own state (mock mode changes it like the demo; live mode never writes, so it always follows the server).
  const [grants, setGrants] = useState<GrantItem[]>(view.grants);
  const [added, setAdded] = useState<string[]>([]);
  const [steps, setSteps] = useState<GrantStep[] | null>(view.checklist?.steps ?? null);
  // A live refresh brings new server data: take it in during render (nothing local can be pending, live mode has no writes).
  const [seen, setSeen] = useState(view);
  if (live && seen !== view) {
    setSeen(view);
    setGrants(view.grants);
    setSteps(view.checklist?.steps ?? null);
  }
  const nextId = useRef(0);

  const [addOpen, setAddOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [stepMoment, setStepMoment] = useState<string | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge>('none');
  const [nudgeEdit, setNudgeEdit] = useState(false);
  const [nudgeCustom, setNudgeCustom] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const focusSel = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  // Clears pending timers when the page goes away.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Moves focus where the last action asked for it, after the render that drew the target.
  useLayoutEffect(() => {
    const sel = focusSel.current;
    if (!sel) return;
    focusSel.current = null;
    rootRef.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  });

  // The one polite announcement (cleared first, so the same words are read again).
  const say = (m: string) => {
    setAnnounce('');
    timers.current.push(window.setTimeout(() => setAnnounce(m), 30));
  };

  // How many grants a stage has: the server's count plus the grants added on this page.
  const count = (k: GrantStageKey) => view.counts[k] + grants.filter((g) => g.stage === k && added.includes(g.id)).length;
  const counts = { researching: count('researching'), writing: count('writing'), submitted: count('submitted'), decided: count('decided') };
  const news = view.loadFailed ? null : grantsNews(view.today, grants, counts.submitted, steps);
  const nx = steps ? nextStep(steps) : undefined;

  // "See it" / "Open" on the news card: brings the next step (or the checklist) into view and flashes it.
  const seeNext = () => {
    const root = rootRef.current;
    const el = root?.querySelector<HTMLElement>('.gr-steps li.gr-now') ?? document.getElementById('gr-yh')?.closest('section') ?? null;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.scrollMarginTop = window.innerWidth < 760 ? '72px' : '16px';
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('gr-flash');
    void el.offsetWidth;
    el.classList.add('gr-flash');
    timers.current.push(window.setTimeout(() => el.classList.remove('gr-flash'), 1700));
    // Focus follows the eye: the next step's tick (mock), its nudge, else the checklist heading.
    const target = ['.gr-steps li.gr-now .gr-ck', '.gr-steps li.gr-now .gr-nudge', '#gr-yh'].map((s) => root?.querySelector<HTMLElement>(s)).find((x) => x && x.tagName !== 'SPAN');
    target?.focus({ preventScroll: true });
  };

  // After "Try again" settles, focus lands on the page title (or the Try again button if it failed again), never the body.
  // Kept outside the component: mock mode's retry remounts the board.
  useEffect(() => {
    if (!retryFocus.pending || retrying) return;
    retryFocus.pending = false;
    const root = rootRef.current;
    const el = (view.loadFailed ? root?.querySelector<HTMLElement>('.gr-errline .rf-btn') : null) ?? document.getElementById('gr-h1');
    el?.focus({ preventScroll: true });
  });

  // "Try again" on the error card: mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      retryFocus.pending = true;
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // ---------- Add a grant (mock mode only) ----------
  const parsed = parseGrant(typed);

  // Opens the add field and puts the cursor in it.
  const openAdd = () => {
    setAddOpen(true);
    focusSel.current = '#gr-in';
  };

  // Closes the add field (Escape, or leaving it empty); `refocus` puts focus back on "Add a grant".
  const closeAdd = (refocus: boolean) => {
    setAddOpen(false);
    setTyped('');
    if (refocus) focusSel.current = '[data-k="gr:open"]';
  };

  // Adds the typed grant to Researching (after the other Researching rows), with "Added 9:14 AM · Undo".
  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!caps.add) return;
    if (!parsed.name) {
      focusSel.current = '#gr-in';
      return;
    }
    const g: GrantItem = {
      id: `new-${(nextId.current += 1)}`,
      name: parsed.name,
      funder: null,
      amountCents: parsed.amountCents,
      upTo: parsed.upTo,
      stage: 'researching',
      outcome: null,
      deadlineOn: null,
      dateNote: null,
      submittedOn: null,
      decidedOn: null,
      owner: null,
    };
    setGrants((list) => {
      const firstOther = list.findIndex((x) => x.stage !== 'researching');
      return firstOther < 0 ? [...list, g] : [...list.slice(0, firstOther), g, ...list.slice(firstOther)];
    });
    setAdded((a) => [...a, g.id]);
    setSaved(g.id);
    setTyped('');
    focusSel.current = '#gr-in';
    say(`Added to Researching: ${g.name}`);
  };

  // Undo the added grant: it goes, focus returns to "Add a grant".
  const undoAdd = (id: string) => {
    setGrants((list) => list.filter((g) => g.id !== id));
    setAdded((a) => a.filter((x) => x !== id));
    setSaved(null);
    focusSel.current = addOpen ? '#gr-in' : '[data-k="gr:open"]';
    say('Grant removed');
  };

  // Escape in the add field closes it.
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeAdd(true);
  };

  // Leaving the add field empty closes it (as the demo does), unless focus moved to the field's own button.
  const onAddBlur = () => {
    timers.current.push(
      window.setTimeout(() => {
        const form = rootRef.current?.querySelector('form[data-form="grant"]');
        const input = rootRef.current?.querySelector<HTMLInputElement>('#gr-in');
        if (form && !form.contains(document.activeElement) && input && !input.value.trim()) closeAdd(false);
      }, 150),
    );
  };

  // "N" anywhere outside a field opens the add field (mock mode only: live has no adding).
  useEffect(() => {
    if (!caps.add || view.loadFailed) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')) {
        e.preventDefault();
        setAddOpen(true);
        focusSel.current = '#gr-in';
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [caps.add, view.loadFailed]);

  // ---------- Checklist (mock mode only) ----------

  // Ticks a step done (or open again), with "Done · Undo" under it; an open nudge draft closes.
  const tick = (id: string) => {
    if (!caps.tick || !steps) return;
    const s = steps.find((x) => x.id === id);
    if (!s) return;
    const done = !s.done;
    setSteps(steps.map((x) => (x.id === id ? { ...x, done } : x)));
    setStepMoment(id);
    setPopped(done ? id : null);
    if (nudge === 'draft') setNudge('none');
    focusSel.current = `[data-k="s:${id}:undo"]`;
    say(done ? 'Done. Undo available.' : 'Reopened');
  };

  // Undo of a tick: the step goes back, focus returns to its check.
  const undoTick = (id: string) => {
    if (!steps) return;
    setSteps(steps.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
    setStepMoment(null);
    setPopped(null);
    focusSel.current = `[data-k="s:${id}"]`;
    say('Undone');
  };

  // "Nudge <name>": opens (or closes) the drafted message under the step.
  const toggleNudge = () => {
    const open = nudge !== 'draft';
    setNudge(open ? 'draft' : 'none');
    if (open) timers.current.push(window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('[data-k="s:nsend"]')?.focus({ preventScroll: true }), 30));
  };

  // Cancel closes the draft and forgets any edit.
  const cancelNudge = () => {
    setNudge('none');
    setNudgeEdit(false);
    setNudgeCustom(null);
    focusSel.current = '[data-k="s:nudge"]';
  };

  // Send (mock): "Sending…", the draft folds away, then "Nudged just now".
  const sendNudge = (s: GrantStep) => {
    const ta = rootRef.current?.querySelector<HTMLTextAreaElement>('[data-k="s:ntext"]');
    if (ta && ta.value.trim()) setNudgeCustom(ta.value.trim());
    setNudge('sending');
    const name = s.who?.kind === 'person' ? s.who.name : s.who ? s.who.name : '';
    timers.current.push(
      window.setTimeout(() => {
        setNudge('closing');
        timers.current.push(
          window.setTimeout(() => {
            setNudge('sent');
            setNudgeEdit(false);
            focusSel.current = '[data-k="s:nudged"]';
            say(`Nudge sent to ${name}`);
          }, foldMs()),
        );
      }, 450),
    );
  };

  // ---------- Drawing ----------

  // The pipeline: the four-stage track, the grants under each stage that has any, then "Add a grant".
  const pipeline = () => {
    const groups = STAGES.filter((st) => grants.some((g) => g.stage === st.key));
    return (
      <Panel
        id="gr-ph"
        title="Pipeline"
        className="gr-pipe"
        action={
          <span className="gr-pm">
            {realCount(counts) ? null : (
              <>
                Won so far <b>{money(0)}</b>
              </>
            )}
          </span>
        }
      >
        <ol className="gr-track" aria-label="Grants by stage">
          {STAGES.map((st, i) => {
            const n = counts[st.key];
            return (
              <li key={st.key} className={`gr-stg${n ? ' gr-has' : ''}`}>
                <span className="gr-sn">{cnt(n)}</span>
                <span className="gr-sl">{st.label}</span>
                {i < STAGES.length - 1 ? <Icon name="chev" className="gr-sa" /> : null}
              </li>
            );
          })}
        </ol>
        {groups.length ? (
          groups.map((st) => {
            const rows = grants.filter((g) => g.stage === st.key);
            const more = counts[st.key] - rows.length;
            return (
              <div key={st.key} className="gr-stage">
                <h3 className="gr-stage-h">{st.label}</h3>
                <ul className="gr-grs">
                  {rows.map((g) => {
                    const dl = dateLine(view.today, g);
                    return (
                      <li key={g.id} className={saved === g.id ? 'gr-fresh' : undefined}>
                        <span className="gr-gn">
                          <b>{g.name}</b>
                          <span className="gr-meta">
                            <span>{g.funder ?? 'Funder not set'}</span>
                            <Who who={g.owner} />
                          </span>
                        </span>
                        <span className="gr-ga">
                          <b>{amountText(g)}</b>
                          <span className={dl.late ? 'rf-late gr-gdl' : 'gr-gdt'} title={dl.title ?? undefined}>
                            {dl.text}
                          </span>
                        </span>
                        {saved === g.id ? (
                          <span className="gr-moment gr-sm">
                            <span className="gr-tick" aria-hidden="true">
                              <Icon name="check" />
                            </span>
                            Added {clock(view.now)}&nbsp;·&nbsp;
                            {caps.addUndo ? (
                              <button type="button" className="rf-lnk" data-k="gr:undo" onClick={() => undoAdd(g.id)}>
                                Undo
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {more > 0 ? (
                  <p className="gr-more">
                    {cnt(more)} more {st.label.toLowerCase()}
                  </p>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="gr-empty">Nothing in the pipeline yet.</p>
        )}
        <div className="gr-add">
          {!caps.add ? (
            // Live: money writes are off (owner, 2026-10-12), so "Add a grant" is drawn disabled with "Coming soon".
            <button type="button" className="gr-add-open gr-soon" disabled aria-disabled="true">
              <span className="gr-plus" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="gr-lab">Add a grant</span>
              <span className="gr-soontag">Coming soon</span>
            </button>
          ) : addOpen ? (
            <form className="gr-add-form" data-form="grant" autoComplete="off" onSubmit={submitAdd}>
              <div className="gr-add-field">
                <span className="gr-plus" aria-hidden="true">
                  <Icon name="plus" />
                </span>
                <input
                  id="gr-in"
                  type="text"
                  enterKeyHint="done"
                  aria-label="New grant. Type its name and the amount; up to marks the most it can be."
                  placeholder="e.g. Community foundation grant up to $5,000"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={onAddKey}
                  onBlur={onAddBlur}
                />
                <button className="rf-btn rf-btn-gold" type="submit" disabled={!parsed.name}>
                  Add grant
                </button>
              </div>
              <div className="gr-chips">
                {typed.trim() ? (
                  <>
                    {parsed.amountCents != null ? (
                      <span className="gr-pchip">
                        {parsed.upTo ? 'Up to ' : ''}
                        {money(parsed.amountCents)}
                      </span>
                    ) : (
                      <span className="gr-pchip gr-ink">No amount yet</span>
                    )}
                    <span className="gr-pchip gr-ink">Researching</span>
                  </>
                ) : null}
              </div>
            </form>
          ) : (
            <button type="button" className="gr-add-open" data-k="gr:open" onClick={openAdd}>
              <span className="gr-plus" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="gr-lab">Add a grant</span>
              <span className="gr-kbd" aria-hidden="true">
                N
              </span>
            </button>
          )}
        </div>
      </Panel>
    );
  };

  // One checklist step: the tick, the eyebrow (when · kind · Next), the title, who, and the waiting line with the nudge.
  const stepRow = (s: GrantStep) => {
    const now = s === nx;
    const mine = s.who?.kind === 'person' && s.who.me;
    const late = !s.done && s.due != null && daysFrom(view.today, s.due) < 0;
    const waiting = now && s.who && !mine;
    const canNudge = waiting && caps.nudge && s.who?.kind === 'person';
    const due = s.done ? (
      <span className="gr-when gr-soft" title={doneTitle(view.today, s.due)}>
        Done
      </span>
    ) : late && s.due ? (
      <span className="rf-late gr-late" title={stepTitle(view.today, s.due)}>
        {lateWords(view.today, s.due)}
      </span>
    ) : (
      <span className="gr-when" title={stepTitle(view.today, s.due)}>
        {rel(view.today, s.due)}
      </span>
    );
    const nudgeBtn =
      nudge === 'sent' ? (
        <span className="gr-nudged" tabIndex={-1} data-k="s:nudged">
          <Icon name="check" />
          Nudged just now
        </span>
      ) : (
        <button type="button" className="gr-nudge" aria-expanded={nudge === 'draft' || nudge === 'sending'} data-k="s:nudge" onClick={toggleNudge}>
          Nudge {s.who?.kind === 'person' ? s.who.first : ''}
        </button>
      );
    return (
      <li key={s.id} className={`${s.done ? 'gr-on' : ''}${now ? ' gr-now' : ''}${now && mine ? ' gr-mine' : ''}`}>
        {caps.tick ? (
          <button
            type="button"
            className={`gr-ck${s.done ? ' gr-on' : ''}${popped === s.id ? ' gr-pop' : ''}`}
            aria-pressed={s.done}
            data-k={`s:${s.id}`}
            aria-label={`Done: ${s.title}`}
            onClick={() => tick(s.id)}
          >
            <Icon name="check" />
          </button>
        ) : (
          <span className={`gr-ck${s.done ? ' gr-on' : ''}`} aria-hidden="true">
            <Icon name="check" />
          </span>
        )}
        <span className="gr-main">
          <span className="gr-eb">
            {due}
            {s.kind ? <span className="gr-kw">{s.kind}</span> : null}
            {now ? <span className="gr-nowtag">Next</span> : null}
          </span>
          <span className="gr-st">{s.title}</span>
          <span className="gr-meta">
            <Who who={s.who} />
            {stepMoment === s.id && caps.tick ? (
              <span className="gr-moment gr-sm">
                <span className="gr-tick gr-ink" aria-hidden="true">
                  <Icon name="check" />
                </span>
                {s.done ? 'Done' : 'Reopened'}&nbsp;·&nbsp;
                <button type="button" className="rf-lnk" data-k={`s:${s.id}:undo`} onClick={() => undoTick(s.id)}>
                  Undo
                </button>
              </span>
            ) : null}
          </span>
          {waiting && s.who ? (
            nudge === 'sent' && canNudge ? (
              <span className="gr-waitbar gr-done">{nudgeBtn}</span>
            ) : (
              <span className="gr-waitbar">
                <span className="gr-wt">
                  <Icon name="wait" />
                  Waiting on {whoWords(s.who)}
                </span>
                {canNudge ? nudgeBtn : null}
              </span>
            )
          ) : null}
          {canNudge && s.who?.kind === 'person' ? (
            <Fold open={nudge === 'draft' || nudge === 'sending'}>
              <span className="gr-sub-in">
                <span className="gr-draft">
                  <span className="gr-dl">
                    To <span className="rf-nowrap">{s.who.name}</span> in Board chat
                  </span>
                  {nudgeEdit ? (
                    <textarea className="gr-dtext" rows={3} data-k="s:ntext" aria-label="Message" defaultValue={nudgeCustom ?? nudgeText(view.today, s)} />
                  ) : (
                    <span className="gr-dtext">{nudgeCustom ?? nudgeText(view.today, s)}</span>
                  )}
                  <span className="gr-dact">
                    <button type="button" className="rf-btn" data-k="s:nsend" disabled={nudge === 'sending' || nudge === 'closing'} onClick={() => sendNudge(s)}>
                      <Icon name="send" />
                      <span>{nudge === 'sending' || nudge === 'closing' ? 'Sending…' : 'Send'}</span>
                    </button>
                    <button
                      type="button"
                      className="rf-lnk"
                      onClick={() => {
                        setNudgeEdit(true);
                        focusSel.current = '[data-k="s:ntext"]';
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="rf-lnk" onClick={cancelNudge}>
                      Cancel
                    </button>
                  </span>
                </span>
              </span>
            </Fold>
          ) : null}
        </span>
      </li>
    );
  };

  // "Getting started with grants": done count, the line of marks, then the steps (or its own error line).
  const checklist = () => {
    const title = view.checklist?.title ?? 'Getting started with grants';
    if (!steps) {
      return (
        <Panel id="gr-yh" title={title} className="gr-ye">
          <StateLine kind="error" onRetry={retry} retrying={retrying}>
            {title} didn&apos;t load.
          </StateLine>
        </Panel>
      );
    }
    const done = steps.filter((s) => s.done).length;
    // Drawn without <Panel>: the done count sits beside the heading (the demo's .ph-l), not at the right edge.
    return (
      <section className="rf-panel gr-ye" aria-labelledby="gr-yh">
        <div className="rf-ph">
          <div className="gr-ph-l">
            <h2 id="gr-yh" tabIndex={-1}>
              {title}
            </h2>
            {steps.length ? <span className="gr-pm">{`${done} of ${steps.length} done`}</span> : null}
          </div>
        </div>
        <div className="rf-pcard">
          {steps.length ? (
            <>
              <div className="gr-pbody">
                <div className="gr-cl-bar" aria-hidden="true">
                  {steps.map((s) => (
                    <span key={s.id} className={s.done ? 'gr-on' : s === nx ? 'gr-now' : undefined} />
                  ))}
                </div>
              </div>
              <ol className="gr-steps">{steps.map(stepRow)}</ol>
            </>
          ) : (
            <p className="gr-empty">No steps yet.</p>
          )}
        </div>
      </section>
    );
  };

  const newsCard = news ? <NewsCard icon={news.icon} kicker={news.kicker} title={news.title} go={news.go} gold={news.gold} onClick={seeNext} /> : null;

  return (
    <div className="rf gr" ref={rootRef}>
      <GrantsHead date={titleDate(view.today)} news={newsCard} />
      <FinanceTabs budgetCount={view.budgetCount} />
      {view.loadFailed ? (
        retrying ? (
          <div aria-busy="true">
            <GrantsSkelBoard />
          </div>
        ) : (
          <section className="rf-panel" aria-label="Grants">
            <div className="rf-pcard">
              <p className="gr-errline" role="alert">
                <span>
                  <Icon name="alert" />
                  Grants didn&apos;t load.
                </span>
                <button type="button" className="rf-btn" onClick={retry}>
                  Try again
                </button>
              </p>
            </div>
          </section>
        )
      ) : (
        <div className="gr-board">
          <div className="gr-col gr-col-a">{pipeline()}</div>
          <div className="gr-col gr-col-b">{checklist()}</div>
        </div>
      )}
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
