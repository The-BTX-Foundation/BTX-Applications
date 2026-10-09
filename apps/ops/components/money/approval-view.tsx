'use client';

// The phone's "Approving the Q4 budget" screen (Figma "Phone: approving the Q3 budget", now the Q4 plan): what the plan is,
// where each dollar goes, what it does to the 2026 budget, the comments, and the two buttons. The same plan as the Budget
// page and Today's "Approve Q4 budget" row (they share the state in use-budget.ts). On a laptop it is the same page in the
// normal layout. Only admin and board see the buttons.
import { useState } from 'react';
import Link from 'next/link';
import { OIcon } from '@/components/icons';
import { dateOnlyLabel, timeLabel } from '@/lib/format';
import { canUseMoney, totals, usd, type BudgetData } from '@/lib/money-shared';
import type { StaffRole } from '@/lib/role';
import { DeclineForm } from './budget-view';
import { Bar } from './ui';
import { useBudget } from './use-budget';

// The top bar of the screen: back, the screen's name and the avatar. It replaces the shell's logo bar on a phone.
export function ApprovalTop({ initials }: { initials: string }) {
  return (
    <header className="mn-aptop">
      <Link href="/money/budget" aria-label="Back to Budget" className="mn-back">
        <OIcon name="right" size={20} />
      </Link>
      <b>Approval</b>
      <span className="o-av" aria-hidden="true">
        {initials}
      </span>
    </header>
  );
}

// The order the plan's lines are listed in on this screen (the Figma frames); a category not listed goes last.
const LINE_ORDER = ['Scholarships', 'Certification program', 'Operations', 'Sponsorships', 'Outreach'];
const order = (name: string) => (LINE_ORDER.includes(name) ? LINE_ORDER.indexOf(name) : LINE_ORDER.length);

export function ApprovalView({ data, demo, role, initials }: { data: BudgetData; demo?: string; role: StaffRole; initials: string }) {
  const b = useBudget(data, demo);
  const { state: s } = b;
  const [declining, setDeclining] = useState(false);
  const can = canUseMoney(role);
  const t = totals(s.categories);
  const plan = data.plan;
  const approved = s.status === 'approved';
  const declined = s.status === 'declined';
  const steps = data.steps.map((x) => (x.kind === 'approval' ? approved : x.done));
  const doneN = steps.filter(Boolean).length;
  const next = data.steps.find((x, i) => !steps[i]);
  const after = t.spent + t.plan;
  const budgetLine =
    after > t.budget ? `This goes ${usd(after - t.budget)} over the ${usd(t.budget)} ${data.year} budget.` : after === t.budget ? `This uses the last ${usd(t.plan)} of the ${usd(t.budget)} ${data.year} budget.` : `This leaves ${usd(t.budget - after)} of the ${usd(t.budget)} ${data.year} budget.`;

  return (
    <div className="mn-ap">
      <ApprovalTop initials={initials} />
      <div className="mn-ap-body">
        <div className="mn-ap-h">
          <h1>Approve Q{plan.quarter} budget</h1>
          <p>
            Due {dateOnlyLabel(plan.due_on)} · from {plan.submitter}
          </p>
          <p>{`Q${plan.quarter} budget · ${doneN} of ${steps.length} done${declined ? ', now Approve' : next ? `, now ${next.now}` : ''}`}</p>
        </div>

        <section className="o-card mn-apcard" aria-label="The plan">
          <p>
            Q{plan.quarter} plan: <b>{usd(t.plan)}</b> for October to December.
          </p>
          {[...s.categories].sort((a, b) => order(a.short) - order(b.short)).map((c) => (
            <div key={c.id} className="mn-aprow">
              <div>
                <span>{c.short}</span>
                <b>{usd(c.q4_plan_cents)}</b>
              </div>
              <Bar pct={t.plan ? (c.q4_plan_cents / t.plan) * 100 : 0} />
            </div>
          ))}
        </section>
        <p className="mn-apnote">{budgetLine}</p>

        <section aria-labelledby="mn-apc">
          <h2 id="mn-apc" className="mn-apch">
            Comments {data.comments.count}
          </h2>
          {data.comments.list.map((c) => (
            <div key={c.id} className="mn-msg ph">
              <span className="o-av">{c.initials}</span>
              <div>
                <p>
                  <b>{c.name}</b> <span>{c.time}</span>
                </p>
                <p className="mn-bub">{c.body}</p>
              </div>
            </div>
          ))}
        </section>

        {b.error ? (
          <p className="mn-error" role="alert">
            {b.error}
          </p>
        ) : null}
      </div>

      {can ? (
        <div className="mn-apbar">
          {approved ? (
            <p>
              Approved by you, {timeLabel(s.decided_at ?? new Date().toISOString())}
              {' · '}
              <button type="button" className="mn-link" onClick={() => void b.reopen()}>
                Undo
              </button>
            </p>
          ) : declined ? (
            <p>
              Sent back to {plan.submitter}
              {' · '}
              <button type="button" className="mn-link" onClick={() => void b.reopen()}>
                Undo
              </button>
            </p>
          ) : declining ? (
            <DeclineForm
              to={plan.submitter}
              busy={b.busy}
              onCancel={() => setDeclining(false)}
              onSend={(note) => {
                void b.decline(note);
                setDeclining(false);
              }}
            />
          ) : (
            <div className="mn-apbtns">
              <button type="button" className="o-btn p" disabled={b.busy} onClick={() => void b.approve()}>
                {`Approve ${usd(t.plan)} for Q${plan.quarter}`}
              </button>
              <button type="button" className="o-btn s" disabled={b.busy} onClick={() => setDeclining(true)}>
                Decline
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
