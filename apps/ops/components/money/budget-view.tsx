'use client';

// Finance > Budget (Figma "Money > Budget" laptop and phone): funds on hand, the 2026 budget by category, recent spending, the
// Q4 budget checklist with its approval, and the Finance chat. Data: lib/budget.ts (mock or live).
// Every action that writes (log or edit spending, update funds on hand, approve, decline or undo the quarter plan) is
// "Coming soon" for now (owner, 2026-10-12): a disabled control with a small label (./soon.tsx).
import { useState } from 'react';
import Link from 'next/link';
import { OIcon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Ring } from '@/components/ring';
import { dateOnlyLabel, timeLabel } from '@/lib/format';
import { pct, totals, usd, type BudgetData, type BudgetStep } from '@/lib/money-shared';
import { Bar, PeriodChip, Tick } from './ui';
import { SoonButtons, SoonHeaderAction, SoonLink } from './soon';
import { useBudget } from './use-budget';

// "$3,410 Over by $410" vs "$860 of $1,200": what a category has spent against its budget.
function used(spent: number, budget: number) {
  const over = spent > budget;
  return { over, pct: pct(spent, budget), overBy: spent - budget };
}

// The decline form that opens inside the approval row (and on the phone screen).
export function DeclineForm({ to, onSend, onCancel, busy }: { to: string; onSend: (note: string) => void; onCancel: () => void; busy?: boolean }) {
  const [note, setNote] = useState('');
  return (
    <div className="mn-decl">
      <label>
        <b>What should change?</b>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Tell ${to} what to change`} rows={3} />
      </label>
      <p>The step goes back to {to} with your note as a comment.</p>
      <div className="mn-qa">
        <button type="button" className="o-btn p mn-b36" disabled={busy || note.trim() === ''} onClick={() => onSend(note.trim())}>
          Send decline
        </button>
        <button type="button" className="o-btn s mn-b36" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function BudgetView({ data, demo }: { data: BudgetData; demo?: string }) {
  const b = useBudget(data, demo);
  const { state: s } = b;
  const t = totals(s.categories);
  const plan = data.plan;
  const approved = s.status === 'approved';
  const declined = s.status === 'declined';

  // The checklist: the approval step is done once the plan is approved.
  const steps: (BudgetStep & { isDone: boolean })[] = data.steps.map((x) => ({ ...x, isDone: x.kind === 'approval' ? approved : x.done }));
  const doneN = steps.filter((x) => x.isDone).length;
  const next = steps.find((x) => !x.isDone);
  const nowLabel = declined ? 'Approve' : next?.now;
  const checkLine = `${doneN} of ${steps.length} done${nowLabel ? `, now ${nowLabel}` : ''}`;
  const planCents = t.plan;
  const approveLabel = `Approve ${usd(planCents)} for Q4`;
  const approvalHref = `/finance/budget/approval${demo ? `?demo=${demo}` : ''}`;
  const planLine = (
    <>
      Q{plan.quarter} plan: <b>{usd(planCents)}</b> for October to December.{plan.note ? ` ${plan.note}` : ''}
    </>
  );

  const noPlan = plan.status === 'draft';
  const sub = noPlan
    ? `Q3 closed at ${usd(data.q3_spent_cents)} spent · No Q4 plan to approve yet`
    : approved
    ? `Q3 closed at ${usd(data.q3_spent_cents)} spent · Q4 plan is approved`
    : declined
      ? `Q3 closed at ${usd(data.q3_spent_cents)} spent · Q4 plan went back to ${plan.submitter}`
      : `Q3 closed at ${usd(data.q3_spent_cents)} spent · Q4 plan waits for your approval${plan.due_on ? `, due ${dateOnlyLabel(plan.due_on)}` : ''}`;

  return (
    <>
      <PageHeader
        title="Budget"
        sub={
          <>
            <span className="o-lg">{sub}</span>
            <span className="o-ph">{`Finance · ${usd(t.spent)} of ${usd(t.budget)} spent`}</span>
          </>
        }
        actionsClass="mn-acts"
      >
        <span className="o-lg">
          <PeriodChip year={data.year} />
        </span>
        <SoonHeaderAction label="Log spending" />
      </PageHeader>
      <div className="o-ph mn-chiprow">
        <PeriodChip year={data.year} phone />
      </div>

      {b.error ? (
        <p className="mn-error" role="alert">
          {b.error}
        </p>
      ) : null}

      <section className="o-card mn-funds" aria-label="Funds on hand" data-review="Funds on hand" data-review-private>
        <p className="mn-funds-l">Funds on hand</p>
        <p className="mn-funds-v">{usd(s.funds.cents)}</p>
        <p className="mn-funds-n">
          Updated {dateOnlyLabel(s.funds.as_of)} by {s.funds.by}
          <span className="o-ph"> · </span>
          <br className="o-lg" />
          <SoonLink label="Update" />
        </p>
      </section>

      <Link href={approvalHref} className="o-card mn-q4card o-ph" aria-label="Q4 budget">
        <Ring frac={steps.length ? doneN / steps.length : 0} label={`${doneN}/${steps.length}`} color="gold" size={32} />
        <span className="mn-q4card-t">
          <b>Q4 budget</b>
          <span>
            {checkLine}
            {!approved && !declined ? ` · due ${dateOnlyLabel(plan.due_on)}` : ''}
          </span>
        </span>
        {!approved && !declined ? <span className="mn-need">Needs you</span> : null}
        <OIcon name="right" size={18} />
      </Link>

      <div className="mn-cols">
        <div className="mn-lc">
          <section className="o-card mn-panel mn-cat o-lg" aria-labelledby="mn-cat-h" data-review="Budget by category" data-review-private>
            <div className="mn-ph">
              <h2 id="mn-cat-h">2026 budget by category</h2>
              <span>Spent so far and the Q4 plan</span>
            </div>
            <div className="mn-th mn-catrow">
              <span>Category</span>
              <span className="r">2026 budget</span>
              <span className="r">Spent so far</span>
              <span className="r">Q4 plan</span>
              <span>Used</span>
            </div>
            {s.categories.map((c) => {
              const u = used(c.spent_cents, c.budget_cents);
              return (
                <div key={c.id} className="mn-tr mn-catrow">
                  <b>{c.name}</b>
                  <span className="r">{usd(c.budget_cents)}</span>
                  <span className="r">{usd(c.spent_cents)}</span>
                  <span className="r">{usd(c.q4_plan_cents)}</span>
                  <span className="mn-used">
                    <Bar pct={u.over ? 100 : u.pct} />
                    <span>{u.over ? `Over by ${usd(u.overBy)}` : `${u.pct}% used`}</span>
                  </span>
                </div>
              );
            })}
            <div className="mn-tr mn-catrow tot">
              <b>Total</b>
              <span className="r">{usd(t.budget)}</span>
              <span className="r">{usd(t.spent)}</span>
              <span className="r">{usd(t.plan)}</span>
              <span className="mn-used">
                <Bar pct={pct(t.spent, t.budget)} />
                <span>{pct(t.spent, t.budget)}% used</span>
              </span>
            </div>
          </section>

          <section className="o-card mn-cat-ph o-ph" aria-label="By category" data-review="Budget by category" data-review-private>
            <div className="mn-ph">
              <h2>By category</h2>
              <span>Spent of {data.year} budget</span>
            </div>
            {s.categories.map((c) => {
              const u = used(c.spent_cents, c.budget_cents);
              return (
                <div key={c.id} className="mn-cprow">
                  <div>
                    <b>{c.phone}</b>
                    <span className="mn-camt">
                      <b>{usd(c.spent_cents)}</b> {u.over ? `Over by ${usd(u.overBy)}` : `of ${usd(c.budget_cents)}`}
                    </span>
                  </div>
                  <Bar pct={u.over ? 100 : u.pct} />
                </div>
              );
            })}
          </section>

          <section className="o-card mn-panel mn-recent" aria-labelledby="mn-rec-h" data-review="Recent spending" data-review-private>
            <div className="mn-ph">
              <h2 id="mn-rec-h">Recent spending</h2>
              <span className="o-lg">Last 5</span>
              <Link href="/finance/budget" className="mn-seeall">
                See all
              </Link>
            </div>
            <div className="mn-th mn-recrow o-lg">
              <span>Date</span>
              <span>What it paid for</span>
              <span>Category</span>
              <span className="r">Amount</span>
            </div>
            {s.recent.map((r) => {
              const cells = (
                <>
                  <span>{r.spent_on ? dateOnlyLabel(r.spent_on) : '[date]'}</span>
                  <span>{r.description || '[what it paid for]'}</span>
                  <span>{r.category || '[category]'}</span>
                  <b className="r">{r.amount_cents != null ? usd(r.amount_cents) : '[amount]'}</b>
                </>
              );
              return (
                <div key={r.id} className="mn-tr mn-recrow">
                  {cells}
                </div>
              );
            })}
          </section>
        </div>

        <div className="mn-rc o-lg">
          <section className="o-card mn-panel mn-q4" aria-labelledby="mn-q4-h" data-review="Q4 budget checklist" data-review-private>
            <div className="mn-q4h">
              <Ring frac={steps.length ? doneN / steps.length : 0} label={`${doneN}/${steps.length}`} color="gold" size={44} />
              <div>
                <h2 id="mn-q4-h">Q4 budget</h2>
                <p>{checkLine}</p>
              </div>
            </div>
            {steps.map((x) => {
              const meta = `${x.owner} · ${dateOnlyLabel(x.due_on)}`;
              if (x.kind === 'approval' && !approved) {
                return (
                  <div key={x.id} className="mn-qs cur">
                    <Tick current />
                    <div className="mn-qs-b">
                      <p className="mn-qs-t">
                        <b>{x.title}</b>
                        {declined ? null : <span className="mn-need out">Needs you</span>}
                        <span className="mn-cm">
                          <OIcon name="chat" size={18} />
                          {data.comments.count}
                        </span>
                      </p>
                      <p className="mn-qs-m">{declined ? `Sent back to ${plan.submitter}` : meta}</p>
                      {declined ? (
                        <>
                          <p className="mn-qs-d">{s.decline_note}</p>
                          <SoonButtons secondary="Undo" small />
                        </>
                      ) : (
                        <>
                          <p className="mn-qs-d">{planLine}</p>
                          <SoonButtons primary={approveLabel} secondary="Decline" small />
                        </>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={x.id} className="mn-qs">
                  <Tick done={x.isDone} />
                  <div className="mn-qs-b">
                    <p className="mn-qs-t">
                      <b>{x.title}</b>
                    </p>
                    <p className="mn-qs-m">
                      {x.kind === 'approval' ? (
                        <>
                          Approved by {s.decided_at && data.plan.decided_by && data.plan.decided_by !== data.me ? 'someone else' : 'you'}, {timeLabel(s.decided_at ?? new Date().toISOString())}
                          {' · '}
                          <SoonLink label="Undo" />
                        </>
                      ) : (
                        meta
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="o-card mn-panel mn-chat" aria-labelledby="mn-ch-h" data-review="Finance chat" data-review-private>
            <div className="mn-ph">
              <h2 id="mn-ch-h">Finance chat</h2>
              <Link href="/chat" className="mn-seeall">
                Open Finance chat
              </Link>
            </div>
            <div className="mn-chat-b">
              {data.chat ? (
              <div className="mn-msg">
                <span className="mn-av big">{data.chat.initials}</span>
                <div>
                  <p>
                    <b>{data.chat.name}</b> <span>{data.chat.time}</span>
                  </p>
                  <p className="mn-bub">{data.chat.body}</p>
                </div>
              </div>
              ) : (
                <p className="mn-bub">No messages yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>

    </>
  );
}
