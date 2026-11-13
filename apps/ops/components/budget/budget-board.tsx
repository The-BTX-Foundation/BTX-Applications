'use client';

// The refreshed Budget page and its approval page (Ops Hub refresh 2026-11-12; demo p-budget, the approval page is the demo's
// "#/approval" view). One client board for both routes:
// - mode "page" (/finance/budget): the title with the news card, the phone's Finance tabs, the Q4 plan across the top, then
//   the year by category and the quarter's spending | funds on hand and the Finance chat;
// - mode "approval" (/finance/budget/approval): the back link and the plan alone; on a phone its actions stay in reach above
//   the tab bar.
// Mock mode keeps every change (approve, decline, undo, comments, spending, funds, chat) in the tab's memory under the key
// "bu:<demo>", so both routes show the same state until the tab reloads. Live mode draws the real data; the money actions are
// "Coming soon" (owner, 2026-10-12) and the comment reply, chat reply and nudge are not drawn (no backed write on this page).
import '@/components/refresh/refresh.css';
import './budget.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/refresh/icons';
import { NewsCard } from '@/components/refresh/news-card';
import { PageHeader } from '@/components/refresh/page-header';
import { Panel } from '@/components/refresh/panel';
import { StateLine } from '@/components/refresh/state-line';
import { canDecide, headDate, leftOf, money, msgTime, newsFor, parseAmount, parseSpend, pastWord, pct, prevQuarter, totals } from '@/lib/budget-map';
import type { BudgetView, BuCategory, BuComment, BuFunds, BuMsg, BuPlanStatus, BuSpend } from '@/lib/budget-view';
import { clock, easternDay, fullDate } from '@/lib/refresh-time';
import { useMockState } from '@/lib/mock-store';
import { FinanceTabs, Moment, Msg, OffButton, Soon } from './budget-parts';
import { PlanPanel } from './budget-plan';
import { BudgetSkeleton } from './budget-skeleton';

/** What mock mode changes, shared by both routes for the tab's session. */
type MockS = {
  status: BuPlanStatus;
  decidedAt: string | null;
  comments: BuComment[];
  count: number;
  /** The comment a decline added (removed again by Undo). */
  declineC: string | null;
  spend: BuSpend[];
  funds: BuFunds;
  fundsPrev: BuFunds | undefined;
  chat: BuMsg[];
};

const ME = { name: 'You', initials: 'DM', me: true };
// Rows logged in mock mode (their amounts are added to the categories).
const MOCK_ROW = 'mock-';

// The board.
export function BudgetBoard({ view, live, mode, demo }: { view: BudgetView; live: boolean; mode: 'page' | 'approval'; demo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useMemo<MockS>(
    () => ({
      status: view.plan.status,
      decidedAt: view.plan.decidedAt,
      comments: view.comments.list,
      count: view.comments.count,
      declineC: null,
      spend: view.spend,
      funds: view.funds,
      fundsPrev: undefined,
      chat: view.chat.messages,
    }),
    [view],
  );
  const [stored, setMs] = useMockState<MockS>(`bu:${demo ?? 'normal'}`, initial);
  // Live mode never writes, so it always draws what the server read.
  const s = live ? initial : stored;
  const k = mode === 'approval' ? 'full' : 'page';
  const q = !live && demo ? `?demo=${demo}` : '';
  const Q = `Q${view.plan.quarter}`;

  // Transient screen state (open folds, fields, the "Saved" moments): per route.
  const [approving, setApproving] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [allComments, setAllComments] = useState(false);
  const [reply, setReply] = useState('');
  const [freshComment, setFreshComment] = useState<string | null>(null);
  const [nudge, setNudge] = useState<'none' | 'draft' | 'sending' | 'sent'>('none');
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addCat, setAddCat] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [fundsEdit, setFundsEdit] = useState(false);
  const [fundsText, setFundsText] = useState('');
  const [fundsSaved, setFundsSaved] = useState(false);
  const [fundsAt, setFundsAt] = useState('');
  const [chatText, setChatText] = useState('');
  const [chatSentAt, setChatSentAt] = useState<string | null>(null);
  // "Try again": live mode refreshes inside a transition (the skeleton shows while it runs; a refresh that fails again ends it
  // and the error comes back); mock mode waits for the new view (the skeleton until it arrives).
  const [refreshing, startRefresh] = useTransition();
  const [retryOf, setRetryOf] = useState<BudgetView | null>(null);
  const retrying = live ? refreshing : retryOf === view;
  const [msg, setMsg] = useState('');
  const timers = useRef<number[]>([]);

  // Timers die with the board.
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // Waits `ms`, then runs `f` (cleared if the board goes away).
  const later = useCallback((ms: number, f: () => void) => {
    timers.current.push(window.setTimeout(f, ms));
  }, []);
  // Focus follows the action (the demo's focusK): the control named by data-k, once the next render has painted it.
  const setFocusK = useCallback(
    (key: string) => {
      later(0, () => document.querySelector<HTMLElement>(`[data-k="${key}"]`)?.focus({ preventScroll: true }));
    },
    [later],
  );
  // One polite announcement (cleared first, so the same words are read again).
  const say = useCallback(
    (m: string) => {
      setMsg('');
      later(30, () => setMsg(m));
    },
    [later],
  );

  // The categories with the mock-logged spending added.
  const cats: BuCategory[] = useMemo(() => {
    const extra = new Map<string, number>();
    for (const x of s.spend) if (x.id.startsWith(MOCK_ROW) && x.categoryId) extra.set(x.categoryId, (extra.get(x.categoryId) ?? 0) + x.cents);
    return view.cats.map((c) => {
      const e = extra.get(c.id) ?? 0;
      return e ? { ...c, spentCents: c.spentCents + e, quarterSpentCents: c.quarterSpentCents + e } : c;
    });
  }, [s.spend, view.cats]);
  const t = totals(cats);
  const nowIso = () => new Date().toISOString();
  // The mock's "now": this moment moved onto the sample's today, so a decision made in the demo reads "9:14 AM", not a weekday.
  const mockNowIso = () => {
    const real = new Date();
    const shift = Date.parse(easternDay(real.toISOString())) - Date.parse(view.today);
    return new Date(real.getTime() - shift).toISOString();
  };
  const nowClock = () => clock(nowIso());

  // ---------------------------------------------------------------- the plan's actions (mock mode)
  const plan = { ...view.plan, status: s.status };
  const approve = () => {
    if (!view.caps.approve || approving || !canDecide(plan)) return;
    setApproving(true);
    later(600, () => {
      setMs((cur) => ({ ...cur, status: 'approved', decidedAt: mockNowIso() }));
      setApproving(false);
      setDeclineOpen(false);
      setFocusK(`${k}:aundo`);
      say(`${Q} budget approved. Undo available.`);
    });
  };
  const sendDecline = () => {
    if (!view.caps.decline || !canDecide(plan)) return;
    const text = why.trim();
    const id = `c-${nowIso()}`;
    setMs((cur) => ({
      ...cur,
      status: 'declined',
      decidedAt: mockNowIso(),
      comments: text ? [...cur.comments, { id, by: ME, at: null, body: text }] : cur.comments,
      count: text ? cur.count + 1 : cur.count,
      declineC: text ? id : null,
    }));
    setWhy('');
    setDeclineOpen(false);
    setFocusK(`${k}:aundo`);
    say(`Declined and sent back to ${view.plan.from?.name ?? 'the drafter'}`);
  };
  const undo = () => {
    if (!view.caps.undo) return;
    setMs((cur) => ({
      ...cur,
      status: 'waiting',
      decidedAt: null,
      comments: cur.declineC ? cur.comments.filter((c) => c.id !== cur.declineC) : cur.comments,
      count: cur.declineC ? cur.count - 1 : cur.count,
      declineC: null,
    }));
    setFocusK(`${k}:approve`);
    say(`Undone. The plan waits on your approval again.`);
  };
  const toggleDecline = () => {
    const open = !declineOpen;
    setDeclineOpen(open);
    if (open) later(30, () => document.querySelector<HTMLElement>(`[data-k="${k}:why"]`)?.focus());
  };
  const cancelDecline = () => {
    setDeclineOpen(false);
    setFocusK(`${k}:decline`);
  };
  const sendReply = () => {
    const v = reply.trim();
    if (!v || !view.caps.comment) return;
    const id = `c-${nowIso()}`;
    setMs((cur) => ({ ...cur, comments: [...cur.comments, { id, by: ME, at: null, body: v }], count: cur.count + 1 }));
    setFreshComment(id);
    setReply('');
    setFocusK(`${k}:reply`);
    say('Comment sent');
  };
  const sendNudge = () => {
    setNudge('sending');
    later(450, () => {
      setNudge('sent');
      say(`Nudge sent to ${view.plan.from?.name ?? ''}`);
    });
  };

  // ---------------------------------------------------------------- spending, funds, chat (mock mode)
  const parsed = parseSpend(addText, view.cats);
  const pickCat = addCat || parsed.catId || '';
  const catName = (id: string) => view.cats.find((c) => c.id === id)?.name ?? '';
  const openAdd = (cat = '') => {
    setAddOpen(true);
    setAddCat(cat);
    setFocusK('sp:in');
    if (cat) say(`Logging ${catName(cat)} spending`);
  };
  const closeAdd = (focus: string | null) => {
    setAddOpen(false);
    setAddText('');
    setAddCat('');
    if (focus) setFocusK(focus);
  };
  const saveSpend = () => {
    if (parsed.dollars == null) {
      say('Add an amount, for example $45');
      setFocusK('sp:in');
      return;
    }
    if (!pickCat) {
      say('Pick a category');
      setFocusK('sp:cat');
      return;
    }
    const row: BuSpend = { id: `${MOCK_ROW}${nowIso()}`, on: view.today, categoryId: pickCat, category: catName(pickCat), title: parsed.title, cents: Math.round(parsed.dollars * 100) };
    setMs((cur) => ({ ...cur, spend: [row, ...cur.spend] }));
    setSavedId(row.id);
    setSavedAt(nowClock());
    setAddText('');
    setAddCat('');
    setFocusK('sp:in');
    say(`Saved: ${money(row.cents)} to ${row.category}`);
  };
  const undoSpend = (id: string) => {
    setMs((cur) => ({ ...cur, spend: cur.spend.filter((x) => x.id !== id) }));
    setSavedId(null);
    setFocusK('sp:open');
    say('Spending removed');
  };
  const editFunds = () => {
    setFundsEdit(true);
    setFundsSaved(false);
    setFundsText(s.funds ? String(Math.round(s.funds.cents / 100)) : '');
    later(0, () => {
      const el = document.querySelector<HTMLInputElement>('[data-k="funds:in"]');
      el?.focus();
      el?.select();
    });
  };
  const saveFunds = () => {
    const a = parseAmount(fundsText);
    if (!a) {
      setFocusK('funds:in');
      return;
    }
    setMs((cur) => ({ ...cur, fundsPrev: cur.funds, funds: { cents: Math.round(a.value * 100), asOf: view.today, by: ME } }));
    setFundsEdit(false);
    setFundsSaved(true);
    setFundsAt(nowClock());
    setFocusK('funds:undo');
    say(`Funds on hand saved: ${money(Math.round(a.value * 100))}`);
  };
  const undoFunds = () => {
    setMs((cur) => ({ ...cur, funds: cur.fundsPrev ?? cur.funds, fundsPrev: undefined }));
    setFundsSaved(false);
    setFocusK('funds:edit');
    say('Funds on hand restored');
  };
  const sendChat = () => {
    const v = chatText.trim();
    if (!v || !view.caps.chat) return;
    setMs((cur) => ({ ...cur, chat: [...cur.chat, { id: `m-${nowIso()}`, by: ME, at: null, body: v }] }));
    setChatText('');
    setChatSentAt(nowIso());
    setFocusK('chat:in');
    say('Sent to Finance chat');
  };

  // Try again after a load error: the skeleton, then the page (mock: the normal sample, as the demo does; live: a fresh read).
  const retry = () => {
    if (live) {
      startRefresh(() => router.refresh());
      return;
    }
    setRetryOf(view);
    later(900, () => router.replace(pathname));
  };

  // ---------------------------------------------------------------- the news card and the header
  const approver = view.steps.find((x) => x.approval)?.who ?? null;
  const news = view.loadFailed ? null : newsFor(plan, t.plan, approver);
  const mineCount = s.status === 'waiting' && news?.gold ? 1 : 0;
  const flash = () => {
    const el = document.getElementById('bu-plan');
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Focus follows the eye: the plan (a container, tabindex -1), without a second jump.
    el.focus({ preventScroll: true });
    el.classList.remove('bu-flashit');
    void el.offsetWidth;
    el.classList.add('bu-flashit');
    later(1700, () => el.classList.remove('bu-flashit'));
  };
  const header = (
    <PageHeader title="Budget" date={headDate(view.today)}>
      {mode === 'page' && news && !retrying ? <NewsCard icon={news.icon} gold={news.gold} kicker={news.kicker} title={news.title} go={news.go} onClick={flash} /> : null}
    </PageHeader>
  );
  const live_ = <p className="rf-sr" aria-live="polite">{msg}</p>;

  if (retrying) return <BudgetSkeleton approval={mode === 'approval'} />;

  if (view.loadFailed) {
    return (
      <div className={`rf bu${mode === 'approval' ? ' bu-ap' : ''}`}>
        {header}
        {mode === 'page' ? <FinanceTabs count={0} /> : null}
        <section className="rf-panel">
          <div className="rf-pcard">
            <p className="bu-errline" role="alert">
              <span>
                <Icon name="alert" />
                Budget didn&apos;t load.
              </span>
              <button type="button" className="rf-btn" data-k="retry" onClick={retry}>
                Try again
              </button>
            </p>
          </div>
        </section>
        {/* The alert line above is this state's one announcement (said again each time a retry fails); no second region. */}
      </div>
    );
  }

  const planPanel = (
    <PlanPanel
      mode={k}
      view={view}
      cats={cats}
      status={s.status}
      decidedAt={s.decidedAt}
      comments={{ count: s.count, list: s.comments }}
      live={live}
      q={q}
      approving={approving}
      declineOpen={declineOpen}
      allComments={allComments}
      nudge={nudge}
      reply={reply}
      why={why}
      freshComment={freshComment}
      onApprove={approve}
      onToggleDecline={toggleDecline}
      onCancelDecline={cancelDecline}
      onSendDecline={sendDecline}
      onUndo={undo}
      onShowAll={() => {
        setAllComments(true);
        setFocusK(`${k}:reply`);
      }}
      onReply={setReply}
      onSendReply={sendReply}
      onWhy={setWhy}
      onNudge={() => setNudge((n) => (n === 'draft' ? 'none' : 'draft'))}
      onCancelNudge={() => setNudge('none')}
      onSendNudge={sendNudge}
    />
  );

  if (mode === 'approval') {
    return (
      <div className="rf bu bu-ap">
        {header}
        <Link className="rf-lnk bu-back" href={`/finance/budget${q}`} data-k="back">
          <Icon name="back" />
          Budget
        </Link>
        <div className="bu-solo">{planPanel}</div>
        {live_}
      </div>
    );
  }

  // ---------------------------------------------------------------- the board
  const ok = s.status === 'approved';
  const prev = prevQuarter(view.year, view.plan.quarter);
  const shownSpend = live ? s.spend.slice(0, 5) : s.spend;
  const funds = s.funds;
  const share = t.plan && funds?.cents ? Math.min(100, (t.plan / funds.cents) * 100) : 0;
  const lastOther = [...s.chat].reverse().find((m) => !m.by.me);
  const chatPh = lastOther ? `Reply to ${lastOther.by.name.split(' ')[0]}` : 'Message the board';

  return (
    <div className="rf bu">
      {header}
      <FinanceTabs count={mineCount} />
      {/* The stress sample's Sponsorships line is over by exactly the plan's $410, so "$410" shows in the plan and the
          category list; the signed-off demo draws it this way (coordinator's call, 2026-11-12). Mock stress only. */}
      <div
        className="rf-board bu-board"
        data-design-keep={!live && demo === 'stress' ? "Stress sample: Sponsorships is over by exactly the plan's $410, drawn this way in the signed-off demo; coordinator reports it to the owner" : undefined}
      >
        <div className="bu-span">{planPanel}</div>
        <div className="rf-col bu-col-a">
          {/* The year by category: spent (ink) and the plan still to spend (gold) inside each budget. */}
          <Panel
            id="bu-catH"
            title={`${view.year} budget`}
            action={
              <p className="bu-key">
                <span>
                  <i className="bu-sw bu-sp" />
                  Spent
                </span>
                <span>
                  <i className={`bu-sw ${ok ? 'bu-gd' : 'bu-pl'}`} />
                  {Q} plan
                </span>
              </p>
            }
          >
            <ul className="bu-cats">
              {cats.map((c) => {
                const left = leftOf(c);
                const base = Math.max(c.budgetCents, c.spentCents + left, 1);
                const over = c.spentCents > c.budgetCents;
                return (
                  <li key={c.id} className="bu-cr">
                    <span className="bu-cn">
                      <b>{c.name}</b>
                      {c.sub ? <span className="bu-sub">{c.sub}</span> : null}
                      {over ? <span className="rf-late">Over by {money(c.spentCents - c.budgetCents)}</span> : null}
                    </span>
                    <span className={`bu-bar${ok ? ' bu-ok' : ''}`} role="img" aria-label={`${c.name}: ${money(c.spentCents)} spent of ${money(c.budgetCents)}`}>
                      <span className="bu-sp" style={{ width: `${(c.spentCents / base) * 100}%` }} />
                      <span className="bu-pl" style={{ width: `${(left / base) * 100}%` }} />
                      {over ? <span className="bu-over" /> : null}
                    </span>
                    <span className="bu-ca">
                      <b>{money(c.spentCents)}</b> of {money(c.budgetCents)}
                    </span>
                    {view.caps.logSpend ? (
                      <button type="button" className="rf-lnk bu-ra" data-k={`cat:${c.id}`} onClick={() => openAdd(c.id)}>
                        Log spending
                      </button>
                    ) : (
                      <span className="bu-ra-none" />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* The quarter's spending: the rows, then the add row (mock) or the disabled one (live). */}
          <Panel
            id="bu-spH"
            title={`${Q} spending`}
            action={
              <span className="bu-pm">
                Q{prev.q} closed at <b>{money(view.prevQuarterCents)}</b>
              </span>
            }
          >
            {shownSpend.length ? (
              <ul className="bu-spends">
                {shownSpend.map((x) => (
                  <li key={x.id} className={`bu-sr-row${savedId === x.id ? ' bu-fresh' : ''}`}>
                    <span className="bu-sw-t">
                      <span className="bu-eb">
                        <time className="bu-when" dateTime={x.on} title={fullDate(x.on)}>
                          {pastWord(view.today, x.on)}
                        </time>
                        <span className="bu-kw">{x.category}</span>
                      </span>
                      <b>{x.title || 'Spending'}</b>
                    </span>
                    <b className="bu-sa">{money(x.cents)}</b>
                    {savedId === x.id ? (
                      <Moment
                        small
                        undo={
                          <button type="button" className="rf-lnk" data-k="sp:undo" onClick={() => undoSpend(x.id)}>
                            Undo
                          </button>
                        }
                      >
                        Saved {savedAt}
                      </Moment>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bu-empty-line">Nothing logged for {Q} yet.</p>
            )}
            {live && view.spendAll.count > shownSpend.length ? <p className="bu-more">And {view.spendAll.count - shownSpend.length} more this quarter</p> : null}
            <div className="bu-add">
              {!view.caps.logSpend ? (
                <div className="bu-add-open bu-off" role="button" tabIndex={0} aria-disabled="true" aria-describedby="bu-soon-sp">
                  <span className="bu-plus">
                    <Icon name="plus" />
                  </span>
                  <span className="bu-lab">Log spending</span>
                  <Soon id="bu-soon-sp" />
                </div>
              ) : addOpen ? (
                <form
                  className="bu-add-form"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveSpend();
                  }}
                  onBlur={(e) => {
                    const f = e.currentTarget;
                    later(150, () => {
                      if (!f.contains(document.activeElement) && !(f.querySelector('input') as HTMLInputElement | null)?.value.trim()) closeAdd(null);
                    });
                  }}
                >
                  <div className="bu-add-field">
                    <span className="bu-plus">
                      <Icon name="plus" />
                    </span>
                    <input
                      type="text"
                      enterKeyHint="done"
                      data-k="sp:in"
                      aria-label="New spending. Type the amount and what it paid for; a word like website sets the category."
                      placeholder="e.g. $45 domain renewal, website"
                      value={addText}
                      onChange={(e) => setAddText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') closeAdd('sp:open');
                      }}
                    />
                    <span className="bu-add-hint">Enter to save</span>
                  </div>
                  <div className="rf-chips bu-chips">
                    {parsed.dollars != null ? <span className="rf-pchip">{money(Math.round(parsed.dollars * 100))}</span> : null}
                    <label className="rf-pchip bu-ink bu-fsel">
                      <span>{pickCat ? catName(pickCat) : 'Pick a category'}</span>
                      <Icon name="down" />
                      <select
                        data-k="sp:cat"
                        aria-label="Category"
                        value={pickCat}
                        onChange={(e) => {
                          setAddCat(e.target.value);
                          setFocusK('sp:in');
                        }}
                      >
                        <option value="">Pick a category</option>
                        {view.cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="rf-pchip bu-ink">
                      <Icon name="cal" />
                      Today
                    </span>
                  </div>
                </form>
              ) : (
                <button type="button" className="bu-add-open" data-k="sp:open" onClick={() => openAdd()}>
                  <span className="bu-plus">
                    <Icon name="plus" />
                  </span>
                  <span className="bu-lab">Log spending</span>
                </button>
              )}
            </div>
          </Panel>
        </div>

        <div className="rf-col bu-col-b">
          {/* Funds on hand, and what the plan takes from it. */}
          <Panel id="bu-fH" title="Funds on hand">
            <div className="bu-pbody">
              {fundsEdit ? (
                <form
                  className="bu-inl"
                  autoComplete="off"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveFunds();
                  }}
                >
                  <label className="bu-money-in">
                    <span>$</span>
                    <input inputMode="decimal" aria-label="In the bank today" data-k="funds:in" value={fundsText} onChange={(e) => setFundsText(e.target.value)} />
                  </label>
                  <button type="submit" className="rf-btn" data-k="funds:save">
                    Save
                  </button>
                  <button
                    type="button"
                    className="rf-lnk"
                    onClick={() => {
                      setFundsEdit(false);
                      setFocusK('funds:edit');
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <p className="bu-fv">{funds ? money(funds.cents) : 'Not recorded yet'}</p>
              )}
              {fundsSaved ? (
                <Moment
                  undo={
                    <button type="button" className="rf-lnk" data-k="funds:undo" onClick={undoFunds}>
                      Undo
                    </button>
                  }
                >
                  Saved {fundsAt}
                </Moment>
              ) : (
                <p className="bu-fm">
                  {funds ? (
                    <>
                      Updated{' '}
                      <span title={fullDate(funds.asOf)}>{pastWord(view.today, funds.asOf).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}</span>
                      {funds.by ? (
                        <>
                          {' '}
                          by <span className="rf-nowrap">{funds.by.me ? 'you' : funds.by.name}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    'No balance logged yet'
                  )}
                  {fundsEdit ? null : view.caps.funds ? (
                    <>
                      &nbsp;·&nbsp;
                      <button type="button" className="rf-lnk" data-k="funds:edit" onClick={editFunds}>
                        Update
                      </button>
                    </>
                  ) : (
                    <>
                      &nbsp;·&nbsp;
                      <span className="bu-off">
                        <OffButton className="rf-lnk" describedBy="bu-soon-funds">
                          Update
                        </OffButton>
                        <Soon id="bu-soon-funds" />
                      </span>
                    </>
                  )}
                </p>
              )}
              {t.plan && funds?.cents ? (
                <>
                  <div className="bu-bar" role="img" aria-label={`The ${Q} plan is ${pct(t.plan, funds.cents)}% of funds on hand`}>
                    <span className={ok ? 'bu-gd' : 'bu-pl'} style={{ width: `${share}%` }} />
                  </div>
                  <p className="bu-fshare">
                    The {Q} plan is <b>{pct(t.plan, funds.cents)}%</b> of it.
                  </p>
                </>
              ) : null}
            </div>
          </Panel>

          {/* The Finance chat: the newest message and (mock) a reply field. */}
          <Panel
            id="bu-cH"
            title="Finance chat"
            className="bu-chat"
            action={
              <Link className="rf-lnk" href="/chat">
                Open chat
              </Link>
            }
          >
            {view.chat.failed ? (
              <StateLine kind="error" onRetry={retry}>
                Finance chat didn&apos;t load.
              </StateLine>
            ) : s.chat.length ? (
              s.chat.slice(-3).map((m) => <Msg key={m.id} by={m.by} time={msgTime(view.today, m.at)} body={m.body} />)
            ) : (
              <p className="bu-empty-line">No messages yet.</p>
            )}
            {chatSentAt ? (
              <p className="bu-sentline">
                Sent {clock(chatSentAt)}
              </p>
            ) : null}
            {view.caps.chat && !view.chat.failed ? (
              <form
                className="bu-reply"
                autoComplete="off"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
              >
                <input type="text" enterKeyHint="send" placeholder={chatPh} aria-label={chatPh} data-k="chat:in" value={chatText} onChange={(e) => setChatText(e.target.value)} />
                <button className="bu-send" type="submit" aria-label="Send" disabled={!chatText.trim()}>
                  <Icon name="send" />
                </button>
              </form>
            ) : null}
          </Panel>
        </div>
      </div>
      {live_}
    </div>
  );
}
