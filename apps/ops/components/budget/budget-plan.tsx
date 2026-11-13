'use client';

// The Q-plan panel, the heart of both Budget routes (demo p-budget planHTML). Left: the year as one bar (spent in ink, the
// plan still to spend in gold stripes, solid gold once approved), the plan's lines, and the one gold action (Approve, with
// Decline under a fold). Right: the steps of the plan's checklist and the comments on the approval step. On the board it
// spans the top and its title opens the approval route; on /finance/budget/approval it stands alone ("full").
// With no plan yet it draws "No Q4 plan to approve yet." and who drafts it (with a Nudge in mock mode).
// Live mode: Approve, Decline and Undo are drawn disabled with "Coming soon" (money writes stay off, owner 2026-10-12);
// the comment reply and the nudge are not drawn.
import Link from 'next/link';
import { Fold } from '@/components/refresh/fold';
import { Icon } from '@/components/refresh/icons';
import { doneWord, dueWord, money, msgTime, stepMarks, stepWhen, totals, yearCaption } from '@/lib/budget-map';
import { easternDay, fullDate } from '@/lib/refresh-time';
import type { BudgetView, BuCategory, BuComment, BuPlanStatus } from '@/lib/budget-view';
import { Moment, Msg, Name, OffButton, Soon, Who } from './budget-parts';

/** Everything the panel needs from the board: the data, the mock state, the open folds and the actions. */
export type PlanCtx = {
  mode: 'page' | 'full';
  view: BudgetView;
  cats: BuCategory[];
  status: BuPlanStatus;
  decidedAt: string | null;
  comments: { count: number; list: BuComment[] };
  live: boolean;
  /** "?demo=stress" in mock mode (kept on the links between the two routes), else "". */
  q: string;
  approving: boolean;
  declineOpen: boolean;
  allComments: boolean;
  nudge: 'none' | 'draft' | 'sending' | 'sent';
  reply: string;
  why: string;
  freshComment: string | null;
  onApprove: () => void;
  onToggleDecline: () => void;
  onCancelDecline: () => void;
  onSendDecline: () => void;
  onUndo: () => void;
  onShowAll: () => void;
  onReply: (v: string) => void;
  onSendReply: () => void;
  onWhy: (v: string) => void;
  onNudge: () => void;
  onCancelNudge: () => void;
  onSendNudge: () => void;
};

/** The approval page's link for this plan: live mode names the plan (?plan=<id>); mock mode keeps the demo flag. */
export function approvalHref(live: boolean, planId: string, q: string): string {
  return live && planId ? `/finance/budget/approval?plan=${encodeURIComponent(planId)}` : `/finance/budget/approval${q}`;
}

// The plan panel.
export function PlanPanel(c: PlanCtx) {
  const { view, mode } = c;
  const q = `Q${view.plan.quarter}`;
  const k = mode;
  if (c.status === 'none') return <NoPlan {...c} />;
  const waiting = c.status === 'waiting';
  const title =
    mode === 'full' ? (
      `${q} plan`
    ) : (
      <Link className="bu-tlink" href={approvalHref(c.live, view.plan.id, c.q)} data-k="page:open">
        {q} plan
      </Link>
    );
  return (
    <section id="bu-plan" tabIndex={-1} className={`rf-panel bu-plan bu-focus${waiting ? '' : ' bu-settled'}`} aria-labelledby="bu-planH">
      <div className="rf-ph">
        <h2 id="bu-planH">{title}</h2>
        {waiting && view.plan.due ? (
          <span className="bu-pm bu-due-r" title={`Due ${fullDate(view.plan.due)}`}>
            {dueWord(view.today, view.plan.due)}
          </span>
        ) : null}
      </div>
      <div className="rf-pcard">
        <div className="bu-pgrid">
          <div className="bu-pg-a">
            <YearBar {...c} />
            <Lines {...c} />
            <div className="bu-apfoot">
              <Actions {...c} k={k} />
            </div>
          </div>
          <div className="bu-pg-b">
            <Steps {...c} />
            <Comments {...c} k={k} />
          </div>
        </div>
      </div>
    </section>
  );
}

// No plan yet: the line, who drafts it, and (mock) the nudge with its draft.
function NoPlan(c: PlanCtx) {
  const { view } = c;
  const q = `Q${view.plan.quarter}`;
  const from = view.plan.from;
  const sent = c.nudge === 'sent';
  const canNudge = c.view.caps.nudge && !!from;
  return (
    <section id="bu-plan" tabIndex={-1} className="rf-panel bu-plan" aria-labelledby="bu-planH">
      <div className="rf-ph">
        <h2 id="bu-planH">{q} plan</h2>
      </div>
      <div className="rf-pcard">
        <div className="bu-pbody">
          <p className="bu-pe">No {q} plan to approve yet.</p>
          <div className={`bu-waitbar${sent ? ' bu-done' : ''}`}>
            {sent ? null : (
              <span className="bu-wt">
                <Icon name="wait" />
                <span>{from ? <><Name>{from.name}</Name> drafts it</> : 'Nobody is drafting it yet'}</span>
              </span>
            )}
            {canNudge ? (
              sent ? (
                <span className="bu-nudged">
                  <Icon name="check" />
                  Nudged just now
                </span>
              ) : (
                <button type="button" className="bu-nudge" aria-expanded={c.nudge === 'draft' || c.nudge === 'sending'} data-k={`${c.mode}:nudge`} onClick={c.onNudge}>
                  Nudge {from!.first}
                </button>
              )
            ) : null}
          </div>
        </div>
        {canNudge ? (
          <Fold open={c.nudge === 'draft' || c.nudge === 'sending'}>
            <div className="bu-pbody">
              <div className="bu-draft">
                <span className="bu-dl">
                  To <Name>{from!.name}</Name> in Board chat
                </span>
                <p className="bu-dtext">
                  Hi {from!.first}, could you draft the {q} plan when you get a chance? I&apos;ll approve it as soon as it&apos;s in.
                </p>
                <div className="bu-dact">
                  <button type="button" className="rf-btn" data-k={`${c.mode}:nsend`} disabled={c.nudge === 'sending'} onClick={c.onSendNudge}>
                    <Icon name="send" />
                    <span>{c.nudge === 'sending' ? 'Sending…' : 'Send'}</span>
                  </button>
                  <button type="button" className="rf-lnk" onClick={c.onCancelNudge}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Fold>
        ) : null}
      </div>
    </section>
  );
}

// The year as one bar, its key and the caption (leaves, uses the last of, or goes over the budget).
function YearBar(c: PlanCtx) {
  const t = totals(c.cats);
  const ok = c.status === 'approved';
  const base = Math.max(t.budget, t.after, 1);
  const cap = yearCaption(t);
  const q = `Q${c.view.plan.quarter}`;
  return (
    <>
      <div className={`bu-bar bu-thick${ok ? ' bu-ok' : ''}`} role="img" aria-label={`${c.view.year}: ${money(t.spent)} spent, ${money(t.left)} planned for ${q}, budget ${money(t.budget)}`}>
        <span className="bu-sp" style={{ width: `${(t.spent / base) * 100}%` }} />
        <span className="bu-pl" style={{ width: `${(t.left / base) * 100}%` }} />
        {cap.kind === 'over' ? <span className="bu-over" /> : null}
      </div>
      <p className="bu-key">
        <span>
          <i className="bu-sw bu-sp" />
          Spent so far <b>{money(t.spent)}</b>
        </span>
        <span>
          <i className={`bu-sw ${ok ? 'bu-gd' : 'bu-pl'}`} />
          {ok ? (
            <>
              {q} plan <b>{money(t.plan)}</b> approved
            </>
          ) : (
            `${q} plan`
          )}
        </span>
        <span className="bu-push">
          {cap.kind === 'over' ? (
            <>
              Goes <b>{money(cap.cents)}</b> over the {money(t.budget)} budget
            </>
          ) : cap.kind === 'exact' ? (
            `Uses the last of the ${money(t.budget)} budget`
          ) : (
            <>
              Leaves <b>{money(cap.cents)}</b> of the {money(t.budget)} budget
            </>
          )}
        </span>
      </p>
    </>
  );
}

// The plan's lines: name (with "New line"), amount, and a slim bar against the biggest line.
function Lines(c: PlanCtx) {
  const byId = new Map(c.cats.map((x) => [x.id, x]));
  const cs = c.view.lineOrder.map((id) => byId.get(id)).filter((x): x is BuCategory => !!x);
  const max = Math.max(1, ...cs.map((x) => x.planCents));
  return (
    <ul className="bu-lines">
      {cs.map((x) => (
        <li key={x.id}>
          <span className="bu-ln">
            {x.name}
            {x.isNew ? <span className="bu-newl">New line</span> : null}
          </span>
          <b>{money(x.planCents)}</b>
          <span className="bu-lt">
            <span style={{ width: `${(x.planCents / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Who the "Approved" line names. Mock mode: always "by you" (the demo). Live mode: "by you" only when the viewer decided it,
 * the person's name when someone else did, and no name at all when nobody is recorded (decided_by empty or deleted).
 */
export function approvedBy(live: boolean, decidedBy: { name: string; me: boolean } | null): string {
  if (!live) return 'Approved by you';
  if (!decidedBy) return 'Approved';
  return decidedBy.me ? 'Approved by you' : `Approved by ${decidedBy.name}`;
}

// The one gold action and what follows it: Approve / Decline (with the why), then "Approved by you · Undo" or "Sent back".
function Actions(c: PlanCtx & { k: string }) {
  const { view, k } = c;
  const t = totals(c.cats);
  const q = `Q${view.plan.quarter}`;
  const from = view.plan.from?.name ?? 'the drafter';
  const undo = view.caps.undo ? (
    <button type="button" className="rf-lnk" data-k={`${k}:aundo`} onClick={c.onUndo}>
      Undo
    </button>
  ) : (
    <span className="bu-off">
      <OffButton className="rf-lnk" describedBy={`bu-soon-${k}-undo`}>
        Undo
      </OffButton>
      <Soon id={`bu-soon-${k}-undo`} />
    </span>
  );
  if (c.status === 'approved') {
    const at = c.decidedAt;
    return (
      <Moment undo={undo}>
        {approvedBy(c.live, view.plan.decidedBy)}
        {at ? `, ${msgTime(view.today, at)}` : ''}
      </Moment>
    );
  }
  if (c.status === 'declined') {
    return (
      <>
        <Moment ink undo={undo}>
          Sent back to&nbsp;<Name>{from}</Name>
        </Moment>
        {c.live && view.plan.declineNote ? <p className="bu-note">{view.plan.declineNote}</p> : null}
      </>
    );
  }
  if (!view.caps.approve) {
    return (
      <div className="bu-ap-act bu-off">
        <OffButton className="rf-btn rf-btn-gold" describedBy={`bu-soon-${k}-ap`}>
          <Icon name="approve" />
          <span>
            Approve {money(t.plan)} for {q}
          </span>
        </OffButton>
        <OffButton className="rf-lnk" describedBy={`bu-soon-${k}-ap`}>
          Decline
        </OffButton>
        <Soon id={`bu-soon-${k}-ap`} />
      </div>
    );
  }
  return (
    <>
      <div className="bu-ap-act">
        <button type="button" className="rf-btn rf-btn-gold" data-k={`${k}:approve`} disabled={c.approving} onClick={c.onApprove}>
          <Icon name="approve" />
          <span>{c.approving ? 'Approving…' : `Approve ${money(t.plan)} for ${q}`}</span>
        </button>
        <button type="button" className="rf-lnk" aria-expanded={c.declineOpen} data-k={`${k}:decline`} onClick={c.onToggleDecline}>
          Decline
        </button>
      </div>
      <Fold open={c.declineOpen}>
        <div className="bu-why">
          <div className="bu-draft">
            <label className="bu-dl" htmlFor={`bu-why-${k}`}>
              To <Name>{from}</Name>: what should change?
            </label>
            <textarea id={`bu-why-${k}`} className="bu-dtext" rows={2} data-k={`${k}:why`} placeholder="Optional. It goes in as a comment." value={c.why} onChange={(e) => c.onWhy(e.target.value)} />
            <div className="bu-dact">
              <button type="button" className="rf-btn" data-k={`${k}:dsend`} onClick={c.onSendDecline}>
                Decline and send back
              </button>
              <button type="button" className="rf-lnk" onClick={c.onCancelDecline}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Fold>
    </>
  );
}

// The steps: "N of M done", the line of marks, then each step with its owner and when.
function Steps(c: PlanCtx) {
  const { view } = c;
  const { done, now } = stepMarks(view.steps, c.status);
  return (
    <section className="bu-qs" aria-labelledby="bu-stepsH">
      <h3 id="bu-stepsH">
        Steps <span className="bu-n">{view.steps.length ? `${done.filter(Boolean).length} of ${view.steps.length} done` : 'none yet'}</span>
      </h3>
      {view.steps.length ? (
        <>
          <div className="bu-cl-bar" aria-hidden="true">
            {done.map((d, i) => (
              <span key={i} className={d ? 'bu-on' : i === now ? 'bu-now' : ''} />
            ))}
          </div>
          <ol className="bu-qsteps">
            {view.steps.map((s, i) => {
              // The approval was done when it was decided (today in mock mode); other steps on their done day, else their due day.
              const day = s.approval ? (s.doneOn ?? (c.decidedAt ? easternDay(c.decidedAt) : view.today)) : (s.doneOn ?? s.due ?? view.today);
              return (
                <li key={s.id} className={`${done[i] ? 'bu-on' : ''}${i === now ? ' bu-now' : ''}`}>
                  <span className={`bu-ck${done[i] ? ' bu-on' : ''}`} aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  <span className="bu-qt">
                    <span className="bu-st">
                      {s.title}
                      {done[i] ? <span className="rf-sr"> (done)</span> : null}
                    </span>
                    <span className="bu-meta">
                      <Who who={s.who} />
                      <span aria-hidden="true">·</span>
                      {done[i] ? (
                        <span className="rf-nowrap" title={fullDate(day)}>
                          {doneWord(view.today, day)}
                        </span>
                      ) : s.due ? (
                        <time dateTime={s.due} title={fullDate(s.due)}>
                          {stepWhen(view.today, s.due)}
                        </time>
                      ) : (
                        <span>No date</span>
                      )}
                    </span>
                  </span>
                  {i === now ? <span className="bu-nowtag">Now</span> : null}
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </section>
  );
}

// The comments on the approval step: the last two, "N earlier · Show all", and (mock) the reply field.
function Comments(c: PlanCtx & { k: string }) {
  const { view, k } = c;
  const shown = c.allComments ? c.comments.list : c.comments.list.slice(-2);
  const earlier = c.comments.count - shown.length;
  const last = [...c.comments.list].reverse().find((x) => !x.by.me);
  const ph = last ? `Reply to ${last.by.name.split(' ')[0]}` : 'Add a comment';
  const cnt = (n: number) => (n > 99 ? '99+' : String(n));
  return (
    <section className="bu-cmts" aria-labelledby="bu-cmtsH">
      <h3 id="bu-cmtsH">
        Comments <span className="bu-n">{cnt(c.comments.count)}</span>
      </h3>
      {earlier > 0 && !c.allComments ? (
        <p className="bu-earlier">
          {cnt(earlier)} earlier ·{' '}
          <button type="button" className="rf-lnk" data-k={`${k}:allc`} onClick={c.onShowAll}>
            Show all
          </button>
        </p>
      ) : null}
      {shown.map((m) => (
        <Msg key={m.id} by={m.by} time={msgTime(view.today, m.at)} body={m.body} fresh={m.id === c.freshComment} />
      ))}
      {!shown.length && !view.caps.comment ? <p className="bu-earlier">No comments yet.</p> : null}
      {view.caps.comment ? (
        <form
          className="bu-reply"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            c.onSendReply();
          }}
        >
          <input type="text" enterKeyHint="send" placeholder={ph} aria-label={ph} data-k={`${k}:reply`} value={c.reply} onChange={(e) => c.onReply(e.target.value)} />
          <button className="bu-send" type="submit" aria-label="Send comment" disabled={!c.reply.trim()}>
            <Icon name="send" />
          </button>
        </form>
      ) : null}
    </section>
  );
}
