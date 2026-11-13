'use client';

// The refreshed Fundraising page (demo p-fundraising, Ops Hub refresh 2026-11-12): the title with the date, the news card
// (the money still to raise by Dec 31), "2026 giving" (raised against the goal, the donors as marks, where the money came
// from), "Recent gifts" with "Log a gift", and the "Year-end giving" checklist with the next step's "Waiting on" line.
// Mock mode changes its own state, like the demo (log a gift and Undo, tick a step and Undo, nudge the next step's owner).
// Live mode draws the same page read-only: money writes stay off (owner, 2026-10-12), so "Log a gift" is a disabled
// "Coming soon" row, and no checklist tick or Board chat nudge is wired here (view.caps says what is drawn).
import '@/components/refresh/refresh.css';
import './fundraising.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Fold, useFoldMs } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { clock, fullDate } from '@/lib/refresh-time';
import {
  applyGift,
  cnt,
  dateLabel,
  dollars,
  dollarsUp,
  frControls,
  fundraisingNews,
  nextStep,
  nudgeText,
  parseGift,
  pct,
  sourceLabel,
  stepDue,
  toggleStep,
  waitsOnOther,
  type GiftTotals,
} from '@/lib/fundraising-map';
import type { FrChecklist, FrGift, FrOwner, FrStep, FundraisingView } from '@/lib/fundraising-view';
import { FinanceTabs, SkelBoard } from './fundraising-skeleton';

type Props = { view: FundraisingView; live: boolean };

/** A gift logged in mock mode, with the time its "Saved" line shows. */
type LoggedGift = FrGift & { at: string };

/** Where the next step's Board chat nudge is: closed, drafted, being sent, folding shut after sending, or sent. */
type NudgeState = 'none' | 'draft' | 'sending' | 'closing' | 'sent';

// The figures a logged gift changes, taken from the server's view.
const totalsOf = (v: FundraisingView): GiftTotals => ({
  raisedCents: v.raisedCents,
  donors: v.donors,
  newDonors: v.newDonors,
  monthlyDonors: v.monthlyDonors,
  sources: v.sources,
});

// The person or group a step belongs to: an avatar and a name ("You" for the viewer), or "Unassigned".
function Who({ owner, me }: { owner: FrOwner; me: string }) {
  if (owner.kind === 'none') {
    return (
      <span className="fr-who">
        <em className="fr-unas">Unassigned</em>
      </span>
    );
  }
  if (owner.kind === 'group') {
    return (
      <span className="fr-who">
        <span className="fr-av fr-sq" aria-hidden="true">
          <Icon name="people" />
        </span>
        <span className="rf-nowrap">{owner.name}</span>
      </span>
    );
  }
  const mine = owner.id === me;
  return (
    <span className="fr-who">
      <span className={`fr-av${mine ? ' fr-me' : ''}`} aria-hidden="true">
        {owner.initials}
      </span>
      <span className="rf-nowrap">{mine ? 'You' : owner.name}</span>
    </span>
  );
}

// The start of a step's eyebrow: "Done", the late tag ("2 days late"), or the due day in plain words.
function Due({ today, s }: { today: string; s: FrStep }) {
  const d = stepDue(today, s);
  if (d.kind === 'late') {
    return (
      <span className="fr-late" title={d.title}>
        {d.text}
      </span>
    );
  }
  return (
    <span className={`fr-when${d.kind === 'when' ? '' : ' fr-soft'}`} title={d.title}>
      {d.text}
    </span>
  );
}

// "2026 giving": the raised bar against the goal, the donors as marks, and where the money came from.
function Giving({ view, totals, flash }: { view: FundraisingView; totals: GiftTotals; flash: number }) {
  const { goalCents } = view;
  const { raisedCents, donors, newDonors, monthlyDonors, sources } = totals;
  const max = Math.max(1, ...sources.map((s) => s.cents));
  return (
    <Panel
      id="fr-gh"
      key={flash}
      className={flash ? 'fr-giving fr-panel-flash' : 'fr-giving'}
      title={`${view.year} giving`}
      action={
        <span className="fr-pm">
          Q3 brought in <b>{dollars(view.q3Cents)}</b>
        </span>
      }
    >
      <div className="fr-pbody">
        {goalCents ? (
          <div className="fr-bar fr-thick" role="img" aria-label={`${dollars(raisedCents)} raised of the ${dollars(goalCents)} goal`}>
            <span style={{ width: `${Math.min(100, (raisedCents / goalCents) * 100)}%` }} />
          </div>
        ) : null}
        <p className="fr-key" data-design-keep="Goal shown on the news card and the key line exactly as the signed-off demo draws it (2026-11-11); the coordinator reports this to the owner">
          <span>
            <i className="fr-sw" />
            Raised <b>{dollars(raisedCents)}</b>
          </span>
          <span className="fr-push">{goalCents ? <>Goal <b>{dollars(goalCents)}</b></> : 'No goal set'}</span>
        </p>
        <h3 className="fr-sh">Donors</h3>
        {donors ? (
          <>
            <div className="fr-marks" role="img" aria-label={`${donors} donors, ${newDonors} new this year`}>
              {Array.from({ length: donors }, (_, i) => (
                <i key={i} className={i < newDonors ? 'fr-nw' : undefined} />
              ))}
            </div>
            <p className="fr-key">
              <span>
                <b>{cnt(donors)}</b> donors
              </span>
              <span>
                <i className="fr-sw fr-gd" />
                {newDonors} new this year
              </span>
              <span>{monthlyDonors} give monthly</span>
              <span>
                Average gift about <b>{dollars(view.avgCents)}</b>
              </span>
            </p>
          </>
        ) : (
          <p className="fr-flat">No donors yet.</p>
        )}
        <h3 className="fr-sh">By source</h3>
        <ul className="fr-srcs">
          {sources.map((s) => (
            <li key={s.key}>
              <span>{s.label}</span>
              <span className="fr-sv">
                {s.cents ? (
                  <>
                    <b>{dollars(s.cents)}</b> {pct(s.cents, raisedCents)}%
                  </>
                ) : s.key === 'grant' ? (
                  <>
                    None yet ·{' '}
                    <Link className="fr-lnk" href="/finance/grants">
                      See grants
                    </Link>
                  </>
                ) : (
                  'None yet'
                )}
              </span>
              <span className="fr-bar" aria-hidden="true">
                <span style={{ width: `${(s.cents / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

// The page.
export function FundraisingBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const foldMs = useFoldMs();
  const { caps, me, today } = view;
  // What is drawn: every control in mock mode; in live mode none ("Coming soon" for Log a gift).
  const ctl = frControls(caps, view.loadFailed);

  // The server's view as last taken in; a new one (a live refresh) resets the page's own state to it.
  const [seen, setSeen] = useState(view);
  const [totals, setTotals] = useState(() => totalsOf(view));
  const [logged, setLogged] = useState<LoggedGift[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [typed, setTyped] = useState('');
  const [list, setList] = useState<FrChecklist | null>(view.checklist);
  const [moment, setMoment] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [nudge, setNudge] = useState<NudgeState>('none');
  // The step the nudge belongs to: when the next step changes, the nudge state no longer applies.
  const [nudgeAt, setNudgeAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [retrying, startRetry] = useTransition();
  if (view !== seen) {
    setSeen(view);
    setTotals(totalsOf(view));
    setLogged([]);
    setSaved(null);
    setList(view.checklist);
    setMoment(null);
    setNudge('none');
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Where focus goes after the next render: the first of these selectors that exists.
  const focusSel = useRef<string[] | null>(null);
  const mountedAt = useRef(0);
  const timers = useRef<number[]>([]);

  // The mock clock starts at the sample's 9:14 AM when the page opens (the demo's "now"); timers stop on leaving.
  useEffect(() => {
    mountedAt.current = Date.now();
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  // Moves focus where the last action asked (after the render that drew the target).
  useEffect(() => {
    if (!focusSel.current) return;
    const root = rootRef.current;
    const el = focusSel.current.map((s) => root?.querySelector<HTMLElement>(s)).find(Boolean);
    focusSel.current = null;
    el?.focus({ preventScroll: true });
  });

  // Runs `fn` after `ms`, cancelled if the page goes away.
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  // Reads a message to screen readers (cleared first so the same words are read again).
  const say = useCallback(
    (m: string) => {
      setAnnounce('');
      later(() => setAnnounce(m), 30);
    },
    [later],
  );

  // Opens the "Log a gift" line and puts the cursor in it.
  const openAdd = useCallback(() => {
    setAdding(true);
    focusSel.current = ['#fr-gin'];
  }, []);

  // The N key opens "Log a gift" (not while typing anywhere, and only where a gift can be logged).
  useEffect(() => {
    if (!ctl.nKey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      openAdd();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctl.nKey, openAdd]);

  // "9:14 AM": the real Eastern time in live mode; the sample's 9:14 AM plus the minutes since the page opened in mock mode.
  const stamp = () => {
    if (live) return clock(new Date().toISOString());
    const m = Math.min(23 * 60 + 59, 9 * 60 + 14 + Math.floor((Date.now() - mountedAt.current) / 60_000));
    return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
  };

  const parsed = parseGift(typed);
  // The newest five, as live mode reads them (a gift logged in mock mode tops the list).
  const gifts: (FrGift & { at?: string })[] = [...logged, ...view.recent].slice(0, 5);
  const news = view.loadFailed ? null : fundraisingNews(view.goalCents, totals.raisedCents);
  const steps = list?.steps ?? [];
  const nx = nextStep(steps);
  const doneCount = steps.filter((s) => s.done).length;
  // The nudge state of the step that is up next now (a tick that moves "Next" starts it over).
  const ns: NudgeState = nx && nudgeAt === nx.id ? nudge : 'none';

  // Logs the typed gift (mock mode): it tops the list with "Saved · Undo", the figures move, the line stays open and empty.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ctl.giftForm) return;
    const p = parseGift(typed);
    if (p.cents == null) {
      say('Add an amount, for example $50');
      focusSel.current = ['#fr-gin'];
      return;
    }
    const g: LoggedGift = { id: `g${Date.now()}`, donor: p.donor || null, source: p.source, monthly: p.monthly, amountCents: p.cents, giftOn: today, at: stamp() };
    setLogged((l) => [g, ...l]);
    setTotals((t) => applyGift(t, g, 1));
    setSaved(g.id);
    setTyped('');
    focusSel.current = ['#fr-gin'];
    say(`Gift saved: ${dollars(g.amountCents)}.${ctl.giftUndo ? ' Undo available.' : ''}`);
  };

  // Undo the last logged gift: it goes, and the figures go back.
  const undoGift = (g: LoggedGift) => {
    setLogged((l) => l.filter((x) => x.id !== g.id));
    setTotals((t) => applyGift(t, g, -1));
    setSaved(null);
    focusSel.current = ['#fr-gin', '[data-k="g:open"]'];
    say('Gift removed');
  };

  // Closes the "Log a gift" line without saving; focus goes back to its row.
  const closeAdd = () => {
    setAdding(false);
    setTyped('');
    focusSel.current = ['[data-k="g:open"]'];
  };

  // Escape in the gift line closes it.
  const onGiftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeAdd();
  };

  // Leaving an empty gift line (focus moves outside its form) closes it, as the demo does.
  const onGiftBlur = () => {
    later(() => {
      const f = rootRef.current?.querySelector('form[data-form="gift"]');
      const input = rootRef.current?.querySelector<HTMLInputElement>('#fr-gin');
      if (f && !f.contains(document.activeElement) && !input?.value.trim()) setAdding(false);
    }, 150);
  };

  // Ticks a step done (or open again), with "Done · Undo" under it.
  const tick = (id: string) => {
    if (!list) return;
    const s = list.steps.find((x) => x.id === id);
    if (!s) return;
    setList(toggleStep(list, id));
    setMoment(id);
    setPop(s.done ? null : id);
    if (ns === 'draft') setNudge('none');
    focusSel.current = [`[data-k="s:${id}:undo"]`];
    say(s.done ? 'Reopened. Undo available.' : 'Done. Undo available.');
  };

  // Undo the last tick.
  const untick = (id: string) => {
    if (!list) return;
    setList(toggleStep(list, id));
    setMoment(null);
    setPop(null);
    focusSel.current = [`[data-k="s:${id}"]`];
    say('Undone');
  };

  // "Nudge Keith": opens (or closes) the drafted Board chat message; Send gets the focus.
  const toggleNudge = () => {
    if (ns === 'draft') {
      setNudge('none');
      return;
    }
    setNudgeAt(nx?.id ?? null);
    setNudge('draft');
    later(() => rootRef.current?.querySelector<HTMLElement>('[data-k="s:nsend"]')?.focus({ preventScroll: true }), 30);
  };

  // Cancel: the draft folds away, unsent, and its edits are dropped.
  const cancelNudge = () => {
    setNudge('none');
    setEditing(false);
    setCustom(null);
    focusSel.current = ['[data-k="s:nudge"]'];
  };

  // Escape in the nudge draft closes it, unsent.
  const onDraftKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    cancelNudge();
  };

  // Send (mock mode): "Sending…", the draft folds away, then "Nudged just now"; focus goes to that step's tick.
  const sendNudge = (name: string, stepId: string) => {
    const t = taRef.current?.value.trim();
    if (editing && t) setCustom(t);
    setNudge('sending');
    later(() => {
      setNudge('closing');
      later(() => {
        setNudge('sent');
        setEditing(false);
        focusSel.current = [`[data-k="s:${stepId}"]`, '#fr-yh'];
        say(`Nudge sent to ${name}`);
      }, foldMs);
    }, 450);
  };

  // "See it" on the news card: brings "2026 giving" into view and flashes it.
  const seeGiving = () => {
    const el = document.getElementById('fr-gh')?.closest('section');
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setFlash((f) => f + 1);
  };

  // "Try again": mock mode goes back to the sample (drops ?demo), live mode reloads the server data.
  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  // One checklist step: tick | eyebrow, title, who (and its moment); the next step carries the wait line and the draft.
  const stepRow = (s: FrStep) => {
    const now = s === nx;
    const mine = now && s.owner.kind === 'person' && s.owner.id === me;
    const waits = now && waitsOnOther(s, me) ? s.owner : null;
    const draftOpen = ns === 'draft' || ns === 'sending';
    return (
      <li key={s.id} className={[s.done ? 'fr-on' : '', now ? 'fr-now' : '', mine ? 'fr-mine' : ''].filter(Boolean).join(' ') || undefined}>
        {ctl.tickButtons ? (
          <button
            type="button"
            className={`fr-ck${s.done ? ' fr-on' : ''}${pop === s.id ? ' fr-pop' : ''}`}
            aria-pressed={s.done}
            data-k={`s:${s.id}`}
            aria-label={`Done: ${s.title}`}
            onClick={() => tick(s.id)}
          >
            <Icon name="check" />
          </button>
        ) : (
          <span className={`fr-ck${s.done ? ' fr-on' : ''}`} role="img" aria-label={s.done ? 'Done' : 'Not done'}>
            <Icon name="check" />
          </span>
        )}
        <div className="fr-main">
          <span className="fr-eb">
            <Due today={today} s={s} />
            {s.kind ? <span className="fr-kw">{s.kind}</span> : null}
            {now ? <span className="fr-nowtag">Next</span> : null}
          </span>
          <span className="fr-st">{s.title}</span>
          <span className="fr-meta">
            <Who owner={s.owner} me={me} />
            {ctl.stepUndo && moment === s.id ? (
              <span className="fr-moment">
                <span className="fr-tick fr-ink" aria-hidden="true">
                  <Icon name="check" />
                </span>
                {s.done ? 'Done' : 'Reopened'}&nbsp;·&nbsp;
                <button type="button" className="rf-lnk" data-k={`s:${s.id}:undo`} aria-label="Undo step" onClick={() => untick(s.id)}>
                  Undo
                </button>
              </span>
            ) : null}
          </span>
          {waits ? (
            ctl.nudge && ns === 'sent' ? (
              <span className="fr-wait fr-done">
                <span className="fr-nudged">
                  <Icon name="check" />
                  Nudged just now
                </span>
              </span>
            ) : (
              <span className="fr-wait">
                <span className="fr-wt">
                  <Icon name="wait" />
                  Waiting on {waits.first}
                </span>
                {ctl.nudge ? (
                  <button type="button" className="fr-nudge" aria-expanded={draftOpen} data-k="s:nudge" onClick={toggleNudge}>
                    Nudge {waits.first}
                  </button>
                ) : null}
              </span>
            )
          ) : null}
          {waits && ctl.nudge && ns !== 'sent' ? (
            <Fold open={draftOpen}>
              <span className="fr-sub">
                <span className="fr-draft">
                  <span className="fr-dl">
                    To <span className="rf-nowrap">{waits.name}</span> in Board chat
                  </span>
                  {editing ? (
                    <textarea ref={taRef} className="fr-dtext" rows={3} data-k="s:ntext" aria-label="Message" onKeyDown={onDraftKey} defaultValue={custom ?? nudgeText(today, s, waits.first)} />
                  ) : (
                    <span className="fr-dtext">{custom ?? nudgeText(today, s, waits.first)}</span>
                  )}
                  <span className="fr-dact">
                    <button type="button" className="rf-btn" data-k="s:nsend" disabled={ns === 'sending'} onKeyDown={onDraftKey} onClick={() => sendNudge(waits.name, s.id)}>
                      <Icon name="send" />
                      <span>{ns === 'sending' ? 'Sending…' : 'Send'}</span>
                    </button>
                    <button
                      type="button"
                      className="rf-lnk"
                      onKeyDown={onDraftKey}
                      onClick={() => {
                        setEditing(true);
                        focusSel.current = ['[data-k="s:ntext"]'];
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="rf-lnk" onKeyDown={onDraftKey} onClick={cancelNudge}>
                      Cancel
                    </button>
                  </span>
                </span>
              </span>
            </Fold>
          ) : null}
        </div>
      </li>
    );
  };

  const yearEnd = (
    <section className="rf-panel fr-ye" aria-labelledby="fr-yh">
      <div className="rf-ph">
        <div className="fr-ph-l">
          <h2 id="fr-yh">{list?.title ?? 'Year-end giving'}</h2>
          {list && steps.length ? (
            <span className="fr-pm">
              {doneCount} of {steps.length} done
            </span>
          ) : null}
        </div>
      </div>
      <div className="rf-pcard">
        {list == null ? (
          <StateLine kind="error" onRetry={retry} retrying={retrying}>
            Year-end giving didn&apos;t load.
          </StateLine>
        ) : steps.length === 0 ? (
          <StateLine kind="empty">No steps yet.</StateLine>
        ) : (
          <>
            <div className="fr-pbody fr-tight">
              <div className="fr-clbar" aria-hidden="true">
                {steps.map((s) => (
                  <span key={s.id} className={s.done ? 'fr-on' : s === nx ? 'fr-now' : undefined} />
                ))}
              </div>
            </div>
            <ol className="fr-steps">{steps.map(stepRow)}</ol>
          </>
        )}
      </div>
    </section>
  );

  const addRow = !ctl.giftForm ? (
    <button type="button" className="fr-add-open" disabled aria-describedby="fr-soon">
      <span className="fr-plus" aria-hidden="true">
        <Icon name="plus" />
      </span>
      <span className="fr-lab">Log a gift</span>
      <span className="fr-soon" id="fr-soon">
        Coming soon
      </span>
    </button>
  ) : adding ? (
    <form className="fr-add-form" data-form="gift" autoComplete="off" onSubmit={submit}>
      <div className="fr-add-field">
        <span className="fr-plus" aria-hidden="true">
          <Icon name="plus" />
        </span>
        <input
          id="fr-gin"
          type="text"
          enterKeyHint="done"
          aria-label="Log a gift, e.g. $50 Jordan Pierce monthly. Type the amount and the donor; words like match or monthly set the source."
          placeholder="e.g. $50 Jordan Pierce monthly"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onGiftKey}
          onBlur={onGiftBlur}
        />
        <button className="rf-btn rf-btn-gold" type="submit" disabled={parsed.cents == null}>
          Log gift
        </button>
      </div>
      <div className="fr-chips">
        {typed.trim() ? (
          <>
            {parsed.cents != null ? <span className="fr-pchip">{dollars(parsed.cents)}</span> : <span className="fr-pchip fr-ink">Add an amount</span>}
            <span className="fr-pchip fr-ink">{parsed.donor || 'Anonymous'}</span>
            <span className="fr-pchip fr-ink">{sourceLabel(parsed.source)}</span>
            {parsed.monthly ? <span className="fr-pchip">Monthly</span> : null}
          </>
        ) : null}
      </div>
    </form>
  ) : (
    <button type="button" className="fr-add-open" data-k="g:open" onClick={openAdd}>
      <span className="fr-plus" aria-hidden="true">
        <Icon name="plus" />
      </span>
      <span className="fr-lab">Log a gift</span>
      <span className="fr-kbd" aria-hidden="true">
        N
      </span>
    </button>
  );

  const recent = (
    <Panel id="fr-rgh" title="Recent gifts">
      {gifts.length ? (
        <ul className="fr-gifts">
          {gifts.map((g) => (
            <li key={g.id} className={saved === g.id ? 'fr-fresh' : undefined}>
              <span className="fr-gd-n">
                <b>{g.donor ?? 'Anonymous'}</b>
                <span className="fr-meta">
                  <span>{sourceLabel(g.source)}</span>
                  {g.monthly ? <span>Monthly</span> : null}
                  <span title={fullDate(g.giftOn)}>{g.giftOn === today ? 'Today' : fullDate(g.giftOn)}</span>
                </span>
              </span>
              <b className="fr-sa">{dollars(g.amountCents)}</b>
              {ctl.giftUndo && saved === g.id && 'at' in g && g.at ? (
                <span className="fr-moment">
                  <span className="fr-tick" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  Saved {g.at}&nbsp;·&nbsp;
                  <button type="button" className="rf-lnk" data-k="g:undo" aria-label="Undo gift" onClick={() => undoGift(g as LoggedGift)}>
                    Undo
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="fr-add">{addRow}</div>
    </Panel>
  );

  return (
    <div className="rf fr" ref={rootRef}>
      <PageHeader title="Fundraising" date={dateLabel(today)}>
        {news ? <NewsCard icon="money" kicker={`${dollarsUp(news.left)} to go, by Dec 31`} title={`Raise ${dollars(news.goal)}`} go="See it" onClick={seeGiving} /> : null}
      </PageHeader>
      <FinanceTabs budgetCount={view.budgetCount} />

      {view.loadFailed ? (
        retrying ? (
          <div aria-busy="true">
            <SkelBoard />
          </div>
        ) : (
          <section className="rf-panel" aria-label="Fundraising">
            <div className="rf-pcard">
              <p className="fr-errline" role="alert">
                <span>
                  <Icon name="alert" />
                  Fundraising didn&apos;t load.
                </span>
                <button type="button" className="rf-btn" onClick={retry}>
                  Try again
                </button>
              </p>
            </div>
          </section>
        )
      ) : (
        <div className="fr-board">
          <div className="fr-col fr-col-a">
            <Giving view={view} totals={totals} flash={flash} />
            {recent}
          </div>
          <div className="fr-col fr-col-b">{yearEnd}</div>
        </div>
      )}
      <p className="rf-sr" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
